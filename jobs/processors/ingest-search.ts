import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { ingestSearchAnalytics } from '@/lib/ingestion/search-analytics';
import { acquireStoreMutex } from '@/lib/ingestion/mutex';
import { startRun, finishRun } from '@/lib/ingestion/runs';
import { classifyQueue, type IngestionJobData } from '../queue';

export async function ingestSearchProcessor(job: Job<IngestionJobData>): Promise<void> {
  const { storeId, sinceDays = 1 } = job.data;
  const mutex = await acquireStoreMutex(storeId);
  if (!mutex) {
    logger.info({ storeId, jobId: job.id }, 'Store locked — re-enqueueing search sync');
    await job.moveToDelayed(Date.now() + 30_000, job.token);
    return;
  }
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || store.uninstalledAt) {
    logger.info({ storeId }, 'Store missing or uninstalled — skip');
    await mutex.release();
    return;
  }
  const run = await startRun({
    storeId,
    jobType: 'INGEST_SEARCH',
    bullJobId: job.id ?? null,
    attempt: job.attemptsMade + 1,
  });
  try {
    await ingestSearchAnalytics(store, { sinceDays, runId: run.id });
    await finishRun(run.id, 'DONE');
    // Trigger classification immediately on fresh search data. Dedup by jobId
    // so a burst of ingest:search completions only schedules one classify run.
    await classifyQueue.add(
      'classify:store',
      { storeId, origin: 'post-ingest' },
      { jobId: `classify:${storeId}:${Date.now()}` },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishRun(run.id, 'FAILED', msg);
    throw err;
  } finally {
    await mutex.release();
  }
}
