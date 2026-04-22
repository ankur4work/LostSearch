import { z } from 'zod';
import type { Store } from '@prisma/client';
import { ShopifyClient } from '../shopify/client';
import { prisma } from '../prisma';
import { logger } from '../logger';
import { normalizeQuery, dateBucketUTC } from './normalize';
import { updateProgress } from './runs';

// ShopifyQL over `online_store_search_analytics` — this table is populated by
// Shopify once the Search & Discovery app is enabled on the shop. If it's not,
// the API returns no rows (we handle that as an empty-but-successful run).
//
// Docs: https://shopify.dev/docs/api/shopifyql/shopifyql-reference/search-analytics
const SEARCH_QUERY = /* GraphQL */ `
  query SearchAnalytics($shopifyql: String!) {
    shopifyqlQuery(query: $shopifyql) {
      __typename
      ... on TableResponse {
        tableData {
          unformattedData
          columns { name dataType }
        }
      }
      parseErrors { code message }
    }
  }
`;

const RowSchema = z.tuple([
  z.string(),                 // query
  z.number().int().nonnegative(), // search_count
  z.number().int().nonnegative(), // click_count
  z.number().int().nonnegative(), // no_result_count
]);

interface TableResponse {
  shopifyqlQuery: {
    __typename: string;
    tableData?: {
      unformattedData: unknown[][];
      columns: Array<{ name: string; dataType: string }>;
    };
    parseErrors?: Array<{ code: string; message: string }>;
  };
}

export interface SearchIngestionOptions {
  sinceDays: number;
  runId?: string;
}

export async function ingestSearchAnalytics(
  store: Store,
  opts: SearchIngestionOptions,
): Promise<{ rowsWritten: number; enabled: boolean }> {
  const client = new ShopifyClient(store);

  const shopifyql = `
    FROM online_store_search_analytics
    SHOW search_count, click_count, no_result_count
    GROUP BY query_text
    SINCE -${opts.sinceDays}d UNTIL today
    ORDER BY search_count DESC
    LIMIT 5000
  `;

  const resp = await client.graphql<TableResponse>(SEARCH_QUERY, { shopifyql });

  if (resp.errors?.length) {
    const missing = resp.errors.some((e) =>
      e.message.toLowerCase().includes('search_analytics') ||
      e.message.toLowerCase().includes('not enabled'),
    );
    if (missing) {
      logger.warn(
        { shop: store.shopDomain },
        'Search & Discovery not enabled — skipping search analytics ingestion',
      );
      return { rowsWritten: 0, enabled: false };
    }
    throw new Error(`shopifyqlQuery errors: ${resp.errors.map((e) => e.message).join('; ')}`);
  }

  const parseErrors = resp.data?.shopifyqlQuery.parseErrors;
  if (parseErrors && parseErrors.length > 0) {
    throw new Error(
      `ShopifyQL parse errors: ${parseErrors.map((e) => `${e.code}:${e.message}`).join('; ')}`,
    );
  }

  const rows = resp.data?.shopifyqlQuery.tableData?.unformattedData ?? [];
  if (rows.length === 0) {
    logger.info({ shop: store.shopDomain }, 'No search rows returned');
    return { rowsWritten: 0, enabled: true };
  }

  const bucket = dateBucketUTC(new Date());
  let written = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const parsed = RowSchema.safeParse(rows[i]);
    if (!parsed.success) continue;
    const [rawQuery, searchCount, clickCount, noResultCount] = parsed.data;
    const q = rawQuery.trim();
    if (!q) continue;
    const qNorm = normalizeQuery(q);
    if (!qNorm) continue;

    // result_count proxy: (search_count - no_result_count) per bucket → encodes
    // "results returned something on average". Raw no-result ratio is derivable.
    const resultCount = Math.max(0, searchCount - noResultCount);

    await prisma.searchQuery.upsert({
      where: {
        uniq_store_query_bucket: {
          storeId: store.id,
          queryNormalized: qNorm,
          dateBucket: bucket,
        },
      },
      create: {
        storeId: store.id,
        query: q,
        queryNormalized: qNorm,
        occurredAt: new Date(),
        dateBucket: bucket,
        resultCount,
        clickCount,
        occurrenceCount: searchCount,
      },
      update: {
        resultCount,
        clickCount,
        occurrenceCount: searchCount,
      },
    });
    written += 1;
    if (opts.runId && i % 50 === 0) {
      await updateProgress(opts.runId, (i / rows.length) * 100);
    }
  }

  await prisma.store.update({
    where: { id: store.id },
    data: { lastSearchSync: new Date() },
  });
  logger.info(
    { shop: store.shopDomain, rowsWritten: written, totalRows: rows.length },
    'Search analytics ingestion complete',
  );
  return { rowsWritten: written, enabled: true };
}
