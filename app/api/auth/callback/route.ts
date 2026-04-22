import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { verifyOAuthHmac } from '@/lib/shopify/hmac';
import { OAuthCallbackSchema, isValidShopDomain } from '@/lib/shopify/validators';
import { upsertStoreWithToken } from '@/lib/shopify/store';
import { MANDATORY_WEBHOOKS } from '@/lib/shopify/client';
import { enqueueInstallBackfill } from '@/jobs/schedule';
import { track } from '@/lib/analytics';
import { consumeOAuthState } from '@/lib/shopify/oauth-state';
import { publicRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TokenResponse {
  access_token: string;
  scope: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rl = await publicRateLimit(req, 'oauth-callback');
  if (!rl.ok) return rl.response;

  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = OAuthCallbackSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, 'OAuth callback rejected: invalid params');
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }
  const { shop, code } = parsed.data;

  if (!verifyOAuthHmac(raw)) {
    logger.warn({ shop }, 'OAuth callback rejected: bad HMAC');
    return NextResponse.json({ error: 'invalid hmac' }, { status: 401 });
  }

  const statePayload = await consumeOAuthState(parsed.data.state);
  if (!statePayload || statePayload.shop !== shop) {
    logger.warn({ shop }, 'OAuth callback rejected: state missing / shop mismatch');
    return NextResponse.json({ error: 'state mismatch' }, { status: 401 });
  }
  if (!isValidShopDomain(shop)) {
    return NextResponse.json({ error: 'invalid shop' }, { status: 400 });
  }

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.SHOPIFY_API_KEY,
      client_secret: env.SHOPIFY_API_SECRET,
      code,
    }),
  });

  if (!tokenRes.ok) {
    logger.error({ shop, status: tokenRes.status }, 'Token exchange failed');
    return NextResponse.json({ error: 'token exchange failed' }, { status: 502 });
  }

  const tokenJson = (await tokenRes.json()) as TokenResponse;
  const store = await upsertStoreWithToken({
    shopDomain: shop,
    accessToken: tokenJson.access_token,
    scope: tokenJson.scope,
  });

  await registerMandatoryWebhooks(shop, tokenJson.access_token);
  await enqueueInstallBackfill(store.id);
  track({
    event: 'app_installed',
    distinctId: store.id,
    properties: { shop, scope: tokenJson.scope },
  });

  logger.info({ shop, storeId: store.id }, 'OAuth complete, store installed, backfill enqueued');

  const host = req.nextUrl.searchParams.get('host') ?? '';
  const appUrl = new URL('/onboarding', env.SHOPIFY_APP_URL);
  if (host) appUrl.searchParams.set('host', host);
  appUrl.searchParams.set('shop', shop);

  return NextResponse.redirect(appUrl.toString(), 302);
}

async function registerMandatoryWebhooks(shop: string, accessToken: string): Promise<void> {
  for (const wh of MANDATORY_WEBHOOKS) {
    const body = {
      webhook: {
        topic: wh.topic,
        address: `${env.SHOPIFY_APP_URL}${wh.path}`,
        format: 'json',
      },
    };
    const resp = await fetch(`https://${shop}/admin/api/2024-10/webhooks.json`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok && resp.status !== 422) {
      logger.warn({ shop, topic: wh.topic, status: resp.status }, 'Webhook registration failed');
    }
  }
}
