import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { ingestProducts } from '@/lib/ingestion/products';
import { acquireStoreMutex } from '@/lib/ingestion/mutex';
import { startRun, finishRun } from '@/lib/ingestion/runs';
import { ShopifyAuthError } from '@/lib/shopify/client';
import type { IngestionJobData } from '../queue';
import { ingestionQueue } from '../queue';

const AUTH_RETRY_DELAY_MS = 5 * 60 * 1000;

export async function ingestProductsProcessor(job: Job<IngestionJobData>): Promise<void> {
  const { storeId, force } = job.data;
  const mutex = await acquireStoreMutex(storeId, 30 * 60, 'products');
  if (!mutex) {
    logger.info({ storeId, jobId: job.id }, 'Store locked — re-enqueueing products sync');
    await ingestionQueue.add(
      'ingest:products',
      { storeId, force, origin: job.data.origin },
      { jobId: `retry-${storeId}-products-${Date.now()}`, delay: 3_000 },
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

      if (err instanceof ShopifyAuthError) {
        logger.warn(
          { storeId, shop: store.shopDomain },
          'ShopifyAuthError in products processor — re-queuing after delay for token exchange',
        );
        await ingestionQueue.add(
          'ingest:products',
          { storeId, force: true, origin: 'manual' },
          {
            jobId: `auth-retry-${storeId}-products-${Date.now()}`,
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
