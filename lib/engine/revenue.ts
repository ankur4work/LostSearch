import type { ClassificationType } from '@prisma/client';
import { engineConfig } from './config';
import { benchmarkFor } from './benchmarks';

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
  note?: 'missing_aov' | 'not_classified';
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
  if (input.aovCents == null) {
    return zero(pct, category, 'missing_aov');
  }
  if (input.monthlyVolume <= 0) {
    return zero(pct, category);
  }

  // Integer-cents math: multiply volume × aovCents first (both integers) then
  // scale by benchmark percentage. Rounding at the end keeps numeric drift
  // below ±1 cent for the worked-example magnitudes.
  const estimateCents = Math.round(input.monthlyVolume * input.aovCents * pct);

  const bandPct = engineConfig.revenueBandPct;
  const bandLowCents = Math.round(estimateCents * (1 - bandPct));
  const bandHighCents = Math.round(estimateCents * (1 + bandPct));

  return {
    monthlyVolume: input.monthlyVolume,
    aovCents: input.aovCents,
    benchmarkPct: pct,
    estimateCents,
    bandLowCents,
    bandHighCents,
    category,
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
