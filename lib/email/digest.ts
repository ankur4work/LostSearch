import { render } from '@react-email/render';
import type { Store } from '@prisma/client';
import { prisma } from '../prisma';
import { env } from '../env';
import { logger } from '../logger';
import { sendEmail } from './client';
import { DigestEmail, type DigestGap, type DigestFix } from './templates/DigestEmail';
import { mintUnsubscribeToken } from './unsubscribe-token';
import { track } from '../analytics';

const MIN_MONTHLY_SEARCH_THRESHOLD = 50;
const DEDUP_WINDOW_DAYS = 6;

export interface DigestDecision {
  sent: boolean;
  reason?: 'uninstalled' | 'opted_out' | 'insufficient_data' | 'recently_sent' | 'no_email' | 'no_gaps';
  messageId?: string;
}

/**
 * Build + send the weekly digest for one store. Safe to call repeatedly — the
 * 6-day dedup window prevents accidental double-sends.
 */
export async function sendWeeklyDigest(store: Store): Promise<DigestDecision> {
  if (store.uninstalledAt) return { sent: false, reason: 'uninstalled' };
  if (store.digestOptedOutAt) return { sent: false, reason: 'opted_out' };
  if (!store.merchantEmail) return { sent: false, reason: 'no_email' };

  if (
    store.digestLastSentAt &&
    Date.now() - store.digestLastSentAt.getTime() < DEDUP_WINDOW_DAYS * 86_400_000
  ) {
    return { sent: false, reason: 'recently_sent' };
  }

  const since = new Date(Date.now() - 30 * 86_400_000);
  const searchVolume = await prisma.searchQuery.aggregate({
    _sum: { occurrenceCount: true },
    where: { storeId: store.id, occurredAt: { gte: since } },
  });
  if ((searchVolume._sum.occurrenceCount ?? 0) < MIN_MONTHLY_SEARCH_THRESHOLD) {
    return { sent: false, reason: 'insufficient_data' };
  }

  const classifications = await prisma.classification.findMany({
    where: { storeId: store.id, lowVolume: false, type: { not: 'UNCAT' } },
    include: { revenueEstimates: true },
    orderBy: [{ occurrenceCount: 'desc' }],
    take: 20,
  });
  const topGaps: DigestGap[] = classifications
    .map((c) => {
      const est = c.revenueEstimates[0];
      if (!est) return null;
      return {
        queryNorm: c.queryNorm,
        estimateCents: est.estimateCents,
        bandLowCents: est.bandLowCents,
        bandHighCents: est.bandHighCents,
        type: c.type as DigestGap['type'],
      };
    })
    .filter((g): g is DigestGap => Boolean(g))
    .sort((a, b) => b.estimateCents - a.estimateCents);

  const totalImpactCents = topGaps.reduce((sum, g) => sum + g.estimateCents, 0);

  if (topGaps.length === 0) return { sent: false, reason: 'no_gaps' };

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const fixesRaw = await prisma.synonymApplied.findMany({
    where: { storeId: store.id, source: 'merchant', appliedAt: { gte: weekAgo } },
    orderBy: { appliedAt: 'desc' },
  });
  const undoneIds = new Set(
    (
      await prisma.synonymApplied.findMany({
        where: {
          storeId: store.id,
          source: 'remove',
          undoesId: { in: fixesRaw.map((f) => f.id) },
        },
        select: { undoesId: true },
      })
    )
      .map((r) => r.undoesId)
      .filter((id): id is string => Boolean(id)),
  );
  const fixesApplied: DigestFix[] = fixesRaw
    .filter((f) => !undoneIds.has(f.id))
    .map((f) => ({
      query: f.query,
      productTitle: f.productTitle,
      estimatedImpactCents: f.estimatedImpactCents,
    }));

  const unsubscribeToken = mintUnsubscribeToken(store.id);
  const dashboardUrl = `${env.SHOPIFY_APP_URL}/?shop=${encodeURIComponent(store.shopDomain)}`;
  const methodologyUrl = `${env.SHOPIFY_APP_URL}/methodology`;
  const unsubscribeUrl = `${env.SHOPIFY_APP_URL}/unsubscribe?token=${unsubscribeToken}`;

  const props = {
    storeName: store.shopDomain.replace(/\.myshopify\.com$/, ''),
    currency: store.currency ?? 'USD',
    totalImpactCents,
    gapsCount: topGaps.length,
    topGaps,
    fixesApplied,
    dashboardUrl,
    methodologyUrl,
    unsubscribeUrl,
    companyAddress: env.COMPANY_ADDRESS,
    plan: store.plan,
  };

  const html = await render(DigestEmail(props));
  const text = await render(DigestEmail(props), { plainText: true });

  const subject = `${props.storeName}: ${topGaps.length} new search gaps worth ~${new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: props.currency,
    maximumFractionDigits: 0,
  }).format(totalImpactCents / 100)}/month`;

  const result = await sendEmail({
    to: store.merchantEmail ?? '',
    subject,
    html,
    text,
    listUnsubscribe: `<${unsubscribeUrl}>, <mailto:${env.SUPPORT_EMAIL}?subject=unsubscribe>`,
    tags: { store_id: store.id, kind: 'weekly_digest' },
  });

  await prisma.$transaction([
    prisma.store.update({ where: { id: store.id }, data: { digestLastSentAt: new Date() } }),
    prisma.digestLog.create({
      data: {
        storeId: store.id,
        gapCount: topGaps.length,
        estimatedValueCents: totalImpactCents,
      },
    }),
  ]);

  track({
    event: 'digest_sent',
    distinctId: store.id,
    properties: {
      shop: store.shopDomain,
      gap_count: topGaps.length,
      impact_cents: totalImpactCents,
      provider: result.provider,
    },
  });
  logger.info(
    { shop: store.shopDomain, messageId: result.id, provider: result.provider, gapCount: topGaps.length },
    'Weekly digest sent',
  );

  return { sent: true, messageId: result.id };
}
