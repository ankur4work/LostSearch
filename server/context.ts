import type { NextRequest } from 'next/server';
import type { Plan } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { extractBearerToken, verifySessionToken, type ShopifySessionClaims } from '@/lib/shopify/session';
import { logger } from '@/lib/logger';

export interface Context {
  prisma: typeof prisma;
  logger: typeof logger;
  session: (ShopifySessionClaims & { storeId: string | null; plan: Plan | null }) | null;
}

export async function createContext(opts: { req: NextRequest }): Promise<Context> {
  const token = extractBearerToken(opts.req.headers.get('authorization'));
  let session: Context['session'] = null;
  if (token) {
    try {
      const claims = await verifySessionToken(token);
      const store = await prisma.store.findUnique({
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
  return { prisma, logger, session };
}
