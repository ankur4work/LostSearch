import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { ingestOrders } from '@/lib/ingestion/orders';
import { acquireStoreMutex } from '@/lib/ingestion/mutex';
import { startRun, finishRun } from '@/lib/ingestion/runs';
import { ShopifyAuthError } from '@/lib/shopify/client';
import type { IngestionJobData } from '../queue';
import { ingestionQueue } from '../queue';

const AUTH_RETRY_DELAY_MS = 5 * 60 * 1000;

export async function ingestOrdersProcessor(job: Job<IngestionJobData>): Promise<void> {
  const { storeId, sinceDays = 90 } = job.data;
  const mutex = await acquireStoreMutex(storeId, 600, 'orders');
  if (!mutex) {
    logger.info({ storeId, jobId: job.id }, 'Store locked — re-enqueueing orders sync');
    await ingestionQueue.add(
      'ingest:orders',
      { storeId, sinceDays, origin: job.data.origin },
      { jobId: `retry-${storeId}-orders-${Date.now()}`, delay: 3_000 },
    );
    return;
  }

  try {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store || store.uninstalledAt) {
      return;
    }

    const run = await startRun({
      storeId,
      jobType: 'INGEST_ORDERS',
      bullJobId: job.id ?? null,
      attempt: job.attemptsMade + 1,
    });

    try {
      await ingestOrders(store, { windowDays: sinceDays, runId: run.id });
      await finishRun(run.id, 'DONE');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await finishRun(run.id, 'FAILED', msg);

      if (err instanceof ShopifyAuthError) {
        logger.warn(
          { storeId, shop: store.shopDomain },
          'ShopifyAuthError in orders processor — re-queuing after delay for token exchange',
        );
        await ingestionQueue.add(
          'ingest:orders',
          { storeId, sinceDays, origin: 'manual' },
          {
            jobId: `auth-retry-${storeId}-orders-${Date.now()}`,
            delay: AUTH_RETRY_DELAY_MS,
          },
        );
        return;
      }

      throw err;
    }
  } finally {
    await mutex.release();
  }
}
