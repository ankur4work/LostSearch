import { describe, it, expect, vi } from 'vitest';
import { ShopifyClient } from '@/lib/shopify/client';

function makeStore(): { shopDomain: string; accessToken: string } {
  return { shopDomain: 'test-shop.myshopify.com', accessToken: 'placeholder' };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('ShopifyClient rate limit handling', () => {
  it('pauses when throttleStatus.currentlyAvailable < 100', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          data: { ok: true },
          extensions: {
            cost: {
              requestedQueryCost: 10,
              actualQueryCost: 10,
              throttleStatus: {
                maximumAvailable: 1000,
                currentlyAvailable: 50,
                restoreRate: 100,
              },
            },
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));

    const client = new ShopifyClient(makeStore(), {
      accessTokenOverride: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const start = Date.now();
    await client.graphql('{ __typename }');
    const midPoint = Date.now();
    await client.graphql('{ __typename }');
    const elapsed = Date.now() - start;

    // (100 - 50) / 100 = 0.5s restore → we expect an observable pause.
    expect(midPoint - start).toBeGreaterThanOrEqual(400);
    expect(elapsed).toBeGreaterThanOrEqual(400);
  }, 10_000);

  it('retries with backoff on 429 then succeeds', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));
    const client = new ShopifyClient(makeStore(), {
      accessTokenOverride: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const resp = await client.graphql<{ ok: boolean }>('{ __typename }');
    expect(resp.data?.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('throws ShopifyAPIError after MAX_RETRIES on persistent 429', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response('rate limited', { status: 429 }),
    );
    const client = new ShopifyClient(makeStore(), {
      accessTokenOverride: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.graphql('{ __typename }')).rejects.toMatchObject({
      name: 'ShopifyAPIError',
      status: 429,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4); // initial + 3 retries
  }, 20_000);

  it('retries on 5xx then succeeds', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('boom', { status: 502 }))
      .mockResolvedValueOnce(jsonResponse({ data: { ok: 1 } }));
    const client = new ShopifyClient(makeStore(), {
      accessTokenOverride: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const resp = await client.graphql('{ __typename }');
    expect(resp.data).toEqual({ ok: 1 });
  }, 10_000);

  it('handles GraphQL-level THROTTLED error by retrying', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));
    const client = new ShopifyClient(makeStore(), {
      accessTokenOverride: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const resp = await client.graphql<{ ok: boolean }>('{ __typename }');
    expect(resp.data?.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  }, 10_000);
});
