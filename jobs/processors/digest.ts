import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { sendWeeklyDigest } from '@/lib/email/digest';

/** Repeatable job payload — we enqueue one job per store with its timezone. */
export interface DigestJobData {
  storeId: string;
  timezone: string;
}

export async function digestProcessor(job: Job<DigestJobData>): Promise<void> {
  const store = await prisma.store.findUnique({ where: { id: job.data.storeId } });
  if (!store) {
    logger.info({ storeId: job.data.storeId }, 'digest: store missing — skip');
    return;
  }
  const decision = await sendWeeklyDigest(store);
  logger.info(
    { storeId: store.id, decision, jobId: job.id, tz: job.data.timezone },
    'digest processor finished',
  );
}
