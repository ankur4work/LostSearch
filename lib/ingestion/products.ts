import type { Store } from '@prisma/client';
import { ShopifyClient } from '../shopify/client';
import { runBulkQuery } from '../shopify/bulk';
import { prisma } from '../prisma';
import { logger } from '../logger';
import { embedBatch, toVectorLiteral } from './embeddings';
import { updateProgress } from './runs';

const MIN_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Bulk queries must use `connections` rather than ordinary pagination; results
// stream back as one JSONL line per product, then subsequent lines for each
// child (variants). Parent `id` is the product; child lines have `__parentId`.
const BULK_QUERY = /* GraphQL */ `
  {
    products {
      edges {
        node {
          id
          title
          handle
          productType
          vendor
          tags
          descriptionHtml
          status
          updatedAt
          options { name values }
          variants {
            edges {
              node { id title sku price }
            }
          }
        }
      }
    }
  }
`;

interface BulkProduct {
  id: string;
  title: string;
  handle: string;
  productType: string | null;
  vendor: string | null;
  tags: string[];
  descriptionHtml: string | null;
  status: string | null;
  updatedAt: string;
  options?: Array<{ name: string; values: string[] }>;
  __parentId?: string;
}

interface BulkVariant {
  id: string;
  title: string | null;
  sku: string | null;
  price: string | null;
  __parentId: string;
}

type BulkLine = BulkProduct | BulkVariant;

function stripHtml(html: string | null): string {
  if (!html) return '';
  const noTags = html.replace(/<[^>]+>/g, ' ');
  const decoded = noTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return decoded.replace(/\s+/g, ' ').trim();
}

function buildEmbeddingText(p: {
  title: string;
  tags: string[];
  productType: string | null;
  vendor: string | null;
}): string {
  return [p.title, p.productType, p.vendor, p.tags.join(' ')]
    .filter((s): s is string => Boolean(s))
    .join(' | ')
    .slice(0, 512);
}

export interface ProductsIngestionResult {
  productsWritten: number;
  skipped: boolean;
}

export async function ingestProducts(
  store: Store,
  opts: { force?: boolean; runId?: string } = {},
): Promise<ProductsIngestionResult> {
  if (!opts.force && store.lastProductSync) {
    const age = Date.now() - store.lastProductSync.getTime();
    if (age < MIN_SYNC_INTERVAL_MS) {
      logger.info(
        { shop: store.shopDomain, ageMs: age },
        'Skipping product sync (< 24h since last)',
      );
      return { productsWritten: 0, skipped: true };
    }
  }

  const client = new ShopifyClient(store);
  const products = new Map<string, BulkProduct>();
  const variantsByParent = new Map<string, BulkVariant[]>();

  const { objectCount } = await runBulkQuery<BulkLine>(client, BULK_QUERY, (line) => {
    if ('__parentId' in line && line.__parentId && !('title' in line && 'handle' in line)) {
      const v = line as BulkVariant;
      const list = variantsByParent.get(v.__parentId) ?? [];
      list.push(v);
      variantsByParent.set(v.__parentId, list);
      return;
    }
    const p = line as BulkProduct;
    products.set(p.id, p);
  });

  logger.info(
    { shop: store.shopDomain, products: products.size, bulkObjects: objectCount },
    'Bulk product fetch complete, writing rows',
  );

  const EMBED_BATCH = 32;
  const productArray = Array.from(products.values());
  let written = 0;

  for (let batchStart = 0; batchStart < productArray.length; batchStart += EMBED_BATCH) {
    const batch = productArray.slice(batchStart, batchStart + EMBED_BATCH);
    const embedTexts = batch.map(buildEmbeddingText);
    const vectors = await embedBatch(embedTexts);

    for (const [j, p] of batch.entries()) {
      const variants = variantsByParent.get(p.id) ?? [];
      const descText = stripHtml(p.descriptionHtml);
      const embedText = embedTexts[j]!;
      const vector = vectors[j]!;

      await prisma.$transaction(async (tx) => {
        const row = await tx.catalogProduct.upsert({
          where: {
            storeId_shopifyProductId: { storeId: store.id, shopifyProductId: p.id },
          },
          create: {
            storeId: store.id,
            shopifyProductId: p.id,
            title: p.title,
            handle: p.handle,
            productType: p.productType,
            vendor: p.vendor,
            tags: p.tags,
            description: p.descriptionHtml,
            descriptionText: descText,
            variantsJson: variants as unknown as object,
            optionsJson: (p.options ?? []) as unknown as object,
            status: p.status,
            embeddingText: embedText,
            shopifyUpdatedAt: new Date(p.updatedAt),
            syncedAt: new Date(),
          },
          update: {
            title: p.title,
            handle: p.handle,
            productType: p.productType,
            vendor: p.vendor,
            tags: p.tags,
            description: p.descriptionHtml,
            descriptionText: descText,
            variantsJson: variants as unknown as object,
            optionsJson: (p.options ?? []) as unknown as object,
            status: p.status,
            embeddingText: embedText,
            shopifyUpdatedAt: new Date(p.updatedAt),
            syncedAt: new Date(),
          },
        });
        await tx.$executeRawUnsafe(
          `UPDATE catalog_products SET embedding = $1::vector WHERE id = $2`,
          toVectorLiteral(vector),
          row.id,
        );
      });
      written += 1;
    }

    if (opts.runId) {
      await updateProgress(opts.runId, ((batchStart + batch.length) / productArray.length) * 100);
    }
  }

  await prisma.store.update({
    where: { id: store.id },
    data: { lastProductSync: new Date() },
  });

  return { productsWritten: written, skipped: false };
}
