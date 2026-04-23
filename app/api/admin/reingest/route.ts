import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { requireAdminForRoute } from '@/lib/admin-guard';
// jobs/schedule imported dynamically — see auth/callback/route.ts.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const InputSchema = z.object({ storeId: z.string().cuid() });

/**
 * Operator-only: force a full re-ingestion for one store (used for support
 * tickets like "my dashboard shows zero"). Guarded by the admin header.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = requireAdminForRoute(req);
  if (guard) return guard;

  const parsed = InputSchema.safeParse({
    storeId: req.nextUrl.searchParams.get('storeId') ?? '',
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid storeId' }, { status: 400 });
  }

  const store = await prisma.store.findUnique({ where: { id: parsed.data.storeId } });
  if (!store || store.uninstalledAt) {
    return NextResponse.json({ error: 'store not active' }, { status: 404 });
  }

  const { enqueueInstallBackfill } = await import('@/jobs/schedule');
  await enqueueInstallBackfill(store.id);
  logger.info({ storeId: store.id, shop: store.shopDomain }, 'admin re-ingest enqueued');
  return NextResponse.redirect(new URL('/admin', req.url), 303);
}
