import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
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

  // One logical shopper search emits several events across page contexts
  // (predictive box, form submit, then the /search results page) within a few
  // seconds. The client guard can't dedupe across page navigations, so we gate
  // the occurrence count server-side: the FIRST event for a (store, query)
  // within a short window counts once; later same-query events only refresh
  // resultCount. Keyed on a Redis SET NX so it works regardless of which event
  // (submitted/viewed) arrives first. If Redis is unavailable we fall back to
  // the legacy rule (count submits) so an infra blip never drops data.
  let countOccurrence: boolean;
  try {
    const dedupeKey = `srch:dedup:${store.id}:${queryNormalized}`;
    const firstInWindow = await redis.set(dedupeKey, '1', 'EX', 10, 'NX');
    countOccurrence = firstInWindow !== null;
  } catch {
    countOccurrence = event === 'search_submitted';
  }

  try {
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
        occurredAt,
        // Only bump volume for the first event in the dedupe window.
        ...(countOccurrence ? { occurrenceCount: { increment: 1 } } : {}),
        // Keep the latest result_count seen — the /search results page often
        // carries a more accurate count than the predictive box.
        ...(resultCount != null ? { resultCount } : {}),
        filtersJson: filters ?? undefined,
      },
    });
  } catch (err) {
    logger.warn(
      { shop, query: queryNormalized, err: (err as Error).message },
      'search event persist failed',
    );
    return cors(NextResponse.json({ error: 'write failed' }, { status: 500 }));
  }

  return cors(new NextResponse(null, { status: 204 }));
}
