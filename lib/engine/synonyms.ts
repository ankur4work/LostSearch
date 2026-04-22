import { readFileSync, watch } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { logger } from '../logger';
import { normalizeQuery } from '../ingestion/normalize';

const SynonymEntrySchema = z.object({
  canonical: z.string().min(1),
  synonyms: z.array(z.string().min(1)),
  category: z.string().default('DEFAULT'),
});

const SynonymsFileSchema = z.object({
  version: z.number().int().positive(),
  updatedAt: z.string(),
  note: z.string().optional(),
  entries: z.array(SynonymEntrySchema),
});

export type SynonymEntry = z.infer<typeof SynonymEntrySchema>;

const path = resolve(process.cwd(), 'data', 'synonyms.json');

interface SynonymIndex {
  /** map: normalized-term → set of normalized-terms that are synonymous with it */
  adjacency: Map<string, Set<string>>;
  entries: SynonymEntry[];
}

let cache: SynonymIndex = buildIndex(loadFromDisk());

function loadFromDisk(): SynonymEntry[] {
  const raw = readFileSync(path, 'utf8');
  return SynonymsFileSchema.parse(JSON.parse(raw)).entries;
}

function buildIndex(entries: SynonymEntry[]): SynonymIndex {
  const adjacency = new Map<string, Set<string>>();
  for (const e of entries) {
    const all = [e.canonical, ...e.synonyms].map(normalizeQuery).filter(Boolean);
    for (const term of all) {
      const set = adjacency.get(term) ?? new Set<string>();
      for (const other of all) if (other !== term) set.add(other);
      adjacency.set(term, set);
    }
  }
  return { adjacency, entries };
}

if (process.env.NODE_ENV !== 'test') {
  try {
    watch(path, { persistent: false }, () => {
      try {
        cache = buildIndex(loadFromDisk());
        logger.info({ termCount: cache.adjacency.size }, 'Synonyms hot-reloaded');
      } catch (err) {
        logger.error({ err: (err as Error).message }, 'Synonyms reload failed — keeping old version');
      }
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Synonyms file watcher unavailable');
  }
}

export function getSynonyms(): SynonymIndex {
  return cache;
}

/**
 * Expand a normalized query into itself + all known synonyms. Bidirectional
 * edges mean `expand("bandhgala")` returns `["bandhgala", "ethnic jacket", ...]`
 * and vice versa.
 */
export function expandSynonyms(normalized: string): string[] {
  const peers = cache.adjacency.get(normalized);
  if (!peers) return [normalized];
  return [normalized, ...peers];
}

/** Deterministic, sorted expansion — for snapshot tests. */
export function expandSynonymsSorted(normalized: string): string[] {
  return expandSynonyms(normalized).slice().sort();
}

/** Test helper: override the in-memory index without touching disk. */
export function __setSynonymsForTest(entries: SynonymEntry[]): void {
  cache = buildIndex(entries);
}
