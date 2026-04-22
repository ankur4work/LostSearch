import { readFileSync, watch } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { logger } from '../logger';

const BenchmarksSchema = z.object({
  version: z.number().int().positive(),
  updatedAt: z.string(),
  source: z.string().optional(),
  default: z.number().min(0).max(1),
  categories: z.record(z.string(), z.number().min(0).max(1)),
  aliases: z.record(z.string(), z.string()).optional().default({}),
});

export type Benchmarks = z.infer<typeof BenchmarksSchema>;

const benchmarksPath = resolve(process.cwd(), 'data', 'benchmarks.json');

let cache: Benchmarks = loadFromDisk();

function loadFromDisk(): Benchmarks {
  const raw = readFileSync(benchmarksPath, 'utf8');
  const parsed = BenchmarksSchema.parse(JSON.parse(raw));
  return parsed;
}

// Hot-reload: editing data/benchmarks.json re-loads without restart.
if (process.env.NODE_ENV !== 'test') {
  try {
    watch(benchmarksPath, { persistent: false }, () => {
      try {
        cache = loadFromDisk();
        logger.info({ version: cache.version }, 'Benchmarks hot-reloaded');
      } catch (err) {
        logger.error({ err: (err as Error).message }, 'Benchmarks reload failed — keeping old version');
      }
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Benchmarks file watcher unavailable');
  }
}

export function getBenchmarks(): Benchmarks {
  return cache;
}

/**
 * Resolve a category key (case-insensitive; honors aliases). Missing keys log
 * a warning and fall back to `default` — never throw.
 */
export function benchmarkFor(category: string | null | undefined): {
  pct: number;
  category: string;
  source: 'exact' | 'alias' | 'default';
} {
  const b = cache;
  if (!category) return { pct: b.default, category: 'DEFAULT', source: 'default' };
  const key = category.toUpperCase().trim();
  const direct = b.categories[key];
  if (direct !== undefined) return { pct: direct, category: key, source: 'exact' };
  const aliasTarget = b.aliases[key];
  if (aliasTarget && b.categories[aliasTarget] !== undefined) {
    return { pct: b.categories[aliasTarget] as number, category: aliasTarget, source: 'alias' };
  }
  logger.warn(
    { category: key, availableCategories: Object.keys(b.categories) },
    'Benchmark missing for category — falling back to DEFAULT',
  );
  return { pct: b.default, category: 'DEFAULT', source: 'default' };
}
