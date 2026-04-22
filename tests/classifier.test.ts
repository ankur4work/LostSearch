import { describe, it, expect, beforeEach } from 'vitest';
import {
  classify,
  type AggregatedQuery,
  type ProductRef,
  type SemanticMatchRef,
} from '@/lib/engine/classifier';
import { normalizeQuery } from '@/lib/ingestion/normalize';
import { __setSynonymsForTest } from '@/lib/engine/synonyms';

// Default fixtures used across many tests.
const PRODUCTS: ProductRef[] = [
  { id: 'p1', shopifyProductId: 'gid://Product/1', title: 'Organic Cotton T-Shirt', tags: ['cotton', 'organic', 'mens'] },
  { id: 'p2', shopifyProductId: 'gid://Product/2', title: 'Indigo Denim Joggers', tags: ['denim', 'indigo', 'unisex'] },
  { id: 'p3', shopifyProductId: 'gid://Product/3', title: 'Ethnic Nehru Jacket', tags: ['ethnic', 'jacket', 'mens'] },
  { id: 'p4', shopifyProductId: 'gid://Product/4', title: 'Leather Biker Wallet', tags: ['leather', 'wallet', 'mens'] },
  { id: 'p5', shopifyProductId: 'gid://Product/5', title: 'Waterproof Hiking Boots', tags: ['boots', 'hiking', 'outdoor'] },
];

function agg(partial: Partial<AggregatedQuery> & { query: string }): AggregatedQuery {
  const q = partial.query;
  return {
    query: q,
    queryNormalized: normalizeQuery(q),
    occurrenceCount: partial.occurrenceCount ?? 50,
    resultCount: partial.resultCount ?? 5,
    clickCount: partial.clickCount ?? 1,
    hasFilter: partial.hasFilter ?? false,
    filterDimensions: partial.filterDimensions ?? [],
  };
}

function noSemantic(): SemanticMatchRef[] {
  return [];
}

function semantic(entries: Array<[string, number]>): SemanticMatchRef[] {
  return entries.map(([productId, similarity], i) => {
    const product = PRODUCTS.find((p) => p.id === productId);
    return {
      productId,
      shopifyProductId: product?.shopifyProductId ?? `gid://Product/${i}`,
      title: product?.title ?? `Product ${i}`,
      similarity,
    };
  });
}

beforeEach(() => {
  // Minimal synonym set just for classifier tests — avoids depending on the
  // 300-entry production file for isolation.
  __setSynonymsForTest([
    {
      canonical: 'ethnic jacket',
      synonyms: ['bandhgala', 'nehru jacket', 'sherwani jacket'],
      category: 'FASHION',
    },
    {
      canonical: 'tshirt',
      synonyms: ['t-shirt', 'tee'],
      category: 'FASHION',
    },
    {
      canonical: 'joggers',
      synonyms: ['track pants', 'sweatpants'],
      category: 'FASHION',
    },
  ]);
});

describe('classify — Type 4 (Filter Gap)', () => {
  it('filter + zero result → TYPE_4', () => {
    const out = classify({
      aggregate: agg({
        query: 'red shoes size 12',
        resultCount: 0,
        hasFilter: true,
        filterDimensions: ['color', 'size'],
      }),
      products: PRODUCTS,
      semanticMatches: noSemantic(),
    });
    expect(out.type).toBe('TYPE_4');
    expect(out.confidence).toBeCloseTo(0.95);
    expect(out.reasoning.step).toBe('filter_gap');
    expect(out.reasoning.detail.dimensions).toEqual(['color', 'size']);
  });

  it('filter + one result → NOT TYPE_4 (falls through)', () => {
    const out = classify({
      aggregate: agg({
        query: 'tshirt',
        resultCount: 1,
        hasFilter: true,
      }),
      products: PRODUCTS,
      semanticMatches: noSemantic(),
    });
    expect(out.type).not.toBe('TYPE_4');
  });

  it('no filter but zero result → NOT TYPE_4', () => {
    const out = classify({
      aggregate: agg({ query: 'unicorn scarf', resultCount: 0 }),
      products: PRODUCTS,
      semanticMatches: noSemantic(),
    });
    expect(out.type).not.toBe('TYPE_4');
  });
});

describe('classify — Type 3 (Results No Click)', () => {
  it('results > 0, clicks = 0, occurrence >= 10 → TYPE_3', () => {
    const out = classify({
      aggregate: agg({
        query: 'leather wallet',
        resultCount: 12,
        clickCount: 0,
        occurrenceCount: 15,
      }),
      products: PRODUCTS,
      semanticMatches: noSemantic(),
    });
    expect(out.type).toBe('TYPE_3');
    expect(out.confidence).toBeCloseTo(0.8);
    expect(out.reasoning.step).toBe('results_no_click');
  });

  it('occurrence < 10 → not TYPE_3, falls through', () => {
    const out = classify({
      aggregate: agg({
        query: 'vintage wallet',
        resultCount: 5,
        clickCount: 0,
        occurrenceCount: 5,
      }),
      products: PRODUCTS,
      semanticMatches: noSemantic(),
    });
    expect(out.type).not.toBe('TYPE_3');
  });

  it('some clicks → not TYPE_3', () => {
    const out = classify({
      aggregate: agg({
        query: 'leather wallet',
        resultCount: 10,
        clickCount: 1,
        occurrenceCount: 50,
      }),
      products: PRODUCTS,
      semanticMatches: noSemantic(),
    });
    expect(out.type).not.toBe('TYPE_3');
  });

  it('filter + zero result precedence beats TYPE_3 (order matters)', () => {
    const out = classify({
      aggregate: agg({
        query: 'red shoes size 12',
        resultCount: 0,
        clickCount: 0,
        occurrenceCount: 100,
        hasFilter: true,
        filterDimensions: ['color'],
      }),
      products: PRODUCTS,
      semanticMatches: noSemantic(),
    });
    expect(out.type).toBe('TYPE_4');
  });
});

describe('classify — Step 4 (Exact match → NONE)', () => {
  it.each([
    ['exact title substring', 'organic cotton t-shirt'],
    ['title partial', 'denim joggers'],
    ['exact tag', 'ethnic'],
    ['uppercase input', 'DENIM JOGGERS'],
    ['with punctuation', 'Denim, Joggers!'],
  ])('%s → NONE', (_label, q) => {
    const out = classify({
      aggregate: agg({ query: q }),
      products: PRODUCTS,
      semanticMatches: noSemantic(),
    });
    expect(out.type).toBe('NONE');
    expect(out.reasoning.step).toBe('exact_match');
  });

  it('empty catalog → never returns NONE for exact match', () => {
    const out = classify({
      aggregate: agg({ query: 'cotton tshirt' }),
      products: [],
      semanticMatches: noSemantic(),
    });
    expect(out.type).not.toBe('NONE');
  });
});

describe('classify — Type 2 (Fuzzy match)', () => {
  it('single-typo match → TYPE_2', () => {
    const out = classify({
      aggregate: agg({ query: 'organik cotton tshirt' }), // typo: organik
      products: PRODUCTS,
      semanticMatches: noSemantic(),
    });
    expect(out.type).toBe('TYPE_2');
    expect(out.reasoning.step).toBe('fuzzy_match');
    expect(out.matchedProductIds.length).toBeGreaterThan(0);
    expect(out.matchedProductIds.length).toBeLessThanOrEqual(3);
  });

  it('synonym (bandhgala → ethnic nehru jacket) → TYPE_2', () => {
    const out = classify({
      aggregate: agg({ query: 'bandhgala' }),
      products: PRODUCTS,
      semanticMatches: noSemantic(),
    });
    expect(out.type).toBe('TYPE_2');
    expect(out.matchedProductIds).toContain('p3');
  });

  it('synonym (track pants → Indigo Denim Joggers via joggers alias) → TYPE_2', () => {
    const out = classify({
      aggregate: agg({ query: 'track pants' }),
      products: PRODUCTS,
      semanticMatches: noSemantic(),
    });
    expect(out.type).toBe('TYPE_2');
  });

  it('confidence = 1 - fuseScore and is in (0,1]', () => {
    const out = classify({
      aggregate: agg({ query: 'organik cotton tshirt' }),
      products: PRODUCTS,
      semanticMatches: noSemantic(),
    });
    expect(out.confidence).toBeGreaterThan(0);
    expect(out.confidence).toBeLessThanOrEqual(1);
    expect(out.reasoning.detail.fuseScore).toBeDefined();
  });
});

describe('classify — Type 2 (Semantic match)', () => {
  it('semantic similarity > 0.72 → TYPE_2', () => {
    const out = classify({
      aggregate: agg({ query: 'weatherproof trekking footwear' }),
      products: PRODUCTS,
      semanticMatches: semantic([['p5', 0.81]]),
    });
    expect(out.type).toBe('TYPE_2');
    expect(out.reasoning.step).toBe('semantic_match');
    expect((out.reasoning.detail as { topSimilarity: number }).topSimilarity).toBeCloseTo(0.81);
  });

  it('semantic similarity ≤ threshold → TYPE_1', () => {
    const out = classify({
      aggregate: agg({ query: 'completely unrelated widget' }),
      products: PRODUCTS,
      semanticMatches: semantic([['p5', 0.71]]),
    });
    expect(out.type).toBe('TYPE_1');
  });

  it('keeps only matches above threshold for matchedProductIds', () => {
    const out = classify({
      aggregate: agg({ query: 'weatherproof trekking footwear' }),
      products: PRODUCTS,
      semanticMatches: semantic([['p5', 0.82], ['p3', 0.75], ['p1', 0.6]]),
    });
    expect(out.matchedProductIds).toEqual(['p5', 'p3']);
  });
});

describe('classify — Type 1 (Product Gap)', () => {
  it('no matches anywhere → TYPE_1', () => {
    const out = classify({
      aggregate: agg({ query: 'quantum flux capacitor' }),
      products: PRODUCTS,
      semanticMatches: semantic([['p1', 0.3]]),
    });
    expect(out.type).toBe('TYPE_1');
    expect(out.reasoning.step).toBe('product_gap');
    expect(out.matchedProductIds).toEqual([]);
  });

  it('confidence rises as best semantic similarity drops', () => {
    const low = classify({
      aggregate: agg({ query: 'foo bar baz' }),
      products: PRODUCTS,
      semanticMatches: semantic([['p1', 0.1]]),
    });
    const mid = classify({
      aggregate: agg({ query: 'foo bar baz' }),
      products: PRODUCTS,
      semanticMatches: semantic([['p1', 0.5]]),
    });
    expect(low.confidence).toBeGreaterThan(mid.confidence);
  });

  it('empty semantic matches + empty products → TYPE_1 with confidence 1', () => {
    const out = classify({
      aggregate: agg({ query: 'foo bar baz' }),
      products: [],
      semanticMatches: [],
    });
    expect(out.type).toBe('TYPE_1');
    expect(out.confidence).toBe(1);
  });
});

describe('classify — Step 8 (low_volume flag)', () => {
  it('occurrence < CLASSIFY_LOW_VOLUME_CUTOFF → lowVolume=true', () => {
    const out = classify({
      aggregate: agg({ query: 'foo bar baz', occurrenceCount: 2 }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    expect(out.lowVolume).toBe(true);
    expect(out.type).toBe('TYPE_1'); // classification still happens
  });

  it('occurrence >= cutoff → lowVolume=false', () => {
    const out = classify({
      aggregate: agg({ query: 'foo bar baz', occurrenceCount: 50 }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    expect(out.lowVolume).toBe(false);
  });
});

describe('classify — unicode / edge inputs', () => {
  it('NFC-different inputs produce same classification', () => {
    const precomposed = classify({
      aggregate: agg({ query: 'café wallet' }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    const decomposed = classify({
      aggregate: agg({ query: 'cafe\u0301 wallet' }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    expect(precomposed.type).toBe(decomposed.type);
  });

  it('emoji-only query → empty normalization → TYPE_1 (empty)', () => {
    const out = classify({
      aggregate: agg({ query: '🔥🔥🔥' }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    expect(out.type).toBe('TYPE_1');
  });

  it('Hindi Devanagari query passes through normalizer', () => {
    const out = classify({
      aggregate: agg({ query: 'कपड़ा' }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    expect(['TYPE_1', 'TYPE_2']).toContain(out.type);
  });

  it('query with leading/trailing whitespace is handled', () => {
    const out = classify({
      aggregate: agg({ query: '   organic cotton t-shirt   ' }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    expect(out.type).toBe('NONE');
  });
});

describe('classify — Hindi-English hybrid (acceptance criteria)', () => {
  it('"bandhgala" → TYPE_2 matching "Ethnic Nehru Jacket" via synonyms', () => {
    const out = classify({
      aggregate: agg({ query: 'bandhgala' }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    expect(out.type).toBe('TYPE_2');
    expect(out.matchedProductIds).toContain('p3');
  });

  it('"nehru jacket" → exact match or TYPE_2', () => {
    const out = classify({
      aggregate: agg({ query: 'nehru jacket' }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    expect(['NONE', 'TYPE_2']).toContain(out.type);
  });
});

describe('classify — determinism', () => {
  it('same inputs → identical output across calls', () => {
    const input = {
      aggregate: agg({ query: 'denim jogger', occurrenceCount: 20 }),
      products: PRODUCTS,
      semanticMatches: semantic([['p2', 0.78]]),
    };
    const a = classify(input);
    const b = classify(input);
    const c = classify(input);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('matchedProductIds is deterministically sorted (top 3 by score, tie-break by id)', () => {
    // Force tie by giving two products the same fuzzy haystack.
    const dup: ProductRef[] = [
      { id: 'aaa', shopifyProductId: 'gid://Product/aaa', title: 'Cotton T-Shirt', tags: [] },
      { id: 'bbb', shopifyProductId: 'gid://Product/bbb', title: 'Cotton T-Shirt', tags: [] },
      { id: 'ccc', shopifyProductId: 'gid://Product/ccc', title: 'Cotton T-Shirt', tags: [] },
      { id: 'ddd', shopifyProductId: 'gid://Product/ddd', title: 'Cotton T-Shirt', tags: [] },
    ];
    const out = classify({
      aggregate: agg({ query: 'cottn tshirt' }),
      products: dup,
      semanticMatches: [],
    });
    if (out.type === 'TYPE_2') {
      const sorted = [...out.matchedProductIds].sort();
      expect(out.matchedProductIds).toEqual(sorted);
    }
  });
});

describe('classify — extra edge cases', () => {
  it('exact match on tag alone (no title hit) → NONE', () => {
    const out = classify({
      aggregate: agg({ query: 'outdoor' }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    expect(out.type).toBe('NONE');
  });

  it('filter with non-zero result does not fire TYPE_4 even with hasFilter=true', () => {
    const out = classify({
      aggregate: agg({
        query: 'cotton tshirt',
        resultCount: 1,
        hasFilter: true,
        filterDimensions: ['color'],
      }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    expect(out.type).not.toBe('TYPE_4');
  });

  it('confidence is always in [0,1]', () => {
    const queries = ['bandhgala', 'foo', 'organik cotton tshirt', '🔥', 'denim', ''];
    for (const q of queries) {
      const out = classify({
        aggregate: agg({ query: q }),
        products: PRODUCTS,
        semanticMatches: semantic([['p1', 0.5]]),
      });
      expect(out.confidence).toBeGreaterThanOrEqual(0);
      expect(out.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('returned decision object always has the three reasoning fields', () => {
    const out = classify({
      aggregate: agg({ query: 'denim joggers' }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    expect(out.reasoning).toHaveProperty('step');
    expect(out.reasoning).toHaveProperty('detail');
    expect(typeof out.reasoning.step).toBe('string');
    expect(typeof out.reasoning.detail).toBe('object');
  });

  it('type=TYPE_2 via fuzzy includes expandedQueries in reasoning', () => {
    const out = classify({
      aggregate: agg({ query: 'bandhgala' }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    if (out.type === 'TYPE_2') {
      expect((out.reasoning.detail as { expandedQueries?: string[] }).expandedQueries).toBeDefined();
    }
  });

  it.each([
    ['apostrophe preserved', "men's shirt"],
    ['hyphen preserved', 't-shirt'],
    ['tab-separated whitespace', 'cotton\tt-shirt'],
    ['multiple spaces', 'cotton    t-shirt'],
    ['trailing !', 'cotton t-shirt!'],
    ['uppercase synonym', 'BANDHGALA'],
    ['mixed-case synonym', 'BandhGala'],
    ['synonym with extra punctuation', 'bandh-gala'],
    ['query containing a stopword', 'the cotton tshirt'],
    ['leading stopword', 'a tshirt'],
  ])('edge variant: %s → returns a decision', (_label, q) => {
    const out = classify({
      aggregate: agg({ query: q }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    expect(['TYPE_1', 'TYPE_2', 'TYPE_3', 'TYPE_4', 'NONE']).toContain(out.type);
  });

  it('handles empty query gracefully (no crash)', () => {
    const out = classify({
      aggregate: agg({ query: '' }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    expect(['TYPE_1', 'NONE']).toContain(out.type);
  });

  it('handles a product with empty tags array', () => {
    const minimal: ProductRef[] = [
      { id: 'x', shopifyProductId: 'gid://Product/X', title: 'Plain Shirt', tags: [] },
    ];
    const out = classify({
      aggregate: agg({ query: 'plain shirt' }),
      products: minimal,
      semanticMatches: [],
    });
    expect(out.type).toBe('NONE');
  });

  it('handles thousands of products without crashing', () => {
    const many: ProductRef[] = Array.from({ length: 2000 }, (_, i) => ({
      id: `p${i}`,
      shopifyProductId: `gid://Product/${i}`,
      title: `Widget ${i}`,
      tags: [`tag${i % 50}`],
    }));
    const out = classify({
      aggregate: agg({ query: 'widget 42' }),
      products: many,
      semanticMatches: [],
    });
    expect(out.type).toBe('NONE');
  });

  it('all four canonical types can be produced by varying only inputs', () => {
    const type4 = classify({
      aggregate: agg({ query: 'red', resultCount: 0, hasFilter: true, filterDimensions: ['color'] }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    const type3 = classify({
      aggregate: agg({ query: 'wallet', resultCount: 5, clickCount: 0, occurrenceCount: 20 }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    const type2 = classify({
      aggregate: agg({ query: 'bandhgala' }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    const type1 = classify({
      aggregate: agg({ query: 'quantum widget' }),
      products: PRODUCTS,
      semanticMatches: [],
    });
    expect(type4.type).toBe('TYPE_4');
    expect(type3.type).toBe('TYPE_3');
    expect(type2.type).toBe('TYPE_2');
    expect(type1.type).toBe('TYPE_1');
  });
});
