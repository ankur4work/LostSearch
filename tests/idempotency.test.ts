import { describe, it, expect } from 'vitest';
import { normalizeQuery, dateBucketUTC } from '@/lib/ingestion/normalize';

/**
 * Database-level idempotency is enforced by the composite unique index
 * (store_id, query_normalized, date_bucket) on search_queries plus the
 * Prisma `upsert` in ingestSearchAnalytics. This test suite verifies the
 * *inputs* to that upsert are stable across runs — i.e. re-parsing the same
 * raw Shopify row produces identical normalized keys.
 */
describe('ingestion idempotency — stable dedup keys', () => {
  it('same raw query → same normalized key across runs', () => {
    const raw = '  Red  Cotton  T-Shirt!!! ';
    expect(normalizeQuery(raw)).toBe(normalizeQuery(raw));
    expect(normalizeQuery(raw)).toBe('red cotton t-shirt');
  });

  it('NFC-different but visually-identical inputs collapse to the same key', () => {
    const precomposed = 'café';
    const decomposed = 'cafe\u0301';
    expect(normalizeQuery(precomposed)).toBe(normalizeQuery(decomposed));
  });

  it('date bucket is stable within the same UTC day', () => {
    const a = dateBucketUTC(new Date('2026-04-22T00:01:00Z'));
    const b = dateBucketUTC(new Date('2026-04-22T23:59:59Z'));
    expect(a.getTime()).toBe(b.getTime());
  });

  it('punctuation variants collapse to the same key', () => {
    expect(normalizeQuery('red, shirt')).toBe(normalizeQuery('red shirt'));
    expect(normalizeQuery('red. shirt')).toBe(normalizeQuery('red shirt'));
    expect(normalizeQuery('red / shirt')).toBe(normalizeQuery('red shirt'));
  });

  it('hyphen and apostrophe differentiate keys (preserved on purpose)', () => {
    expect(normalizeQuery('tshirt')).not.toBe(normalizeQuery('t-shirt'));
    expect(normalizeQuery('mens')).not.toBe(normalizeQuery("men's"));
  });
});
