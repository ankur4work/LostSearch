import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { requireSessionToken } from '@/lib/shopify/auth-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * If a merchant reinstalls during the 48h `shop/redact` window, clear the
 * scheduled purge so they resume their existing data.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireSessionToken(req);
  if (auth instanceof NextResponse) return auth;

  const result = await prisma.store.updateMany({
    where: { shopDomain: auth.shopDomain, scheduledRedactAt: { not: null } },
    data: { scheduledRedactAt: null },
  });

  logger.info({ shop: auth.shopDomain, cancelled: result.count }, 'Redact purge cancelled (reinstall)');
  return NextResponse.json({ ok: true, cancelled: result.count });
}
