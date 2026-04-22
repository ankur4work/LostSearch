import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { registry, activeStores, revenueSurfaced } from '@/lib/metrics';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Scraped by Prometheus / Coolify's built-in metrics ingestion. Protected by
// a shared bearer token in prod to avoid leaking store counts publicly; in
// dev the token check is skipped.
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === 'production') {
    const auth = req.headers.get('authorization');
    const expected = process.env.METRICS_BEARER;
    if (!expected || auth !== `Bearer ${expected}`) {
      return new NextResponse('forbidden', { status: 403 });
    }
  }

  const [storeCount, revAgg] = await Promise.all([
    prisma.store.count({ where: { uninstalledAt: null } }),
    prisma.revenueEstimate.aggregate({ _sum: { estimateCents: true } }),
  ]);
  activeStores.set(storeCount);
  revenueSurfaced.set(revAgg._sum.estimateCents ?? 0);

  const body = await registry.metrics();
  return new NextResponse(body, {
    status: 200,
    headers: { 'content-type': registry.contentType },
  });
}
