import { Worker } from 'bullmq';
import {
  connection,
  QUEUES,
  maintenanceQueue,
  type IngestionJobData,
  type IngestionJobName,
} from './queue';
import { ingestSearchProcessor } from './processors/ingest-search';
import { ingestOrdersProcessor } from './processors/ingest-orders';
import { ingestProductsProcessor } from './processors/ingest-products';
import { redactPurgeProcessor } from './processors/redact-purge';
import { classifyProcessor } from './processors/classify';
import { digestProcessor } from './processors/digest';
import { seedCronJobs } from './schedule';
import { moveToDlq } from './dlq';
import { logger } from '@/lib/logger';

const handlers: Record<IngestionJobName, Parameters<typeof Worker>[1]> = {
  'ingest:search': ingestSearchProcessor,
  'ingest:orders': ingestOrdersProcessor,
  'ingest:products': ingestProductsProcessor,
};

const ingestionWorker = new Worker<IngestionJobData, unknown, IngestionJobName>(
  QUEUES.INGESTION,
  async (job) => {
    const handler = handlers[job.name];
    if (!handler) throw new Error(`No handler for job name ${job.name}`);
    return handler(job);
  },
  { connection, concurrency: 10 },
);

ingestionWorker.on('failed', async (job, err) => {
  logger.error(
    {
      queue: QUEUES.INGESTION,
      name: job?.name,
      jobId: job?.id,
      storeId: job?.data?.storeId,
      attemptsMade: job?.attemptsMade,
      err: err.message,
    },
    'Ingestion job failed',
  );
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await moveToDlq(job, err);
  }
});

ingestionWorker.on('completed', (job) => {
  logger.debug(
    { queue: QUEUES.INGESTION, name: job.name, jobId: job.id, storeId: job.data?.storeId },
    'Ingestion job completed',
  );
});

const classifyWorker = new Worker(
  QUEUES.CLASSIFY,
  async (job) => classifyProcessor(job),
  { connection, concurrency: 4 },
);
classifyWorker.on('failed', async (job, err) => {
  logger.error(
    { queue: QUEUES.CLASSIFY, jobId: job?.id, storeId: job?.data?.storeId, err: err.message },
    'Classification job failed',
  );
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await moveToDlq(job, err);
  }
});

const digestWorker = new Worker(
  QUEUES.DIGEST,
  async (job) => digestProcessor(job),
  { connection, concurrency: 4 },
);
digestWorker.on('failed', (job, err) => {
  logger.error(
    { queue: QUEUES.DIGEST, jobId: job?.id, storeId: job?.data?.storeId, err: err.message },
    'Digest job failed',
  );
});

const maintenanceWorker = new Worker(
  QUEUES.MAINTENANCE,
  async (job) => {
    if (job.name === 'redact-purge') return redactPurgeProcessor();
    throw new Error(`unknown maintenance job: ${job.name}`);
  },
  { connection, concurrency: 1 },
);
maintenanceWorker.on('failed', (job, err) => {
  logger.error({ name: job?.name, err: err.message }, 'Maintenance job failed');
});

async function shutdown(): Promise<void> {
  logger.info('Worker shutting down');
  await Promise.all([
    ingestionWorker.close(),
    classifyWorker.close(),
    digestWorker.close(),
    maintenanceWorker.close(),
  ]);
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

void seedCronJobs().catch((err) => {
  logger.error({ err: (err as Error).message }, 'seedCronJobs failed');
});

// Daily redact purge at 01:00 UTC.
void maintenanceQueue
  .add('redact-purge', {}, { repeat: { pattern: '0 1 * * *' }, jobId: 'cron:redact-purge' })
  .catch((err) => {
    logger.error({ err: (err as Error).message }, 'redact-purge cron seeding failed');
  });

logger.info('BullMQ workers online (ingestion=10, classify=4, digest=4, maintenance=1)');
