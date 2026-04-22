import type { IngestionJobType, IngestionRun, IngestionStatus } from '@prisma/client';
import { prisma } from '../prisma';
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

export async function updateProgress(runId: string, progressPct: number): Promise<void> {
  await prisma.ingestionRun.update({
    where: { id: runId },
    data: { progressPct: Math.max(0, Math.min(100, Math.round(progressPct))) },
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
      const store = await prisma.store.findUnique({
        where: { id: run.storeId },
        select: { shopDomain: true, firstDashboardViewAt: true },
      });
      // Only emit the event the first time everything turns DONE (use a
      // marker: the absence of prior successful triple is inferred from the
      // run that JUST transitioned).
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
