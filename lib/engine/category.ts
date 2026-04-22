import { logger } from '../logger';
import { getBenchmarks } from './benchmarks';

/**
 * Resolve a store's category in priority order:
 *   1. Shopify `storefrontShop.industry` (if set on the Store row).
 *   2. Majority vote of top-3 product tags (after aliasing).
 *   3. DEFAULT.
 *
 * Pure function — takes a snapshot, returns a key. The pipeline persists it.
 */
export function detectCategory(input: {
  industry: string | null;
  topTags: string[];
}): string {
  const b = getBenchmarks();
  const isKnown = (key: string): boolean =>
    key in b.categories || key in b.aliases || key === 'DEFAULT';

  const fromIndustry = normalize(input.industry);
  if (fromIndustry) {
    const resolved = b.aliases[fromIndustry] ?? fromIndustry;
    if (isKnown(resolved)) return resolved;
  }

  const votes = new Map<string, number>();
  for (const tag of input.topTags.slice(0, 3)) {
    const key = normalize(tag);
    if (!key) continue;
    const resolved = b.aliases[key] ?? key;
    if (isKnown(resolved)) votes.set(resolved, (votes.get(resolved) ?? 0) + 1);
  }

  let winner: string | null = null;
  let max = 0;
  // Deterministic: iterate in insertion order, first to reach the max wins.
  for (const [key, count] of votes) {
    if (count > max) {
      max = count;
      winner = key;
    }
  }
  if (winner) return winner;

  logger.debug({ input }, 'Category detection fell through to DEFAULT');
  return 'DEFAULT';
}

function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s.toUpperCase().trim();
}
