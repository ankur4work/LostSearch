import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { runClassificationPipeline } from '@/lib/engine/pipeline';
import { acquireStoreMutex } from '@/lib/ingestion/mutex';
import { invalidate } from '@/lib/cache';
import { classifyQueue, type ClassifyJobData } from '../queue';

export async function classifyProcessor(job: Job<ClassifyJobData>): Promise<void> {
  const { storeId } = job.data;
  const mutex = await acquireStoreMutex(storeId, 30 * 60, 'classify');
  if (!mutex) {
    logger.info({ storeId, jobId: job.id }, 'Store busy — re-enqueueing classify');
    await classifyQueue.add(
      'classify:store',
      { storeId, origin: job.data.origin },
      { jobId: `retry-classify-${storeId}-${Date.now()}`, delay: 3_000 },
    );
    return;
  }
  try {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store || store.uninstalledAt) {
      logger.info({ storeId }, 'Store missing or uninstalled — skipping classify');
      return;
    }
    await runClassificationPipeline(store);
    // Bust dashboard summary cache so the next poll/refetch sees the new
    // gap counts that classify just wrote. This is the authoritative bust —
    // the one in finishRun fires before classify runs so it's too early.
    await invalidate(`dash:summary:v1:${storeId}`).catch(() => undefined);
  } finally {
    await mutex.release();
  }
}
