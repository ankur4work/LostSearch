import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { requireSessionToken } from '@/lib/shopify/auth-guard';
import { merchantRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Merchant-initiated data export. Returns everything we hold about the shop —
 * no other shop's data ever leaks through here (session-token bound).
 *
 * We return a sanitized view (encrypted access token replaced with a constant
 * marker) to avoid re-leaking credentials the merchant never saw in plaintext.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireSessionToken(req);
  if (auth instanceof NextResponse) return auth;

  const rl = await merchantRateLimit(auth.shopDomain, 'privacy-export');
  if (!rl.ok) return rl.response;

  const store = await prisma.store.findUnique({
    where: { shopDomain: auth.shopDomain },
    include: {
      searchQueries: { take: 10_000, orderBy: { occurredAt: 'desc' } },
      catalogProducts: {
        take: 10_000,
        select: {
          id: true,
          shopifyProductId: true,
          title: true,
          tags: true,
          descriptionText: true,
          syncedAt: true,
        },
      },
      classifications: {
        take: 10_000,
        include: { revenueEstimates: true },
        orderBy: { createdAt: 'desc' },
      },
      synonymsApplied: { take: 10_000, orderBy: { appliedAt: 'desc' } },
      digestLogs: { take: 1_000, orderBy: { sentAt: 'desc' } },
      billingEvents: { take: 1_000, orderBy: { createdAt: 'desc' } },
      ingestionRuns: { take: 1_000, orderBy: { createdAt: 'desc' } },
    },
  });

  if (!store) {
    return NextResponse.json({ error: 'store not found' }, { status: 404 });
  }

  const sanitized = { ...store, accessToken: '[encrypted, not exported]' };

  logger.info({ shop: auth.shopDomain }, 'Privacy export served to merchant');

  return new NextResponse(JSON.stringify(sanitized, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="sfm-export-${auth.shopDomain}.json"`,
    },
  });
}
