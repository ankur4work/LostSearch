import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { ingestProducts } from '@/lib/ingestion/products';
import { acquireStoreMutex } from '@/lib/ingestion/mutex';
import { startRun, finishRun } from '@/lib/ingestion/runs';
import type { IngestionJobData } from '../queue';

export async function ingestProductsProcessor(job: Job<IngestionJobData>): Promise<void> {
  const { storeId, force } = job.data;
  const mutex = await acquireStoreMutex(storeId, 30 * 60);
  if (!mutex) {
    logger.info({ storeId, jobId: job.id }, 'Store locked — re-enqueueing products sync');
    await job.moveToDelayed(Date.now() + 30_000, job.token);
    return;
  }
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || store.uninstalledAt) {
    await mutex.release();
    return;
  }
  const run = await startRun({
    storeId,
    jobType: 'INGEST_PRODUCTS',
    bullJobId: job.id ?? null,
    attempt: job.attemptsMade + 1,
  });
  try {
    await ingestProducts(store, { force, runId: run.id });
    await finishRun(run.id, 'DONE');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishRun(run.id, 'FAILED', msg);
    throw err;
  } finally {
    await mutex.release();
  }
}
