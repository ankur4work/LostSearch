import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '@/lib/env';

export const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const QUEUES = {
  INGESTION: 'ingestion',
  CLASSIFY: 'classify',
  DIGEST: 'digest',
  MAINTENANCE: 'maintenance',
  DLQ: 'dead-letter',
} as const;

export type IngestionJobName = 'ingest:search' | 'ingest:orders' | 'ingest:products';

export interface IngestionJobData {
  storeId: string;
  /** For search: days backfill. For orders: window. Undefined → daily default. */
  sinceDays?: number;
  /** For products: skip the 24h guard. */
  force?: boolean;
  /** Cron-originated jobs carry this so processors know not to re-enqueue self. */
  origin: 'install' | 'cron' | 'manual';
}

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 15_000 },
  removeOnComplete: { count: 500, age: 7 * 86_400 },
  removeOnFail: { count: 1000, age: 30 * 86_400 },
};

export const ingestionQueue = new Queue<IngestionJobData, unknown, IngestionJobName>(
  QUEUES.INGESTION,
  { connection, defaultJobOptions },
);

export const dlq = new Queue<IngestionJobData & { originalError: string }, unknown, string>(
  QUEUES.DLQ,
  { connection, defaultJobOptions: { removeOnComplete: false, removeOnFail: false } },
);

export const maintenanceQueue = new Queue<Record<string, never>, unknown, 'redact-purge'>(
  QUEUES.MAINTENANCE,
  { connection, defaultJobOptions },
);

export interface ClassifyJobData {
  storeId: string;
  origin: 'post-ingest' | 'manual' | 'cron';
}

export const classifyQueue = new Queue<ClassifyJobData, unknown, 'classify:store'>(
  QUEUES.CLASSIFY,
  { connection, defaultJobOptions },
);

export interface DigestJobPayload {
  storeId: string;
  timezone: string;
}

export const digestQueue = new Queue<DigestJobPayload, unknown, 'digest:weekly'>(
  QUEUES.DIGEST,
  { connection, defaultJobOptions },
);

export const ingestionEvents = new QueueEvents(QUEUES.INGESTION, { connection });
