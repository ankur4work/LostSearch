import type { NextRequest } from 'next/server';
import type { Plan } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { extractBearerToken, verifySessionToken, type ShopifySessionClaims } from '@/lib/shopify/session';
import { logger } from '@/lib/logger';

export interface Context {
  prisma: typeof prisma;
  logger: typeof logger;
  session: (ShopifySessionClaims & { storeId: string | null; plan: Plan | null }) | null;
  /** Base URL the request hit (tunnel URL in dev, public domain in prod). */
  appUrl: string;
}

export async function createContext(opts: { req: NextRequest }): Promise<Context> {
  // Derive the public base URL of THIS request. In dev with `shopify app dev`
  // the request comes via the Cloudflare tunnel, so this captures the tunnel
  // origin instead of the random local port. Falls back to env.SHOPIFY_APP_URL.
  const forwardedHost = opts.req.headers.get('x-forwarded-host');
  const forwardedProto = opts.req.headers.get('x-forwarded-proto');
  const requestUrl = new URL(opts.req.url);
  const host = forwardedHost ?? opts.req.headers.get('host') ?? requestUrl.host;
  const proto = forwardedProto ?? requestUrl.protocol.replace(':', '') ?? 'https';
  const appUrl = `${proto}://${host}`;

  // Dev-only bypass: when DEV_BYPASS_AUTH is set, resolve a fake session
  // against DEV_SHOP_DOMAIN so localhost dev works without a real Shopify
  // session token. NEVER enable in production — the production env shouldn't
  // have these vars set.
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_BYPASS_AUTH === 'true') {
    const shop = process.env.DEV_SHOP_DOMAIN ?? 'dev-store.myshopify.com';
    const store = await prisma.store.findUnique({
      where: { shopDomain: shop },
      select: { id: true, uninstalledAt: true, plan: true },
    });
    return {
      prisma,
      logger,
      appUrl,
      session: {
        iss: `https://${shop}/admin`,
        dest: `https://${shop}`,
        aud: 'dev-bypass',
        sub: 'dev-user',
        exp: Math.floor(Date.now() / 1000) + 3600,
        nbf: Math.floor(Date.now() / 1000),
        iat: Math.floor(Date.now() / 1000),
        jti: 'dev-bypass',
        sid: 'dev-bypass',
        shop,
        storeId: store && !store.uninstalledAt ? store.id : null,
        plan: store && !store.uninstalledAt ? store.plan : null,
      },
    };
  }

  const token = extractBearerToken(opts.req.headers.get('authorization'));
  let session: Context['session'] = null;
  if (token) {
    try {
      const claims = await verifySessionToken(token);
      let store = await prisma.store.findUnique({
        where: { shopDomain: claims.shop },
        select: { id: true, uninstalledAt: true, plan: true },
      });


      session = {
        ...claims,
        storeId: store && !store.uninstalledAt ? store.id : null,
        plan: store && !store.uninstalledAt ? store.plan : null,
      };
    } catch (err) {
      logger.debug({ err: (err as Error).message }, 'Session token invalid; treating as anonymous');
    }
  }
  return { prisma, logger, session, appUrl };
}

