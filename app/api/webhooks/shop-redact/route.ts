import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookHmac } from '@/lib/shopify/hmac';
import { prisma } from '@/lib/prisma';
import { isValidShopDomain } from '@/lib/shopify/validators';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Per Shopify GDPR spec the shop/redact webhook is fired 48h after uninstall.
// We don't delete synchronously on receipt — instead we schedule the purge
// `scheduledRedactAt = now + 48h` so a merchant who reinstalls inside the
// recovery window keeps their historical data. A cron job (redact-purge) hard-
// deletes stores whose scheduledRedactAt <= now.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw = await req.text();
  if (!verifyWebhookHmac(raw, req.headers.get('x-shopify-hmac-sha256'))) {
    return NextResponse.json({ error: 'invalid hmac' }, { status: 401 });
  }
  const shop = req.headers.get('x-shopify-shop-domain');
  if (!isValidShopDomain(shop)) {
    return NextResponse.json({ error: 'invalid shop' }, { status: 400 });
  }

  const purgeAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await prisma.store.updateMany({
    where: { shopDomain: shop },
    data: { scheduledRedactAt: purgeAt },
  });
  logger.info({ shop, purgeAt }, 'shop/redact scheduled (48h recovery window)');
  return NextResponse.json({ ok: true });
}
