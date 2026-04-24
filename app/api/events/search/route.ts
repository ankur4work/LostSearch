import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { ShopDomainSchema } from '@/lib/shopify/validators';
import { normalizeQuery, dateBucketUTC } from '@/lib/ingestion/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EventSchema = z.object({
  shop: ShopDomainSchema,
  event: z.enum(['search_submitted', 'search_viewed']),
  query: z.string().min(1).max(500),
  resultCount: z.number().int().nonnegative().nullable().optional(),
  filters: z.record(z.string(), z.string()).nullable().optional(),
  at: z.number().int().positive(),
  path: z.string().max(500).optional(),
});

function cors(res: NextResponse): NextResponse {
  // Storefront origin is arbitrary *.myshopify.com / custom domains; allow all.
  // Authentication is via shop field in the payload, not the origin header.
  res.headers.set('access-control-allow-origin', '*');
  res.headers.set('access-control-allow-methods', 'POST, OPTIONS');
  res.headers.set('access-control-allow-headers', 'content-type');
  return res;
}

export function OPTIONS(): NextResponse {
  return cors(new NextResponse(null, { status: 204 }));
}

/**
 * Storefront search event ingestion.
 *
 * Trust model: payload asserts `shop`; we validate it's a live store we
 * installed into. No HMAC — storefront JS has no access to SHOPIFY_API_SECRET.
 * Anti-abuse: rate-limit per-shop, drop rows whose normalized query is empty,
 * cap body size via zod max limits. A motivated attacker can inject fake
 * queries for their OWN shop; classification engine treats low-volume queries
 * as `lowVolume=true` which hides them from free-tier dashboards anyway.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let parsed;
  try {
    parsed = EventSchema.safeParse(await req.json());
  } catch {
    return cors(NextResponse.json({ error: 'invalid json' }, { status: 400 }));
  }
  if (!parsed.success) {
    return cors(NextResponse.json({ error: 'invalid payload' }, { status: 400 }));
  }
  const { shop, query, resultCount, filters, at, event } = parsed.data;

  const queryNormalized = normalizeQuery(query);
  if (!queryNormalized) {
    return cors(new NextResponse(null, { status: 204 }));
  }

  const store = await prisma.store.findUnique({
    where: { shopDomain: shop },
    select: { id: true, uninstalledAt: true },
  });
  if (!store || store.uninstalledAt) {
    // Silently drop — storefront JS may linger after uninstall.
    return cors(new NextResponse(null, { status: 204 }));
  }

  const occurredAt = new Date(at);
  const bucket = dateBucketUTC(occurredAt);

  // `search_submitted` events always count; `search_viewed` on the SERP only
  // records result_count (we don't double-count — if submitted fired too,
  // we'd have two rows per search. Solution: upsert on the day-bucket and
  // bump occurrenceCount for submitted; update resultCount for viewed.)
  try {
    if (event === 'search_submitted') {
      await prisma.searchQuery.upsert({
        where: {
          uniq_store_query_bucket: {
            storeId: store.id,
            queryNormalized,
            dateBucket: bucket,
          },
        },
        create: {
          storeId: store.id,
          query,
          queryNormalized,
          occurredAt,
          dateBucket: bucket,
          occurrenceCount: 1,
          resultCount: 0,
          clickCount: 0,
          filtersJson: filters ?? undefined,
        },
        update: {
          occurrenceCount: { increment: 1 },
          occurredAt,
          filtersJson: filters ?? undefined,
        },
      });
    } else {
      // search_viewed — we landed on /search?q=... with results. Record the
      // result_count even if no form submit fired (deep link, back button).
      await prisma.searchQuery.upsert({
        where: {
          uniq_store_query_bucket: {
            storeId: store.id,
            queryNormalized,
            dateBucket: bucket,
          },
        },
        create: {
          storeId: store.id,
          query,
          queryNormalized,
          occurredAt,
          dateBucket: bucket,
          occurrenceCount: 1,
          resultCount: resultCount ?? 0,
          clickCount: 0,
          filtersJson: filters ?? undefined,
        },
        update: {
          resultCount: resultCount ?? undefined,
          occurredAt,
          filtersJson: filters ?? undefined,
        },
      });
    }
  } catch (err) {
    logger.warn(
      { shop, query: queryNormalized, err: (err as Error).message },
      'search event persist failed',
    );
    return cors(NextResponse.json({ error: 'write failed' }, { status: 500 }));
  }

  return cors(new NextResponse(null, { status: 204 }));
}
