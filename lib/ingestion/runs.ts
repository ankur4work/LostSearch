import type { IngestionJobType, IngestionRun, IngestionStatus } from '@prisma/client';
import { prisma } from '../prisma';
import { invalidate } from '../cache';
import { track } from '../analytics';
import { logger } from '../logger';

export async function startRun(input: {
  storeId: string;
  jobType: IngestionJobType;
  bullJobId: string | null;
  attempt: number;
}): Promise<IngestionRun> {
  return prisma.ingestionRun.create({
    data: {
      storeId: input.storeId,
      jobType: input.jobType,
      bullJobId: input.bullJobId,
      attempt: input.attempt,
      status: 'RUNNING',
      startedAt: new Date(),
      progressPct: 0,
    },
  });
}

export async function updateProgress(
  runId: string,
  progressPct: number,
  counts?: { total: number; done: number },
): Promise<void> {
  await prisma.ingestionRun.update({
    where: { id: runId },
    data: {
      progressPct: Math.max(0, Math.min(100, Math.round(progressPct))),
      ...(counts && { progressTotal: counts.total, progressDone: counts.done }),
    },
  });
}

export async function finishRun(
  runId: string,
  status: Extract<IngestionStatus, 'DONE' | 'FAILED'>,
  errorMessage?: string,
): Promise<void> {
  const run = await prisma.ingestionRun.update({
    where: { id: runId },
    data: {
      status,
      finishedAt: new Date(),
      progressPct: status === 'DONE' ? 100 : undefined,
      errorMessage: errorMessage?.slice(0, 2000) ?? null,
    },
  });

  // Fire onboarding_completed once per store, when the last of the three
  // install-time ingestion jobs lands. Idempotent via firstDashboardViewAt
  // being independent; this event uses `distinctId: storeId + ':onboarding'`
  // so PostHog de-dupes by insertion order.
  if (status === 'DONE') {
    const latestByType = await prisma.ingestionRun.groupBy({
      by: ['jobType'],
      where: { storeId: run.storeId },
      _max: { status: true, finishedAt: true },
    });
    const allDone =
      latestByType.length >= 3 &&
      latestByType.every((r) => r._max.status === 'DONE');
    if (allDone) {
      // Bust the dashboard summary Redis cache so the next tRPC refetch sees
      // fresh gap counts rather than data cached before the sync ran.
      await invalidate(`dash:summary:v1:${run.storeId}`).catch(() => undefined);

      const store = await prisma.store.findUnique({
        where: { id: run.storeId },
        select: { shopDomain: true, firstDashboardViewAt: true },
      });
      if (store) {
        track({
          event: 'onboarding_completed',
          distinctId: run.storeId,
          properties: { shop: store.shopDomain },
        });
        logger.info({ storeId: run.storeId }, 'onboarding_completed fired');
      }
    }
  }
}
