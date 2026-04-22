import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookHmac } from '@/lib/shopify/hmac';
import { markStoreUninstalled } from '@/lib/shopify/store';
import { isValidShopDomain } from '@/lib/shopify/validators';
import { prisma } from '@/lib/prisma';
import { cancelStoreJobs } from '@/jobs/schedule';
import { logger } from '@/lib/logger';
import { track } from '@/lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw = await req.text();
  const hmac = req.headers.get('x-shopify-hmac-sha256');
  if (!verifyWebhookHmac(raw, hmac)) {
    logger.warn('app/uninstalled webhook rejected: invalid HMAC');
    return NextResponse.json({ error: 'invalid hmac' }, { status: 401 });
  }

  const shop = req.headers.get('x-shopify-shop-domain');
  if (!isValidShopDomain(shop)) {
    return NextResponse.json({ error: 'invalid shop' }, { status: 400 });
  }

  await markStoreUninstalled(shop);
  const store = await prisma.store.findUnique({ where: { shopDomain: shop } });
  if (store) {
    await cancelStoreJobs(store.id);
    track({ event: 'app_uninstalled', distinctId: store.id, properties: { shop } });
  }

  logger.info({ shop }, 'Store marked uninstalled and pending jobs cancelled (30d retention)');
  return NextResponse.json({ ok: true });
}
