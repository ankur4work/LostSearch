import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { runClassificationPipeline } from '@/lib/engine/pipeline';
import { acquireStoreMutex } from '@/lib/ingestion/mutex';
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
  } finally {
    await mutex.release();
  }
}
