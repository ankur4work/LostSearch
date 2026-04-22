import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookHmac } from '@/lib/shopify/hmac';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw = await req.text();
  if (!verifyWebhookHmac(raw, req.headers.get('x-shopify-hmac-sha256'))) {
    return NextResponse.json({ error: 'invalid hmac' }, { status: 401 });
  }
  const shop = req.headers.get('x-shopify-shop-domain');
  logger.info({ shop }, 'customers/data_request received — we store no customer PII');
  return NextResponse.json({ ok: true });
}
