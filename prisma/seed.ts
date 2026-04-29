import { PrismaClient, type ClassificationType } from '@prisma/client';
import { createCipheriv, randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

function encrypt(plaintext: string, hexKey: string): string {
  const key = Buffer.from(hexKey, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

function dateBucketUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

interface QueryFixture {
  q: string;
  occurrence: number;
  resultCount: number;
  clickCount: number;
  type: ClassificationType;
  matchedTitles?: string[];
  estimateUsd: number;
}

const PRODUCT_FIXTURES = [
  { title: 'Classic Crewneck Tee', handle: 'classic-crewneck-tee', productType: 'Apparel', vendor: 'House Brand' },
  { title: 'Heavyweight Hoodie', handle: 'heavyweight-hoodie', productType: 'Apparel', vendor: 'House Brand' },
  { title: 'Chino Shorts', handle: 'chino-shorts', productType: 'Apparel', vendor: 'House Brand' },
  { title: 'Canvas Sneakers', handle: 'canvas-sneakers', productType: 'Footwear', vendor: 'House Brand' },
  { title: 'Leather Belt', handle: 'leather-belt', productType: 'Accessories', vendor: 'House Brand' },
  { title: 'Wool Beanie', handle: 'wool-beanie', productType: 'Accessories', vendor: 'House Brand' },
  { title: 'Crossbody Bag', handle: 'crossbody-bag', productType: 'Bags', vendor: 'House Brand' },
  { title: 'Stainless Water Bottle', handle: 'stainless-water-bottle', productType: 'Lifestyle', vendor: 'House Brand' },
  { title: 'Ceramic Mug 12oz', handle: 'ceramic-mug', productType: 'Lifestyle', vendor: 'House Brand' },
  { title: 'Embroidered Cap', handle: 'embroidered-cap', productType: 'Accessories', vendor: 'House Brand' },
  { title: 'Quilted Vest', handle: 'quilted-vest', productType: 'Outerwear', vendor: 'House Brand' },
  { title: 'Linen Button-Down', handle: 'linen-button-down', productType: 'Apparel', vendor: 'House Brand' },
];

// Matches the engine taxonomy:
// TYPE_1 = no matching product (missing-catalog gap → highest revenue impact)
// TYPE_2 = matches exist but ranking/relevance failure (zero clicks)
// TYPE_3 = matches AND clicks but low conversion (tail / niche)
// TYPE_4 = healthy, well-served (rendered as "OK" in UI, not a gap)
const QUERY_FIXTURES: QueryFixture[] = [
  // TYPE_1 — missing product opportunities
  { q: 'organic cotton tshirt', occurrence: 92, resultCount: 0, clickCount: 0, type: 'TYPE_1', estimateUsd: 412 },
  { q: 'vegan leather wallet', occurrence: 71, resultCount: 0, clickCount: 0, type: 'TYPE_1', estimateUsd: 318 },
  { q: 'waterproof daypack', occurrence: 64, resultCount: 0, clickCount: 0, type: 'TYPE_1', estimateUsd: 287 },
  { q: 'merino socks', occurrence: 58, resultCount: 0, clickCount: 0, type: 'TYPE_1', estimateUsd: 261 },
  { q: 'reusable produce bags', occurrence: 47, resultCount: 0, clickCount: 0, type: 'TYPE_1', estimateUsd: 211 },
  { q: 'bamboo toothbrush', occurrence: 41, resultCount: 0, clickCount: 0, type: 'TYPE_1', estimateUsd: 184 },
  { q: 'silk pillowcase', occurrence: 38, resultCount: 0, clickCount: 0, type: 'TYPE_1', estimateUsd: 171 },
  { q: 'travel cubes', occurrence: 33, resultCount: 0, clickCount: 0, type: 'TYPE_1', estimateUsd: 148 },
  { q: 'recycled polyester jacket', occurrence: 29, resultCount: 0, clickCount: 0, type: 'TYPE_1', estimateUsd: 130 },
  { q: 'biodegradable phone case', occurrence: 24, resultCount: 0, clickCount: 0, type: 'TYPE_1', estimateUsd: 108 },

  // TYPE_2 — results but zero clicks (relevance / ranking issue)
  { q: 'tee shirt', occurrence: 124, resultCount: 18, clickCount: 0, type: 'TYPE_2', matchedTitles: ['Classic Crewneck Tee'], estimateUsd: 188 },
  { q: 'sweat shirt', occurrence: 86, resultCount: 14, clickCount: 0, type: 'TYPE_2', matchedTitles: ['Heavyweight Hoodie'], estimateUsd: 131 },
  { q: 'short pant', occurrence: 71, resultCount: 9, clickCount: 0, type: 'TYPE_2', matchedTitles: ['Chino Shorts'], estimateUsd: 108 },
  { q: 'plain sneaker', occurrence: 62, resultCount: 7, clickCount: 0, type: 'TYPE_2', matchedTitles: ['Canvas Sneakers'], estimateUsd: 94 },
  { q: 'mens belt', occurrence: 53, resultCount: 5, clickCount: 0, type: 'TYPE_2', matchedTitles: ['Leather Belt'], estimateUsd: 81 },
  { q: 'winter cap', occurrence: 48, resultCount: 6, clickCount: 0, type: 'TYPE_2', matchedTitles: ['Wool Beanie', 'Embroidered Cap'], estimateUsd: 73 },
  { q: 'sling bag', occurrence: 39, resultCount: 4, clickCount: 0, type: 'TYPE_2', matchedTitles: ['Crossbody Bag'], estimateUsd: 59 },
  { q: 'metal flask', occurrence: 31, resultCount: 3, clickCount: 0, type: 'TYPE_2', matchedTitles: ['Stainless Water Bottle'], estimateUsd: 47 },

  // TYPE_3 — results AND clicks but very low CTR (tail/niche)
  { q: 'mug coffee', occurrence: 44, resultCount: 8, clickCount: 3, type: 'TYPE_3', matchedTitles: ['Ceramic Mug 12oz'], estimateUsd: 36 },
  { q: 'puffer vest', occurrence: 28, resultCount: 5, clickCount: 2, type: 'TYPE_3', matchedTitles: ['Quilted Vest'], estimateUsd: 28 },
  { q: 'linen shirt mens', occurrence: 22, resultCount: 4, clickCount: 1, type: 'TYPE_3', matchedTitles: ['Linen Button-Down'], estimateUsd: 22 },

  // TYPE_4 — healthy
  { q: 'classic crewneck tee', occurrence: 18, resultCount: 6, clickCount: 4, type: 'TYPE_4', matchedTitles: ['Classic Crewneck Tee'], estimateUsd: 0 },
  { q: 'heavyweight hoodie', occurrence: 15, resultCount: 4, clickCount: 3, type: 'TYPE_4', matchedTitles: ['Heavyweight Hoodie'], estimateUsd: 0 },
];

async function main(): Promise<void> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !/^[0-9a-f]{64}$/i.test(secret)) {
    throw new Error('SESSION_SECRET must be set to 64 hex chars before seeding');
  }

  // Use the live dev-store from .env when present so onboarding state attaches
  // to the actual installed Store row (instead of a parallel demo row).
  const shopDomain = process.env.DEV_SHOP_DOMAIN || 'dev-store.myshopify.com';

  // --- Store ---
  const store = await prisma.store.upsert({
    where: { shopDomain },
    create: {
      shopDomain,
      accessToken: encrypt('shpat_dev_fake_token_for_ui_only', secret),
      scope: 'read_products,read_content,read_orders',
      plan: 'GROWTH',
      aovCents: 6800,
      currency: 'USD',
      timezone: 'UTC',
      category: 'FASHION',
      industry: 'Apparel & Accessories',
      lastProductSync: new Date(),
      lastOrderSync: new Date(),
      lastSearchSync: new Date(),
      firstDashboardViewAt: new Date(Date.now() - 3 * 86400_000),
    },
    update: {
      plan: 'GROWTH',
      category: 'FASHION',
      aovCents: 6800,
      currency: 'USD',
      industry: 'Apparel & Accessories',
      lastProductSync: new Date(),
      lastOrderSync: new Date(),
      lastSearchSync: new Date(),
    },
  });

  // --- Wipe prior demo rows so seed is idempotent + deterministic ---
  await prisma.revenueEstimate.deleteMany({ where: { classification: { storeId: store.id } } });
  await prisma.classification.deleteMany({ where: { storeId: store.id } });
  await prisma.searchQuery.deleteMany({ where: { storeId: store.id } });
  await prisma.catalogProduct.deleteMany({ where: { storeId: store.id } });
  await prisma.ingestionRun.deleteMany({ where: { storeId: store.id } });

  // --- Catalog products ---
  const products = await Promise.all(
    PRODUCT_FIXTURES.map((p, i) =>
      prisma.catalogProduct.create({
        data: {
          storeId: store.id,
          shopifyProductId: `gid://shopify/Product/${1000 + i}`,
          title: p.title,
          handle: p.handle,
          productType: p.productType,
          vendor: p.vendor,
          tags: [p.productType.toLowerCase()],
          status: 'ACTIVE',
          shopifyUpdatedAt: new Date(),
        },
      }),
    ),
  );
  const productByTitle = new Map(products.map((p) => [p.title, p]));

  // --- Search queries: each fixture spread across multiple day buckets so the
  // dashboard's last-30d window has volume on most days, not all on one date.
  const now = new Date();
  for (const f of QUERY_FIXTURES) {
    const norm = f.q.toLowerCase().replace(/\s+/g, ' ').trim();
    // Spread occurrences across 12 random buckets in the last 30 days.
    const buckets = 12;
    const perBucket = Math.max(1, Math.floor(f.occurrence / buckets));
    for (let i = 0; i < buckets; i += 1) {
      const daysAgo = Math.floor(Math.random() * 30);
      const occurredAt = new Date(now.getTime() - daysAgo * 86400_000 - Math.random() * 86400_000);
      const bucket = dateBucketUTC(occurredAt);
      await prisma.searchQuery.upsert({
        where: { uniq_store_query_bucket: { storeId: store.id, queryNormalized: norm, dateBucket: bucket } },
        create: {
          storeId: store.id,
          query: f.q,
          queryNormalized: norm,
          occurredAt,
          dateBucket: bucket,
          resultCount: f.resultCount,
          clickCount: Math.round((f.clickCount / f.occurrence) * perBucket),
          occurrenceCount: perBucket,
        },
        update: {
          occurrenceCount: { increment: perBucket },
        },
      });
    }
  }

  // --- Classifications + revenue estimates ---
  for (const f of QUERY_FIXTURES) {
    const norm = f.q.toLowerCase().replace(/\s+/g, ' ').trim();
    const matchedIds = (f.matchedTitles ?? [])
      .map((t) => productByTitle.get(t)?.id)
      .filter((x): x is string => Boolean(x));
    const cls = await prisma.classification.create({
      data: {
        storeId: store.id,
        queryNorm: norm,
        type: f.type,
        confidence: f.type === 'TYPE_1' ? 0.95 : 0.78,
        matchedProductIds: matchedIds,
        occurrenceCount: f.occurrence,
        lowVolume: f.occurrence < 30,
        reasoning: { source: 'seed', notes: 'demo data' },
      },
    });
    if (f.estimateUsd > 0) {
      const cents = f.estimateUsd * 100;
      await prisma.revenueEstimate.create({
        data: {
          classificationId: cls.id,
          monthlyVolume: f.occurrence,
          aovCents: 6800,
          benchmarkPct: f.type === 'TYPE_1' ? 0.06 : 0.025,
          estimateCents: cents,
          bandLowCents: Math.round(cents * 0.7),
          bandHighCents: Math.round(cents * 1.3),
        },
      });
    }
  }

  // --- Ingestion runs marked DONE so the "first-time sync" banner clears ---
  for (const jobType of ['INGEST_PRODUCTS', 'INGEST_ORDERS', 'INGEST_SEARCH'] as const) {
    await prisma.ingestionRun.create({
      data: {
        storeId: store.id,
        jobType,
        status: 'DONE',
        progressPct: 100,
        startedAt: new Date(Date.now() - 600_000),
        finishedAt: new Date(Date.now() - 60_000),
      },
    });
  }

  console.log(`Seeded ${shopDomain}`);
  console.log(`  ${products.length} products`);
  console.log(`  ${QUERY_FIXTURES.length} unique queries (with multi-day occurrences)`);
  console.log(`  ${QUERY_FIXTURES.length} classifications`);
  console.log(`  Plan: GROWTH, Category: FASHION, AOV: $68`);
  console.log(`Open http://localhost:3000 to view the dashboard`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
