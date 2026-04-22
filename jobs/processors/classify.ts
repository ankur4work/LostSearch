import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { runClassificationPipeline } from '@/lib/engine/pipeline';
import { acquireStoreMutex } from '@/lib/ingestion/mutex';
import type { ClassifyJobData } from '../queue';

export async function classifyProcessor(job: Job<ClassifyJobData>): Promise<void> {
  const { storeId } = job.data;
  const mutex = await acquireStoreMutex(storeId, 30 * 60);
  if (!mutex) {
    logger.info({ storeId, jobId: job.id }, 'Store busy — re-enqueueing classify');
    await job.moveToDelayed(Date.now() + 30_000, job.token);
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
