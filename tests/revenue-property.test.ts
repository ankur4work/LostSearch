import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { estimateRevenue } from '@/lib/engine/revenue';

const CATEGORIES = ['FASHION', 'BEAUTY', 'ELECTRONICS', 'HOME', 'FOOD', 'DEFAULT', null];

describe('estimateRevenue — property-based', () => {
  it('estimate ≥ 0 for every valid input', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.constantFrom(...CATEGORIES),
        (volume, aovCents, category) => {
          const out = estimateRevenue({
            classificationType: 'TYPE_1',
            monthlyVolume: volume,
            aovCents,
            storeCategory: category,
          });
          expect(out.estimateCents).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('bands always bracket the estimate (low ≤ estimate ≤ high)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.constantFrom(...CATEGORIES),
        (volume, aovCents, category) => {
          const out = estimateRevenue({
            classificationType: 'TYPE_1',
            monthlyVolume: volume,
            aovCents,
            storeCategory: category,
          });
          expect(out.bandLowCents).toBeLessThanOrEqual(out.estimateCents);
          expect(out.estimateCents).toBeLessThanOrEqual(out.bandHighCents);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('estimate is monotonic in monthlyVolume (holding aov, category fixed)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 100, max: 100_000 }),
        fc.constantFrom(...CATEGORIES),
        (v1, v2, aov, category) => {
          const [lo, hi] = v1 <= v2 ? [v1, v2] : [v2, v1];
          const a = estimateRevenue({
            classificationType: 'TYPE_1',
            monthlyVolume: lo,
            aovCents: aov,
            storeCategory: category,
          });
          const b = estimateRevenue({
            classificationType: 'TYPE_1',
            monthlyVolume: hi,
            aovCents: aov,
            storeCategory: category,
          });
          expect(b.estimateCents).toBeGreaterThanOrEqual(a.estimateCents);
          expect(b.bandLowCents).toBeGreaterThanOrEqual(a.bandLowCents);
          expect(b.bandHighCents).toBeGreaterThanOrEqual(a.bandHighCents);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('never throws — category resolution is total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 100_000 }),
        fc.option(fc.integer({ min: -100, max: 100_000 }), { nil: null }),
        fc.option(fc.string(), { nil: null }),
        (volume, aovCents, category) => {
          expect(() =>
            estimateRevenue({
              classificationType: 'TYPE_1',
              monthlyVolume: volume,
              aovCents,
              storeCategory: category,
            }),
          ).not.toThrow();
        },
      ),
      { numRuns: 200 },
    );
  });
});
