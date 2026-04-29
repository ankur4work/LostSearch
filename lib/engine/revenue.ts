import type { ClassificationType } from '@prisma/client';
import { engineConfig } from './config';
import { benchmarkFor, defaultAovFor } from './benchmarks';
import { logger } from '../logger';

export interface RevenueInput {
  classificationType: ClassificationType | 'NONE';
  monthlyVolume: number;
  aovCents: number | null;
  storeCategory: string | null | undefined;
}

export interface RevenueEstimate {
  monthlyVolume: number;
  aovCents: number;
  benchmarkPct: number;
  estimateCents: number;
  bandLowCents: number;
  bandHighCents: number;
  category: string;
  /**
   * - 'estimated_aov' — the store has no orders yet, used the category-typical
   *   AOV. Surfacing this lets the UI show "estimated" badging until real AOV
   *   data is available.
   * - 'not_classified' — query was healthy, no gap.
   */
  note?: 'estimated_aov' | 'not_classified';
}

/**
 * Pure revenue estimate. Formula (PRD §10.3):
 *     estimate = monthlyVolume × aov × benchmarkPct
 *     band     = estimate × (1 ± CLASSIFY_REVENUE_BAND_PCT)
 *
 * Worked example: 200 × $42 × 10% = $840, band $672 – $1,008.
 *
 * Edge cases:
 *   • classification == NONE (query is fine) → zero estimate, note='not_classified'
 *   • aovCents == null (insufficient data)   → zero estimate, note='missing_aov'
 *   • monthlyVolume <= 0                     → zero estimate
 *   • benchmark missing for category         → DEFAULT (with warn log inside benchmarkFor)
 */
export function estimateRevenue(input: RevenueInput): RevenueEstimate {
  const { pct, category } = benchmarkFor(input.storeCategory);

  if (input.classificationType === 'NONE') {
    return zero(pct, category, 'not_classified');
  }
  if (input.monthlyVolume <= 0) {
    return zero(pct, category);
  }

  // Fall back to a category-typical AOV when the store has no orders yet so
  // dashboards on day-one show real magnitudes instead of $0. The note flag
  // lets the UI badge these as estimates until real AOV data arrives.
  let aovCents = input.aovCents;
  let note: RevenueEstimate['note'];
  if (aovCents == null) {
    const fallback = defaultAovFor(input.storeCategory);
    aovCents = fallback.aovCents;
    note = 'estimated_aov';
    logger.debug(
      {
        category: input.storeCategory,
        fallbackAovCents: aovCents,
        monthlyVolume: input.monthlyVolume,
        benchmarkPct: pct,
      },
      'revenue.estimate using fallback AOV',
    );
  }

  // Integer-cents math: multiply volume × aovCents first (both integers) then
  // scale by benchmark percentage. Rounding at the end keeps numeric drift
  // below ±1 cent for the worked-example magnitudes.
  const estimateCents = Math.round(input.monthlyVolume * aovCents * pct);

  const bandPct = engineConfig.revenueBandPct;
  const bandLowCents = Math.round(estimateCents * (1 - bandPct));
  const bandHighCents = Math.round(estimateCents * (1 + bandPct));

  return {
    monthlyVolume: input.monthlyVolume,
    aovCents,
    benchmarkPct: pct,
    estimateCents,
    bandLowCents,
    bandHighCents,
    category,
    ...(note ? { note } : {}),
  };
}

function zero(pct: number, category: string, note?: RevenueEstimate['note']): RevenueEstimate {
  return {
    monthlyVolume: 0,
    aovCents: 0,
    benchmarkPct: pct,
    estimateCents: 0,
    bandLowCents: 0,
    bandHighCents: 0,
    category,
    ...(note ? { note } : {}),
  };
}
