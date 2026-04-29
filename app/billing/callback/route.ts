import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { ShopifyClient } from '@/lib/shopify/client';
import { ShopDomainSchema } from '@/lib/shopify/validators';
import { track } from '@/lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_SUBSCRIPTION_QUERY = /* GraphQL */ `
  query AppSub($id: ID!) {
    node(id: $id) {
      __typename
      ... on AppSubscription { id name status test }
    }
  }
`;

interface AppSubResp {
  node: { __typename: string; id: string; name: string; status: string; test: boolean } | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const chargeId = req.nextUrl.searchParams.get('charge_id');
  const shop = req.nextUrl.searchParams.get('shop');

  const parsedShop = ShopDomainSchema.safeParse(shop);
  if (!parsedShop.success) {
    return NextResponse.json({ error: 'invalid shop' }, { status: 400 });
  }

  const store = await prisma.store.findUnique({ where: { shopDomain: parsedShop.data } });
  if (!store) {
    return NextResponse.json({ error: 'store not found' }, { status: 404 });
  }

  // Shopify appends a `charge_id` numeric; the ID we stored is a gid. Use the
  // GID we persisted at create-time; fall back to the raw param only if we
  // must (belt-and-suspenders for older flows).
  const subscriptionGid = store.shopifyChargeId ?? (chargeId ? `gid://shopify/AppSubscription/${chargeId}` : null);
  if (!subscriptionGid) {
    return NextResponse.json({ error: 'no subscription id on record' }, { status: 400 });
  }

  const client = new ShopifyClient(store);
  const resp = await client.graphql<AppSubResp>(APP_SUBSCRIPTION_QUERY, { id: subscriptionGid });
  const sub = resp.data?.node;

  // Return the merchant to the embedded app inside Shopify admin instead of
  // back to our raw application_url (which in dev is localhost on a port the
  // browser can't reach).
  const shopHandle = parsedShop.data.replace(/\.myshopify\.com$/, '');
  const returnToApp = () =>
    NextResponse.redirect(
      `https://admin.shopify.com/store/${encodeURIComponent(shopHandle)}/apps/${encodeURIComponent(env.SHOPIFY_API_KEY)}`,
      302,
    );

  if (!sub || sub.__typename !== 'AppSubscription') {
    logger.warn({ shop: parsedShop.data, subscriptionGid }, 'billing callback: subscription not found');
    return returnToApp();
  }

  if (sub.status === 'ACTIVE') {
    await prisma.$transaction([
      prisma.store.update({
        where: { id: store.id },
        data: { plan: 'GROWTH', graceEndsAt: null },
      }),
      prisma.billingEvent.create({
        data: {
          storeId: store.id,
          eventType: 'charge_activated',
          amountCents: Math.round(env.GROWTH_PLAN_PRICE_USD * 100),
          shopifyChargeId: sub.id,
        },
      }),
    ]);
    track({
      event: 'billing_charge_activated',
      distinctId: store.id,
      properties: { shop: store.shopDomain, plan: 'GROWTH', chargeId: sub.id },
    });
    logger.info({ shop: store.shopDomain, chargeId: sub.id }, 'Plan upgraded to GROWTH');
  } else if (sub.status === 'DECLINED' || sub.status === 'CANCELLED' || sub.status === 'EXPIRED') {
    await prisma.billingEvent.create({
      data: {
        storeId: store.id,
        eventType: `charge_${sub.status.toLowerCase()}`,
        amountCents: 0,
        shopifyChargeId: sub.id,
      },
    });
    logger.info({ shop: store.shopDomain, status: sub.status }, 'Subscription rejected at callback');
  } else {
    // PENDING — user may still be approving. Land them back anyway.
    logger.info({ shop: store.shopDomain, status: sub.status }, 'Subscription still pending at callback');
  }

  return returnToApp();
}
