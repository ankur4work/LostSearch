import { env } from '../env';

/**
 * Classification & revenue-engine knobs. All sourced from Zod-validated env so
 * they're tweakable at boot without code changes. The classifier reads from
 * this module (not process.env directly) so tests can monkey-patch the export.
 */
export const engineConfig = {
  fuzzyThreshold: env.CLASSIFY_FUZZY_THRESHOLD,
  semanticThreshold: env.CLASSIFY_SEMANTIC_THRESHOLD,
  lowVolumeCutoff: env.CLASSIFY_LOW_VOLUME_CUTOFF,
  type3OccurrenceMin: env.CLASSIFY_TYPE3_OCCURRENCE_MIN,
  revenueBandPct: env.CLASSIFY_REVENUE_BAND_PCT,
  queryEmbeddingTtlDays: env.CLASSIFY_QUERY_EMBEDDING_TTL_DAYS,
  windowDays: env.CLASSIFY_WINDOW_DAYS,
  parallelism: env.CLASSIFY_PARALLELISM,
};

export type EngineConfig = typeof engineConfig;
