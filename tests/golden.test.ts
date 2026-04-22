import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  classify,
  type AggregatedQuery,
  type ProductRef,
  type SemanticMatchRef,
} from '@/lib/engine/classifier';
import { normalizeQuery } from '@/lib/ingestion/normalize';
import { __setSynonymsForTest } from '@/lib/engine/synonyms';

const CATALOG_PATH = resolve(__dirname, 'fixtures', 'golden-catalog.json');
const QUERIES_PATH = resolve(__dirname, 'fixtures', 'golden-queries.json');
const EXPECTED_PATH = resolve(__dirname, 'fixtures', 'golden-expected.json');

interface GoldenQuery {
  query: string;
  occurrenceCount: number;
  resultCount: number;
  clickCount: number;
  hasFilter: boolean;
  filterDimensions: string[];
}

interface GoldenExpected {
  [queryNormalized: string]: {
    type: string;
    confidence: number;
    matchedProductIds: string[];
    reasoningStep: string;
  };
}

/**
 * Golden-file test: fixed catalog + 30 queries → classification output. Regenerate
 * the expected file via `UPDATE_GOLDEN=1 pnpm test golden`. Any diff without
 * that env var means an unintended behavior change — review carefully.
 */
describe('golden classification regression', () => {
  let catalog: ProductRef[];
  let queries: GoldenQuery[];

  beforeAll(() => {
    catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as ProductRef[];
    queries = JSON.parse(readFileSync(QUERIES_PATH, 'utf8')) as GoldenQuery[];
    // Test uses only the three synonym pairs needed by the fixtures, so
    // regenerating golden doesn't require shipping the 300-entry file.
    __setSynonymsForTest([
      { canonical: 'ethnic jacket', synonyms: ['bandhgala', 'nehru jacket', 'sherwani jacket'], category: 'FASHION' },
      { canonical: 'joggers', synonyms: ['track pants', 'sweatpants'], category: 'FASHION' },
      { canonical: 'power bank', synonyms: ['portable charger', 'mobile battery backup'], category: 'ELECTRONICS' },
      { canonical: 'chopping board', synonyms: ['cutting board'], category: 'HOME' },
      { canonical: 'saree', synonyms: ['sari'], category: 'FASHION' },
      { canonical: 'basmati rice', synonyms: ['long grain rice', 'aromatic rice'], category: 'FOOD' },
    ]);
  });

  it('produces the expected classification map (deterministic)', () => {
    const actual: GoldenExpected = {};
    for (const q of queries) {
      const aggregate: AggregatedQuery = {
        query: q.query,
        queryNormalized: normalizeQuery(q.query),
        occurrenceCount: q.occurrenceCount,
        resultCount: q.resultCount,
        clickCount: q.clickCount,
        hasFilter: q.hasFilter,
        filterDimensions: q.filterDimensions,
      };
      const semanticMatches: SemanticMatchRef[] = []; // no semantic in golden (no embeddings)
      const out = classify({ aggregate, products: catalog, semanticMatches });
      actual[aggregate.queryNormalized] = {
        type: out.type,
        confidence: Number(out.confidence.toFixed(3)),
        matchedProductIds: out.matchedProductIds,
        reasoningStep: out.reasoning.step,
      };
    }

    if (process.env.UPDATE_GOLDEN === '1') {
      writeFileSync(EXPECTED_PATH, JSON.stringify(actual, null, 2) + '\n', 'utf8');
      return;
    }

    if (!existsSync(EXPECTED_PATH)) {
      throw new Error(
        `Missing ${EXPECTED_PATH}. Run with UPDATE_GOLDEN=1 to generate it on first run.`,
      );
    }
    const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8')) as GoldenExpected;
    expect(actual).toEqual(expected);
  });

  it('determinism across runs on the same fixtures', () => {
    const run = (): string =>
      JSON.stringify(
        queries.map((q) =>
          classify({
            aggregate: {
              query: q.query,
              queryNormalized: normalizeQuery(q.query),
              occurrenceCount: q.occurrenceCount,
              resultCount: q.resultCount,
              clickCount: q.clickCount,
              hasFilter: q.hasFilter,
              filterDimensions: q.filterDimensions,
            },
            products: catalog,
            semanticMatches: [],
          }),
        ),
      );
    expect(run()).toBe(run());
  });
});
