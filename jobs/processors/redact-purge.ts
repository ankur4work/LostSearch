import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Invoked by a daily cron (via the redact queue) to hard-delete stores whose
 * 48h redact window has elapsed. Cascades through every child table.
 */
export async function redactPurgeProcessor(): Promise<void> {
  const now = new Date();
  const due = await prisma.store.findMany({
    where: { scheduledRedactAt: { lte: now } },
    select: { id: true, shopDomain: true },
  });
  for (const s of due) {
    await prisma.store.delete({ where: { id: s.id } });
    logger.info({ shop: s.shopDomain }, 'shop/redact purge — store deleted');
  }
}
