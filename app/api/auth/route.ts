import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { ShopDomainSchema } from '@/lib/shopify/validators';
import { mintOAuthState } from '@/lib/shopify/oauth-state';
import { publicRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rl = await publicRateLimit(req, 'oauth-init');
  if (!rl.ok) return rl.response;

  const shopParam = req.nextUrl.searchParams.get('shop');
  const parsed = ShopDomainSchema.safeParse(shopParam);
  if (!parsed.success) {
    logger.warn({ shopParam }, 'OAuth init rejected: invalid shop domain');
    return NextResponse.json({ error: 'invalid shop' }, { status: 400 });
  }
  const shop = parsed.data;

  const state = await mintOAuthState({ shop });
  const redirectUri = `${env.SHOPIFY_APP_URL}/api/auth/callback`;
  const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  authUrl.searchParams.set('client_id', env.SHOPIFY_API_KEY);
  authUrl.searchParams.set('scope', env.SHOPIFY_SCOPES);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);

  logger.info({ shop }, 'OAuth init redirecting to Shopify authorize');
  return NextResponse.redirect(authUrl.toString(), 302);
}
