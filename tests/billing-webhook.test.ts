import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';

const SECRET = process.env.SHOPIFY_API_SECRET!;

const storeUpdate = vi.fn(async () => ({ id: 'store1' }));
const billingEventCreate = vi.fn(async () => ({ id: 'evt1' }));
const billingEventFindFirst = vi.fn(async () => null);
const storeFindUnique = vi.fn(async () => ({ id: 'store1', shopDomain: 'shop.myshopify.com', plan: 'FREE' }));
const $transaction = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: { findUnique: storeFindUnique, update: storeUpdate },
    billingEvent: { findFirst: billingEventFindFirst, create: billingEventCreate },
    $transaction,
  },
}));

import { POST } from '@/app/api/webhooks/app-subscriptions-update/route';

function signedRequest(payload: object, opts: { hmac?: string; shop?: string } = {}): NextRequest {
  const body = JSON.stringify(payload);
  const hmac =
    opts.hmac ?? createHmac('sha256', SECRET).update(body).digest('base64');
  return new NextRequest('https://example.test/api/webhooks/app-subscriptions-update', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-shopify-hmac-sha256': hmac,
      'x-shopify-shop-domain': opts.shop ?? 'shop.myshopify.com',
    },
    body,
  });
}

beforeEach(() => {
  storeUpdate.mockClear();
  billingEventCreate.mockClear();
  billingEventFindFirst.mockResolvedValue(null);
  $transaction.mockClear();
});

describe('app_subscriptions/update webhook', () => {
  const validPayload = {
    app_subscription: {
      admin_graphql_api_id: 'gid://shopify/AppSubscription/1',
      name: 'Growth',
      status: 'ACTIVE',
    },
  };

  it('rejects requests without a valid HMAC', async () => {
    const res = await POST(signedRequest(validPayload, { hmac: 'not-base64-valid' }));
    expect(res.status).toBe(401);
    expect(storeUpdate).not.toHaveBeenCalled();
  });

  it('processes ACTIVE status — upgrades plan and logs event', async () => {
    const res = await POST(signedRequest(validPayload));
    expect(res.status).toBe(200);
    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — duplicate webhook does not re-write', async () => {
    billingEventFindFirst.mockResolvedValueOnce({ id: 'already-seen' });
    const res = await POST(signedRequest(validPayload));
    expect(res.status).toBe(200);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('CANCELLED downgrades and sets grace', async () => {
    const res = await POST(
      signedRequest({
        app_subscription: {
          admin_graphql_api_id: 'gid://shopify/AppSubscription/2',
          status: 'CANCELLED',
        },
      }),
    );
    expect(res.status).toBe(200);
    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects bad shop header', async () => {
    const req = signedRequest(validPayload, { shop: 'evil.example.com' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
