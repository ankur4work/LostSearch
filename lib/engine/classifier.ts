import Fuse, { type IFuseOptions } from 'fuse.js';
import type { ClassificationType } from '@prisma/client';
import { normalizeQuery } from '../ingestion/normalize';
import { expandSynonyms } from './synonyms';
import { engineConfig } from './config';

/* ------------------------------------------------------------------ *
 * Types                                                               *
 * ------------------------------------------------------------------ */

export interface AggregatedQuery {
  query: string;
  /** Already-normalized query (produced by pipeline). Classifier is pure; it
   *  does NOT re-normalize — caller is responsible. We re-call normalize() on
   *  raw query only if the caller forgets, for defensiveness. */
  queryNormalized: string;
  occurrenceCount: number;
  resultCount: number;
  clickCount: number;
  hasFilter: boolean;
  filterDimensions: string[];
}

export interface ProductRef {
  id: string;
  shopifyProductId: string;
  title: string;
  tags: string[];
}

export interface SemanticMatchRef {
  productId: string;
  shopifyProductId: string;
  title: string;
  similarity: number;
}

export interface ClassifierInputs {
  aggregate: AggregatedQuery;
  /** Full catalog — used for exact substring + tag matches. */
  products: ProductRef[];
  /** Precomputed top-K semantic matches (from pgvector). Empty → no matches. */
  semanticMatches: SemanticMatchRef[];
}

export interface ClassificationDecision {
  type: ClassificationType | 'NONE';
  confidence: number;
  matchedProductIds: string[];
  lowVolume: boolean;
  reasoning: {
    step: string;
    detail: Record<string, unknown>;
  };
}

/* ------------------------------------------------------------------ *
 * Core                                                                *
 * ------------------------------------------------------------------ */

const FUSE_OPTIONS: IFuseOptions<{ id: string; haystack: string; kind: 'title' | 'tag' }> = {
  keys: ['haystack'],
  includeScore: true,
  shouldSort: true,
  ignoreLocation: true,
  threshold: 1.0, // we apply the cutoff ourselves from engineConfig
  isCaseSensitive: false,
  minMatchCharLength: 2,
};

/**
 * Decision tree from PRD §9. Pure, deterministic. No DB, no network.
 * Preconditions:
 *   • `aggregate.queryNormalized` is already normalized (see normalize.ts)
 *   • `products` and `semanticMatches` are sorted deterministically by caller
 */
export function classify(inputs: ClassifierInputs): ClassificationDecision {
  const { aggregate, products, semanticMatches } = inputs;
  const qNorm = aggregate.queryNormalized || normalizeQuery(aggregate.query);

  // Step 8 pre-computed (applied to final decision).
  const lowVolume = aggregate.occurrenceCount < engineConfig.lowVolumeCutoff;

  // Step 2 — Filter Gap.
  if (aggregate.hasFilter && aggregate.resultCount === 0) {
    return decide('TYPE_4', 0.95, [], lowVolume, {
      step: 'filter_gap',
      detail: { dimensions: aggregate.filterDimensions },
    });
  }

  // Step 3 — Results but no click.
  if (
    aggregate.resultCount > 0 &&
    aggregate.clickCount === 0 &&
    aggregate.occurrenceCount >= engineConfig.type3OccurrenceMin
  ) {
    return decide('TYPE_3', 0.8, [], lowVolume, {
      step: 'results_no_click',
      detail: {
        resultCount: aggregate.resultCount,
        occurrenceCount: aggregate.occurrenceCount,
      },
    });
  }

  // Step 4 — Exact substring / tag match: query is fine, do not classify.
  const exactHit = findExactMatch(qNorm, products);
  if (exactHit) {
    return decide('NONE', 1.0, [exactHit.id], lowVolume, {
      step: 'exact_match',
      detail: { matchedTitle: exactHit.title, exactTerm: qNorm },
    });
  }

  // Step 5 — Fuzzy match against titles + tags (synonym-expanded).
  const fuzzy = fuzzyMatch(qNorm, products);
  if (fuzzy) {
    return decide('TYPE_2', 1 - fuzzy.score, fuzzy.topIds, lowVolume, {
      step: 'fuzzy_match',
      detail: {
        fuseScore: fuzzy.score,
        threshold: engineConfig.fuzzyThreshold,
        matchedTerm: fuzzy.matchedTerm,
        expandedQueries: fuzzy.expandedQueries,
      },
    });
  }

  // Step 6 — Semantic match via precomputed top-K.
  const top = semanticMatches[0];
  if (top && top.similarity >= engineConfig.semanticThreshold) {
    const ids = semanticMatches
      .filter((m) => m.similarity >= engineConfig.semanticThreshold)
      .slice(0, 3)
      .map((m) => m.productId);
    return decide('TYPE_2', top.similarity, ids, lowVolume, {
      step: 'semantic_match',
      detail: {
        topSimilarity: top.similarity,
        threshold: engineConfig.semanticThreshold,
        matchedProduct: top.title,
      },
    });
  }

  // Step 7 — Product Gap.
  const bestSim = top?.similarity ?? 0;
  return decide('TYPE_1', clamp01(1 - bestSim), [], lowVolume, {
    step: 'product_gap',
    detail: {
      topSemanticSimilarity: bestSim,
      threshold: engineConfig.semanticThreshold,
    },
  });
}

/* ------------------------------------------------------------------ *
 * Helpers                                                             *
 * ------------------------------------------------------------------ */

function findExactMatch(qNorm: string, products: ProductRef[]): ProductRef | null {
  if (!qNorm) return null;
  for (const p of products) {
    if (normalizeQuery(p.title).includes(qNorm)) return p;
    for (const tag of p.tags) {
      if (normalizeQuery(tag) === qNorm) return p;
    }
  }
  return null;
}

interface FuzzyHit {
  score: number;
  topIds: string[];
  matchedTerm: string;
  expandedQueries: string[];
}

function fuzzyMatch(qNorm: string, products: ProductRef[]): FuzzyHit | null {
  if (!qNorm) return null;
  // Build a flat corpus of (productId, haystack) across titles + tags so a
  // single Fuse query can score against both. Tags get slight weight by
  // duplicating — but we keep it simple and let Fuse's default score speak.
  const corpus: Array<{ id: string; haystack: string; kind: 'title' | 'tag' }> = [];
  for (const p of products) {
    corpus.push({ id: p.id, haystack: normalizeQuery(p.title), kind: 'title' });
    for (const t of p.tags) corpus.push({ id: p.id, haystack: normalizeQuery(t), kind: 'tag' });
  }
  const fuse = new Fuse(corpus, FUSE_OPTIONS);

  const expanded = expandSynonyms(qNorm);
  let best: { score: number; id: string; haystack: string } | null = null;
  const idToScore = new Map<string, number>();

  for (const needle of expanded) {
    const results = fuse.search(needle);
    for (const r of results) {
      const score = r.score ?? 1;
      if (score <= engineConfig.fuzzyThreshold) {
        const current = idToScore.get(r.item.id);
        if (current === undefined || score < current) {
          idToScore.set(r.item.id, score);
        }
        if (!best || score < best.score) {
          best = { score, id: r.item.id, haystack: r.item.haystack };
        }
      }
    }
  }

  if (!best) return null;

  const topIds = Array.from(idToScore.entries())
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([id]) => id);

  return {
    score: best.score,
    topIds,
    matchedTerm: best.haystack,
    expandedQueries: expanded,
  };
}

function decide(
  type: ClassificationType | 'NONE',
  confidence: number,
  matchedProductIds: string[],
  lowVolume: boolean,
  reasoning: ClassificationDecision['reasoning'],
): ClassificationDecision {
  return {
    type,
    confidence: clamp01(confidence),
    matchedProductIds,
    lowVolume,
    reasoning,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
