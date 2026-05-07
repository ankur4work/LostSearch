import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';
import { invalidate as invalidateCache } from '@/lib/cache';
import { clearStoreMutexes } from '@/lib/ingestion/mutex';

export const ingestionRouter = router({
  /**
   * On-demand sync. Enqueues fresh products + orders + search jobs for the
   * caller's store, then returns immediately. The dashboard polls
   * `onboarding.status` to surface progress.
   */
  syncNow: protectedProcedure.mutation(async ({ ctx }) => {
    const storeId = ctx.session?.storeId;
    if (!storeId) throw new TRPCError({ code: 'UNAUTHORIZED' });

    await clearStoreMutexes(storeId);

    const { enqueueInstallBackfill } = await import('@/jobs/schedule');
    await enqueueInstallBackfill(storeId);

    // Bust the cached dashboard summary so the next refresh shows a fresh
    // `lastSyncedAt` timestamp the moment the worker stamps it (instead of up
    // to 60s of staleness from the read-through cache).
    await invalidateCache(`dash:summary:v1:${storeId}`).catch(() => undefined);

    return { ok: true, storeId };
  }),
});
