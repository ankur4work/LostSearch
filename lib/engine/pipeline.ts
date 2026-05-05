import IORedis from 'ioredis';
import type { Prisma, Store } from '@prisma/client';
import { env } from '../env';
import { prisma } from '../prisma';
import { logger } from '../logger';
import { normalizeQuery } from '../ingestion/normalize';
import { classify, type AggregatedQuery, type ProductRef, type SemanticMatchRef } from './classifier';
import { estimateRevenue } from './revenue';
import { engineConfig } from './config';
import { detectCategory } from './category';
import { invalidate } from '../cache';

const redisPub = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
const CLASSIFICATION_COMPLETE_CHANNEL = 'classification.complete';

interface AggregateRow {
  query: string;
  query_normalized: string;
  occurrence_count: number;
  max_result_count: number;
  sum_click_count: number;
  has_filter_zero_result: boolean;
  filters: Prisma.JsonValue | null;
}

export interface ClassificationRunSummary {
  storeId: string;
  windowDays: number;
  totalQueries: number;
  classifiedCount: number;
  typeCounts: Record<string, number>;
  revenueTotalCents: number;
  durationMs: number;
}

/**
 * Full per-store classification pass:
 *   1. Aggregate search_queries over CLASSIFY_WINDOW_DAYS (30 default) by queryNormalized.
 *   2. Resolve store category (industry → tag majority → DEFAULT).
 *   3. Load catalog (id, title, tags) once.
 *   4. For each aggregate: get query embedding (Redis-cached), pgvector top-K,
 *      call pure `classify()` + pure `estimateRevenue()`.
 *   5. Upsert classifications + revenue_estimates in a transaction per query
 *      (idempotent via unique (store_id, query_norm)).
 *   6. Publish `classification.complete` event with summary stats.
 *
 * Parallelism = engineConfig.parallelism. In-memory queue pattern so we don't
 * await sequentially (10k queries × 20ms = 200s, too slow).
 */
export async function runClassificationPipeline(store: Store): Promise<ClassificationRunSummary> {
  const started = Date.now();
  const windowDays = engineConfig.windowDays;
  const since = new Date(Date.now() - windowDays * 86_400_000);

  const aggregates = await prisma.$queryRawUnsafe<AggregateRow[]>(
    `SELECT
        (ARRAY_AGG(query ORDER BY occurred_at DESC))[1] AS query,
        query_normalized,
        SUM(occurrence_count)::int AS occurrence_count,
        MAX(result_count)::int AS max_result_count,
        SUM(click_count)::int AS sum_click_count,
        BOOL_OR(filters_json IS NOT NULL AND result_count = 0) AS has_filter_zero_result,
        (ARRAY_AGG(filters_json) FILTER (WHERE filters_json IS NOT NULL))[1] AS filters
      FROM search_queries
      WHERE store_id = $1 AND occurred_at >= $2
      GROUP BY query_normalized
      HAVING query_normalized <> ''`,
    store.id,
    since,
  );

  const products = await prisma.catalogProduct.findMany({
    where: { storeId: store.id },
    select: { id: true, shopifyProductId: true, title: true, tags: true },
    orderBy: { id: 'asc' },
  });
  const productRefs: ProductRef[] = products.map((p) => ({
    id: p.id,
    shopifyProductId: p.shopifyProductId,
    title: p.title,
    tags: p.tags,
  }));

  const topTags = topTagsFromCatalog(products);
  const category =
    store.category ?? detectCategory({ industry: store.industry, topTags });
  if (category !== store.category) {
    await prisma.store.update({
      where: { id: store.id },
      data: { category },
    });
  }

  const typeCounts: Record<string, number> = {
    TYPE_1: 0,
    TYPE_2: 0,
    TYPE_3: 0,
    TYPE_4: 0,
    UNCAT: 0,
    NONE: 0,
  };
  let revenueTotalCents = 0;
  let classifiedCount = 0;

  const runQuery = async (row: AggregateRow): Promise<void> => {
    const queryNormalized = normalizeQuery(row.query_normalized);
    if (!queryNormalized) return;

    const hasFilter = row.has_filter_zero_result;
    const filterDimensions = extractFilterDimensions(row.filters);

    // If *any* filtered bucket returned zero, represent that as the effective
    // resultCount for classification — otherwise a mixed day (filtered=0 +
    // unfiltered=5) masks the filter-gap signal (see PRD §9 step 2).
    const effectiveResultCount = hasFilter ? 0 : row.max_result_count;

    const aggregate: AggregatedQuery = {
      query: row.query,
      queryNormalized,
      occurrenceCount: row.occurrence_count,
      resultCount: effectiveResultCount,
      clickCount: row.sum_click_count,
      hasFilter,
      filterDimensions,
    };

    // Semantic matching disabled — local ONNX model crashes on this host due
    // to memory constraints. Classification uses exact + fuzzy matching only.
    const semanticMatches: SemanticMatchRef[] = [];

    const decision = classify({ aggregate, products: productRefs, semanticMatches });

    typeCounts[decision.type] = (typeCounts[decision.type] ?? 0) + 1;

    if (decision.type === 'NONE') return;

    const revenue = estimateRevenue({
      classificationType: decision.type,
      monthlyVolume: aggregate.occurrenceCount,
      aovCents: store.aovCents,
      storeCategory: category,
    });

    await prisma.$transaction(async (tx) => {
      const cls = await tx.classification.upsert({
        where: {
          uniq_store_query_norm: { storeId: store.id, queryNorm: queryNormalized },
        },
        create: {
          storeId: store.id,
          queryNorm: queryNormalized,
          type: decision.type as Exclude<typeof decision.type, 'NONE'>,
          confidence: decision.confidence,
          matchedProductIds: decision.matchedProductIds,
          occurrenceCount: aggregate.occurrenceCount,
          lowVolume: decision.lowVolume,
          reasoning: decision.reasoning as unknown as Prisma.InputJsonValue,
        },
        update: {
          type: decision.type as Exclude<typeof decision.type, 'NONE'>,
          confidence: decision.confidence,
          matchedProductIds: decision.matchedProductIds,
          occurrenceCount: aggregate.occurrenceCount,
          lowVolume: decision.lowVolume,
          reasoning: decision.reasoning as unknown as Prisma.InputJsonValue,
        },
      });
      // Replace prior estimates for this classification to stay idempotent.
      await tx.revenueEstimate.deleteMany({ where: { classificationId: cls.id } });
      if (revenue.estimateCents > 0) {
        await tx.revenueEstimate.create({
          data: {
            classificationId: cls.id,
            monthlyVolume: revenue.monthlyVolume,
            aovCents: revenue.aovCents,
            benchmarkPct: revenue.benchmarkPct,
            estimateCents: revenue.estimateCents,
            bandLowCents: revenue.bandLowCents,
            bandHighCents: revenue.bandHighCents,
          },
        });
        revenueTotalCents += revenue.estimateCents;
      }
    });
    classifiedCount += 1;
  };

  await runInBatches(aggregates, engineConfig.parallelism, runQuery);

  const summary: ClassificationRunSummary = {
    storeId: store.id,
    windowDays,
    totalQueries: aggregates.length,
    classifiedCount,
    typeCounts,
    revenueTotalCents,
    durationMs: Date.now() - started,
  };

  // Classification changed the dashboard numbers — bust the per-store cache.
  await invalidate(`dash:summary:v1:${store.id}`);

  logger.info({ ...summary }, 'classification.complete');
  await redisPub.publish(CLASSIFICATION_COMPLETE_CHANNEL, JSON.stringify(summary));

  return summary;
}

/** Parallel worker-pool over an async function with fixed concurrency. */
async function runInBatches<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      const item = items[i];
      if (item === undefined) continue;
      try {
        await fn(item);
      } catch (err) {
        logger.error({ err: (err as Error).message, index: i }, 'classify worker item failed');
      }
    }
  });
  await Promise.all(workers);
}

function topTagsFromCatalog(
  products: Array<{ tags: string[] }>,
): string[] {
  const counts = new Map<string, number>();
  for (const p of products) {
    for (const t of p.tags) {
      const key = t.trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([k]) => k);
}

function extractFilterDimensions(filters: Prisma.JsonValue | null): string[] {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return [];
  return Object.keys(filters);
}
