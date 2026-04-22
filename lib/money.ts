/**
 * Money helpers: always work in cents on the wire. Locale-aware format at the
 * render edge. No floats in math paths.
 */

export function formatMoney(
  cents: number,
  currency: string,
  opts: { locale?: string; fractionDigits?: number } = {},
): string {
  const { locale = 'en-US', fractionDigits = 0 } = opts;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(cents / 100);
}

export function formatMoneyRange(
  loCents: number,
  hiCents: number,
  currency: string,
  opts: { locale?: string } = {},
): string {
  return `${formatMoney(loCents, currency, opts)} — ${formatMoney(hiCents, currency, opts)}`;
}

export type RevenueBucket = 'LOW' | 'MED' | 'HIGH';

export function bucketForEstimate(estimateCents: number): RevenueBucket {
  if (estimateCents >= 100_000) return 'HIGH';   // ≥ $1000/mo
  if (estimateCents >= 20_000) return 'MED';     // $200–$1000/mo
  return 'LOW';                                  // < $200/mo
}

export function labelForBucket(bucket: RevenueBucket, currency: string, locale = 'en-US'): string {
  const fmt = (c: number): string =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(c / 100);
  switch (bucket) {
    case 'HIGH':
      return `${fmt(100_000)}+`;
    case 'MED':
      return `${fmt(20_000)} – ${fmt(100_000)}`;
    case 'LOW':
      return `< ${fmt(20_000)}`;
  }
}
