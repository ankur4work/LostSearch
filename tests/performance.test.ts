import { describe, it, expect, beforeAll } from 'vitest';
import {
  classify,
  type AggregatedQuery,
  type ProductRef,
  type SemanticMatchRef,
} from '@/lib/engine/classifier';
import { normalizeQuery } from '@/lib/ingestion/normalize';
import { __setSynonymsForTest } from '@/lib/engine/synonyms';

/**
 * Hits the acceptance target: 10k queries × 5k products in < 30s on a
 * 2-core machine. Semantic matches are mocked (the pipeline's job is I/O; this
 * test targets the pure classifier path so regressions in Fuse/synonym logic
 * show up without requiring Redis or pgvector.)
 */
describe('classifier performance @slow', () => {
  const NUM_PRODUCTS = 5_000;
  const NUM_QUERIES = 10_000;
  // Generous ceiling — hot machines finish in under 10s. Failures here almost
  // always mean accidental O(N*M) blowup, not a slow machine.
  const BUDGET_MS = 30_000;

  let products: ProductRef[];
  let aggregates: AggregatedQuery[];

  beforeAll(() => {
    __setSynonymsForTest([]);
    products = Array.from({ length: NUM_PRODUCTS }, (_, i) => ({
      id: `p${i}`,
      shopifyProductId: `gid://Product/${i}`,
      title: `Widget ${i} ${i % 7 === 0 ? 'Premium' : 'Standard'}`,
      tags: [`tag${i % 50}`, i % 3 === 0 ? 'featured' : 'regular'],
    }));
    const corpusWords = ['widget', 'premium', 'standard', 'featured', 'gizmo', 'thing'];
    aggregates = Array.from({ length: NUM_QUERIES }, (_, i) => {
      const rawQuery = `${corpusWords[i % corpusWords.length]} ${i}`;
      return {
        query: rawQuery,
        queryNormalized: normalizeQuery(rawQuery),
        occurrenceCount: (i % 100) + 1,
        resultCount: i % 5,
        clickCount: i % 3,
        hasFilter: i % 50 === 0,
        filterDimensions: i % 50 === 0 ? ['color'] : [],
      };
    });
  });

  it(`classifies ${NUM_QUERIES.toLocaleString()} queries against ${NUM_PRODUCTS.toLocaleString()} products in < ${BUDGET_MS / 1000}s`, () => {
    const semanticMatches: SemanticMatchRef[] = [];
    const start = Date.now();
    for (const a of aggregates) {
      classify({ aggregate: a, products, semanticMatches });
    }
    const elapsed = Date.now() - start;
    // Log so perf drift is visible in CI output even when we're under budget.
    // eslint-disable-next-line no-console
    console.log(`[perf] classified ${NUM_QUERIES} queries in ${elapsed}ms`);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  }, BUDGET_MS + 10_000);
});
