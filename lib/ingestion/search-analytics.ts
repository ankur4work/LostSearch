import type { Store } from '@prisma/client';
import { prisma } from '../prisma';
import { logger } from '../logger';
import { updateProgress } from './runs';

/**
 * "Ingestion" for search analytics is now a no-op pipeline — actual data
 * arrives in real time via the storefront tracker (`/tracker.js` +
 * `/api/events/search`). We dropped Shopify's `online_store_search_analytics`
 * ShopifyQL dependency so merchants don't need to install the Search &
 * Discovery app as a prerequisite.
 *
 * This job's only remaining purpose is:
 *   1. Stamp `lastSearchSync` so the dashboard's "last synced X hours ago"
 *      is honest (we checked the data pipeline today).
 *   2. Report row counts collected by the tracker in the configured window,
 *      for logs + the ingestion runs table.
 *
 * Classification still runs afterwards (triggered by this job's completion)
 * and reads from the same `search_queries` table.
 */
export interface SearchIngestionOptions {
  sinceDays: number;
  runId?: string;
}

export async function ingestSearchAnalytics(
  store: Store,
  opts: SearchIngestionOptions,
): Promise<{ rowsWritten: number; enabled: boolean }> {
  const since = new Date(Date.now() - opts.sinceDays * 86_400_000);

  const count = await prisma.searchQuery.count({
    where: { storeId: store.id, occurredAt: { gte: since } },
  });

  if (opts.runId) await updateProgress(opts.runId, 100);

  await prisma.store.update({
    where: { id: store.id },
    data: { lastSearchSync: new Date() },
  });

  logger.info(
    { shop: store.shopDomain, sinceDays: opts.sinceDays, rowsSeen: count },
    'Search sync tick — data collected via storefront tracker',
  );

  return { rowsWritten: count, enabled: true };
}
