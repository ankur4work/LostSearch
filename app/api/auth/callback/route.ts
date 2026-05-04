import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { verifyOAuthHmac } from '@/lib/shopify/hmac';
import { OAuthCallbackSchema, isValidShopDomain } from '@/lib/shopify/validators';
import { upsertStoreWithToken, refreshStoreToken } from '@/lib/shopify/store';
import { exchangeOfflineAccessToken } from '@/lib/shopify/token-exchange';
import { extractBearerToken, verifySessionToken } from '@/lib/shopify/session';
// jobs/schedule imported dynamically — the transitive BullMQ Queue init
// was tripping Next's build-time route analysis with Redis connect attempts.
import { track } from '@/lib/analytics';
import { consumeOAuthState } from '@/lib/shopify/oauth-state';
import { publicRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TokenResponse {
  access_token: string;
  scope: string;
}

interface OfflineBootstrapResponse {
  ok: true;
  shop: string;
  storeId: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rl = await publicRateLimit(req, 'oauth-callback');
  if (!rl.ok) return rl.response;

  if (req.nextUrl.searchParams.get('embedded') === '1') {
    return handleEmbeddedBootstrap(req);
  }

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

  // Webhooks are declared in shopify.app.toml [[webhooks.subscriptions]] and
  // auto-registered by Shopify. Storefront tracker is delivered via theme app
  // extension instead of REST ScriptTag (which is deprecated for new tokens).
  const { enqueueInstallBackfill } = await import('@/jobs/schedule');
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

async function handleEmbeddedBootstrap(req: NextRequest): Promise<NextResponse> {
  const token = extractBearerToken(req.headers.get('authorization'));
  if (!token) {
    return NextResponse.json({ error: 'session token required' }, { status: 401 });
  }

  let claims;
  try {
    claims = await verifySessionToken(token);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Embedded bootstrap rejected');
    return NextResponse.json({ error: 'invalid session token' }, { status: 401 });
  }

  const exchanged = await exchangeOfflineAccessToken({
    shop: claims.shop,
    sessionToken: token,
  });

  const existing = await prisma.store.findUnique({
    where: { shopDomain: claims.shop },
    select: { id: true },
  });

  const isNewStore = !existing;
  const store = isNewStore
    ? await upsertStoreWithToken({
        shopDomain: claims.shop,
        accessToken: exchanged.accessToken,
        scope: exchanged.scope,
        expiresIn: exchanged.expiresIn,
      })
    : await refreshStoreToken({
        shopDomain: claims.shop,
        accessToken: exchanged.accessToken,
        scope: exchanged.scope,
        expiresIn: exchanged.expiresIn,
      });

  // Only enqueue a backfill on first install. Subsequent app opens just
  // refresh the access token — they must not trigger a new sync.
  if (isNewStore) {
    const { enqueueInstallBackfill } = await import('@/jobs/schedule');
    await enqueueInstallBackfill(store.id);
  }

  logger.info({ shop: claims.shop, storeId: store.id }, 'Embedded bootstrap complete');
  return NextResponse.json({ ok: true, shop: claims.shop, storeId: store.id } satisfies OfflineBootstrapResponse);
}
