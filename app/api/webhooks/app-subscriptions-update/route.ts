import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyWebhookHmac } from '@/lib/shopify/hmac';
import { prisma } from '@/lib/prisma';
import { isValidShopDomain } from '@/lib/shopify/validators';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  app_subscription: z.object({
    admin_graphql_api_id: z.string(),
    name: z.string().optional(),
    status: z.enum(['ACTIVE', 'CANCELLED', 'DECLINED', 'EXPIRED', 'FROZEN', 'PENDING']),
  }),
});

const STATUS_TO_PLAN: Record<string, 'FREE' | 'GROWTH' | 'PRO'> = {
  ACTIVE: 'GROWTH',
  CANCELLED: 'FREE',
  DECLINED: 'FREE',
  EXPIRED: 'FREE',
  FROZEN: 'FREE',
};

const GRACE_DAYS = 7;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw = await req.text();
  const hmac = req.headers.get('x-shopify-hmac-sha256');
  if (!verifyWebhookHmac(raw, hmac)) {
    return NextResponse.json({ error: 'invalid hmac' }, { status: 401 });
  }
  const shop = req.headers.get('x-shopify-shop-domain');
  if (!isValidShopDomain(shop)) {
    return NextResponse.json({ error: 'invalid shop' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = PayloadSchema.parse(JSON.parse(raw));
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'app_subscriptions/update: malformed payload');
    return NextResponse.json({ ok: true }); // Shopify disables webhook on 4xx; we swallow.
  }

  const store = await prisma.store.findUnique({ where: { shopDomain: shop } });
  if (!store) return NextResponse.json({ ok: true });

  // Idempotency: skip no-op updates where status and recorded plan already agree.
  const sub = parsed.app_subscription;
  const targetPlan = STATUS_TO_PLAN[sub.status] ?? 'FREE';

  const existingEvent = await prisma.billingEvent.findFirst({
    where: { storeId: store.id, shopifyChargeId: sub.admin_graphql_api_id, eventType: `sub_${sub.status.toLowerCase()}` },
  });
  if (existingEvent) {
    logger.info({ shop, status: sub.status }, 'Duplicate subscription webhook — idempotent skip');
    return NextResponse.json({ ok: true });
  }

  const patch: Parameters<typeof prisma.store.update>[0]['data'] = { plan: targetPlan };
  if (sub.status === 'CANCELLED' || sub.status === 'FROZEN') {
    patch.graceEndsAt = new Date(Date.now() + GRACE_DAYS * 86_400_000);
  } else if (sub.status === 'ACTIVE') {
    patch.graceEndsAt = null;
    patch.shopifyChargeId = sub.admin_graphql_api_id;
  }

  await prisma.$transaction([
    prisma.store.update({ where: { id: store.id }, data: patch }),
    prisma.billingEvent.create({
      data: {
        storeId: store.id,
        eventType: `sub_${sub.status.toLowerCase()}`,
        amountCents: 0,
        shopifyChargeId: sub.admin_graphql_api_id,
      },
    }),
  ]);

  logger.info({ shop, status: sub.status, newPlan: targetPlan }, 'app_subscriptions/update processed');
  return NextResponse.json({ ok: true });
}
