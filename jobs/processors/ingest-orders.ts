import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { ingestOrders } from '@/lib/ingestion/orders';
import { acquireStoreMutex } from '@/lib/ingestion/mutex';
import { startRun, finishRun } from '@/lib/ingestion/runs';
import { ShopifyAuthError } from '@/lib/shopify/client';
import { isTokenExpired } from '@/lib/shopify/store';
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

    if (isTokenExpired(store)) {
      logger.warn({ storeId, shop: store.shopDomain }, 'Access token expired — skipping orders sync until merchant reopens app');
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

      if (err instanceof ShopifyAuthError) {
        await finishRun(run.id, 'FAILED', msg);
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

      // Shopify requires "Protected customer data" approval to read orders.
      // Treat this as 0 orders rather than failing — AOV will be skipped but
      // the rest of the pipeline (products, search) can still complete.
      if (msg.includes('not approved to access the Order object')) {
        logger.warn({ storeId, shop: store.shopDomain }, 'Orders access not approved — marking done with 0 orders');
        await finishRun(run.id, 'DONE', msg);
        return;
      }

      await finishRun(run.id, 'FAILED', msg);
      throw err;
    }
  } finally {
    await mutex.release();
  }
}
