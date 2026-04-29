import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  ingestionQueue,
  digestQueue,
  type IngestionJobName,
  type IngestionJobData,
} from './queue';

/**
 * Enqueue one-off backfill jobs (30d search, 90d orders, full product sync).
 * Used at install time AND for on-demand "Sync now" clicks. Each call uses a
 * unique jobId (timestamped) so BullMQ doesn't dedupe a re-sync.
 */
export async function enqueueInstallBackfill(storeId: string): Promise<void> {
  const common = { origin: 'install' as const };
  const ts = Date.now();
  await ingestionQueue.add(
    'ingest:products' satisfies IngestionJobName,
    { storeId, force: true, ...common } satisfies IngestionJobData,
    { jobId: `sync-${storeId}-products-${ts}` },
  );
  await ingestionQueue.add(
    'ingest:orders' satisfies IngestionJobName,
    { storeId, sinceDays: 90, ...common } satisfies IngestionJobData,
    { jobId: `sync-${storeId}-orders-${ts}` },
  );
  await ingestionQueue.add(
    'ingest:search' satisfies IngestionJobName,
    { storeId, sinceDays: 30, ...common } satisfies IngestionJobData,
    { jobId: `sync-${storeId}-search-${ts}` },
  );
  logger.info({ storeId, ts }, 'Backfill jobs enqueued');
}

/**
 * Cron seeding for all active stores. Call once on worker boot; BullMQ dedupes
 * repeatable jobs by (name, data, cron) pattern so calling at boot is safe.
 *
 * Stagger product syncs so we don't hammer embeddings on 1000 stores at once.
 */
export async function seedCronJobs(): Promise<void> {
  const stores = await prisma.store.findMany({
    where: { uninstalledAt: null },
    select: { id: true },
  });

  for (let i = 0; i < stores.length; i += 1) {
    const store = stores[i];
    if (!store) continue;
    const storeId = store.id;
    const cron = 'cron' as const;

    await ingestionQueue.add(
      'ingest:search',
      { storeId, sinceDays: 1, origin: cron },
      { repeat: { pattern: '0 2 * * *' }, jobId: `cron-${storeId}-search` },
    );
    await ingestionQueue.add(
      'ingest:orders',
      { storeId, sinceDays: 90, origin: cron },
      { repeat: { pattern: '0 3 * * *' }, jobId: `cron-${storeId}-orders` },
    );
    // Products: stagger every N minutes across the hour to smooth load.
    const staggerMin = i % 60;
    await ingestionQueue.add(
      'ingest:products',
      { storeId, origin: cron },
      { repeat: { pattern: `${staggerMin} 4 * * *` }, jobId: `cron-${storeId}-products` },
    );
  }
  // Weekly digest: BullMQ `repeat.pattern` with `tz` fires cron in the store's
  // timezone. Monday 09:00 local → Shopify IST store gets it at 09:00 IST, not
  // 09:00 UTC. Per-store repeatable so adding/removing scales cleanly.
  const storeDetails = await prisma.store.findMany({
    where: { uninstalledAt: null, digestOptedOutAt: null },
    select: { id: true, timezone: true },
  });
  for (const s of storeDetails) {
    const tz = s.timezone ?? 'UTC';
    await digestQueue.add(
      'digest:weekly',
      { storeId: s.id, timezone: tz },
      {
        repeat: { pattern: '0 9 * * 1', tz },
        jobId: `cron-${s.id}-digest`,
      },
    );
  }

  logger.info({ stores: stores.length }, 'Cron jobs seeded (ingestion + digest)');
}

/** Remove all queued + repeatable jobs for a store (called on uninstall). */
export async function cancelStoreJobs(storeId: string): Promise<void> {
  for (const q of [ingestionQueue, digestQueue]) {
    const repeatables = await q.getRepeatableJobs();
    for (const r of repeatables) {
      if (r.id?.includes(`cron:${storeId}:`)) {
        await q.removeRepeatableByKey(r.key);
      }
    }
    const states = ['wait', 'delayed', 'paused', 'waiting-children'] as const;
    const jobs = await q.getJobs(Array.from(states));
    for (const j of jobs) {
      if ((j.data as { storeId?: string } | undefined)?.storeId === storeId) {
        await j.remove();
      }
    }
  }
  logger.info({ storeId }, 'Pending jobs cancelled for store (ingestion + digest)');
}
