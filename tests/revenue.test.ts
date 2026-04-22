import { describe, it, expect } from 'vitest';
import { estimateRevenue } from '@/lib/engine/revenue';
import type { ClassificationType } from '@prisma/client';

// 20 representative scenarios. Snapshot is literal (not vitest `.toMatchSnapshot`)
// so that diffs show up explicitly in PRs and nobody is tempted to `-u` the file.
const SCENARIOS: Array<{
  name: string;
  input: Parameters<typeof estimateRevenue>[0];
  expect: {
    estimateCents: number;
    bandLowCents: number;
    bandHighCents: number;
    note?: 'missing_aov' | 'not_classified';
  };
}> = [
  // PRD §10.3 worked example: 200 × $42 × 10% = $840, band $672 – $1008.
  {
    name: 'PRD example — fashion 200/$42/10%',
    input: { classificationType: 'TYPE_1', monthlyVolume: 200, aovCents: 4200, storeCategory: 'FASHION' },
    expect: { estimateCents: 84_000, bandLowCents: 67_200, bandHighCents: 100_800 },
  },
  {
    name: 'fashion small volume 10/$42/10%',
    input: { classificationType: 'TYPE_1', monthlyVolume: 10, aovCents: 4200, storeCategory: 'FASHION' },
    expect: { estimateCents: 4_200, bandLowCents: 3_360, bandHighCents: 5_040 },
  },
  {
    name: 'beauty 500/$28/12%',
    input: { classificationType: 'TYPE_2', monthlyVolume: 500, aovCents: 2800, storeCategory: 'BEAUTY' },
    expect: { estimateCents: 168_000, bandLowCents: 134_400, bandHighCents: 201_600 },
  },
  {
    name: 'electronics 100/$150/7.5%',
    input: { classificationType: 'TYPE_1', monthlyVolume: 100, aovCents: 15_000, storeCategory: 'ELECTRONICS' },
    expect: { estimateCents: 112_500, bandLowCents: 90_000, bandHighCents: 135_000 },
  },
  {
    name: 'home 250/$65/9%',
    input: { classificationType: 'TYPE_4', monthlyVolume: 250, aovCents: 6500, storeCategory: 'HOME' },
    expect: { estimateCents: 146_250, bandLowCents: 117_000, bandHighCents: 175_500 },
  },
  {
    name: 'food 800/$22/14%',
    input: { classificationType: 'TYPE_3', monthlyVolume: 800, aovCents: 2200, storeCategory: 'FOOD' },
    expect: { estimateCents: 246_400, bandLowCents: 197_120, bandHighCents: 295_680 },
  },
  {
    name: 'unknown category → DEFAULT 8%',
    input: { classificationType: 'TYPE_1', monthlyVolume: 100, aovCents: 5000, storeCategory: 'PET_SUPPLIES' },
    expect: { estimateCents: 40_000, bandLowCents: 32_000, bandHighCents: 48_000 },
  },
  {
    name: 'alias: APPAREL → FASHION 10%',
    input: { classificationType: 'TYPE_1', monthlyVolume: 100, aovCents: 5000, storeCategory: 'APPAREL' },
    expect: { estimateCents: 50_000, bandLowCents: 40_000, bandHighCents: 60_000 },
  },
  {
    name: 'alias: GROCERY → FOOD 14%',
    input: { classificationType: 'TYPE_2', monthlyVolume: 100, aovCents: 5000, storeCategory: 'GROCERY' },
    expect: { estimateCents: 70_000, bandLowCents: 56_000, bandHighCents: 84_000 },
  },
  {
    name: 'null category → DEFAULT',
    input: { classificationType: 'TYPE_1', monthlyVolume: 100, aovCents: 5000, storeCategory: null },
    expect: { estimateCents: 40_000, bandLowCents: 32_000, bandHighCents: 48_000 },
  },
  {
    name: 'case-insensitive category',
    input: { classificationType: 'TYPE_1', monthlyVolume: 100, aovCents: 5000, storeCategory: 'fashion' },
    expect: { estimateCents: 50_000, bandLowCents: 40_000, bandHighCents: 60_000 },
  },
  {
    name: 'monthlyVolume = 0 → zero estimate',
    input: { classificationType: 'TYPE_1', monthlyVolume: 0, aovCents: 4200, storeCategory: 'FASHION' },
    expect: { estimateCents: 0, bandLowCents: 0, bandHighCents: 0 },
  },
  {
    name: 'negative volume → zero estimate',
    input: { classificationType: 'TYPE_1', monthlyVolume: -5, aovCents: 4200, storeCategory: 'FASHION' },
    expect: { estimateCents: 0, bandLowCents: 0, bandHighCents: 0 },
  },
  {
    name: 'NONE classification → zero + note not_classified',
    input: { classificationType: 'NONE', monthlyVolume: 200, aovCents: 4200, storeCategory: 'FASHION' },
    expect: { estimateCents: 0, bandLowCents: 0, bandHighCents: 0, note: 'not_classified' },
  },
  {
    name: 'null AOV → zero + note missing_aov',
    input: { classificationType: 'TYPE_1', monthlyVolume: 200, aovCents: null, storeCategory: 'FASHION' },
    expect: { estimateCents: 0, bandLowCents: 0, bandHighCents: 0, note: 'missing_aov' },
  },
  {
    name: 'tiny AOV $0.01 → rounds correctly',
    input: { classificationType: 'TYPE_1', monthlyVolume: 100, aovCents: 1, storeCategory: 'FASHION' },
    expect: { estimateCents: 10, bandLowCents: 8, bandHighCents: 12 },
  },
  {
    name: 'large volumes integer-safe 10000/$100/10%',
    input: { classificationType: 'TYPE_1', monthlyVolume: 10_000, aovCents: 10_000, storeCategory: 'FASHION' },
    expect: { estimateCents: 10_000_000, bandLowCents: 8_000_000, bandHighCents: 12_000_000 },
  },
  {
    name: 'UNCAT treated like a classified type (zero only if AOV missing)',
    input: { classificationType: 'UNCAT' as ClassificationType, monthlyVolume: 50, aovCents: 5000, storeCategory: 'FASHION' },
    expect: { estimateCents: 25_000, bandLowCents: 20_000, bandHighCents: 30_000 },
  },
  {
    name: 'electronics low AOV 10000/$1/7.5%',
    input: { classificationType: 'TYPE_1', monthlyVolume: 10_000, aovCents: 100, storeCategory: 'ELECTRONICS' },
    expect: { estimateCents: 75_000, bandLowCents: 60_000, bandHighCents: 90_000 },
  },
  {
    name: 'rounding: 33 × 333 × 0.10 = 1098.9 → 1099',
    input: { classificationType: 'TYPE_1', monthlyVolume: 33, aovCents: 333, storeCategory: 'FASHION' },
    expect: {
      estimateCents: 1099,
      bandLowCents: Math.round(1099 * 0.8),
      bandHighCents: Math.round(1099 * 1.2),
    },
  },
];

describe('estimateRevenue — scenario snapshots', () => {
  it.each(SCENARIOS)('$name', (scenario) => {
    const out = estimateRevenue(scenario.input);
    expect(out.estimateCents).toBe(scenario.expect.estimateCents);
    expect(out.bandLowCents).toBe(scenario.expect.bandLowCents);
    expect(out.bandHighCents).toBe(scenario.expect.bandHighCents);
    if (scenario.expect.note) expect(out.note).toBe(scenario.expect.note);
  });

  it('PRD §10.3 worked example — dollar amounts', () => {
    const out = estimateRevenue({
      classificationType: 'TYPE_1',
      monthlyVolume: 200,
      aovCents: 4200,
      storeCategory: 'FASHION',
    });
    expect(out.estimateCents / 100).toBe(840);
    expect(out.bandLowCents / 100).toBe(672);
    expect(out.bandHighCents / 100).toBe(1008);
    expect(out.benchmarkPct).toBe(0.10);
  });

  it('is a pure function (no side effects across calls)', () => {
    const input = {
      classificationType: 'TYPE_1' as const,
      monthlyVolume: 200,
      aovCents: 4200,
      storeCategory: 'FASHION',
    };
    const a = estimateRevenue(input);
    const b = estimateRevenue(input);
    expect(a).toEqual(b);
  });
});
