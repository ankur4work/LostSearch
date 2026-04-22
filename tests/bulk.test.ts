import { describe, it, expect, vi } from 'vitest';
import { ShopifyClient } from '@/lib/shopify/client';
import { runBulkQuery, BulkOperationError } from '@/lib/shopify/bulk';

const store = { shopDomain: 'bulk-test.myshopify.com', accessToken: 'placeholder' };

function jsonResp(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function jsonlResp(lines: unknown[]): Response {
  const body = lines.map((l) => JSON.stringify(l)).join('\n');
  return new Response(body, { status: 200, headers: { 'content-type': 'application/jsonl' } });
}

function makeClient(fetchImpl: typeof fetch): ShopifyClient {
  return new ShopifyClient(store, {
    accessTokenOverride: 'tok',
    fetchImpl,
  });
}

describe('runBulkQuery', () => {
  it('streams JSONL when COMPLETED', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const downloadUrl = 'https://shopify-bulk.test/out.jsonl';
    const fetchImpl = vi
      .fn<typeof fetch>()
      // 1: bulkOperationRunQuery
      .mockResolvedValueOnce(
        jsonResp({
          data: { bulkOperationRunQuery: { bulkOperation: { id: 'gid://op/1', status: 'CREATED' }, userErrors: [] } },
        }),
      )
      // 2: currentBulkOperation — RUNNING
      .mockResolvedValueOnce(
        jsonResp({ data: { currentBulkOperation: { id: 'gid://op/1', status: 'RUNNING', url: null, objectCount: '0' } } }),
      )
      // 3: currentBulkOperation — COMPLETED
      .mockResolvedValueOnce(
        jsonResp({
          data: {
            currentBulkOperation: {
              id: 'gid://op/1',
              status: 'COMPLETED',
              url: downloadUrl,
              objectCount: '2',
            },
          },
        }),
      )
      // 4: JSONL download
      .mockImplementationOnce(async (input) => {
        expect(String(input)).toBe(downloadUrl);
        return jsonlResp([{ id: 'gid://Product/1' }, { id: 'gid://Product/2' }]);
      });

    const records: unknown[] = [];
    const p = runBulkQuery<{ id: string }>(makeClient(fetchImpl as unknown as typeof fetch), '{x}', (r) => {
      records.push(r);
    });
    await vi.advanceTimersByTimeAsync(11_000);
    const result = await p;
    vi.useRealTimers();

    expect(result.objectCount).toBe(2);
    expect(records).toEqual([{ id: 'gid://Product/1' }, { id: 'gid://Product/2' }]);
  });

  it('throws BulkOperationError on FAILED', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResp({
          data: { bulkOperationRunQuery: { bulkOperation: { id: 'gid://op/1', status: 'CREATED' }, userErrors: [] } },
        }),
      )
      .mockResolvedValueOnce(
        jsonResp({
          data: {
            currentBulkOperation: {
              id: 'gid://op/1',
              status: 'FAILED',
              url: null,
              objectCount: '0',
              errorCode: 'INTERNAL_SERVER_ERROR',
            },
          },
        }),
      );
    const p = runBulkQuery(makeClient(fetchImpl as unknown as typeof fetch), '{x}', () => {});
    await vi.advanceTimersByTimeAsync(6_000);
    await expect(p).rejects.toBeInstanceOf(BulkOperationError);
    vi.useRealTimers();
  });

  it('throws BulkOperationError on CANCELED', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResp({
          data: { bulkOperationRunQuery: { bulkOperation: { id: 'gid://op/1', status: 'CREATED' }, userErrors: [] } },
        }),
      )
      .mockResolvedValueOnce(
        jsonResp({
          data: {
            currentBulkOperation: {
              id: 'gid://op/1',
              status: 'CANCELED',
              url: null,
              objectCount: '0',
            },
          },
        }),
      );
    const p = runBulkQuery(makeClient(fetchImpl as unknown as typeof fetch), '{x}', () => {});
    await vi.advanceTimersByTimeAsync(6_000);
    await expect(p).rejects.toMatchObject({ name: 'BulkOperationError', status: 'CANCELED' });
    vi.useRealTimers();
  });

  it('surfaces userErrors from bulkOperationRunQuery', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResp({
        data: {
          bulkOperationRunQuery: {
            bulkOperation: null,
            userErrors: [{ field: ['query'], message: 'A bulk operation is already running' }],
          },
        },
      }),
    );
    await expect(
      runBulkQuery(makeClient(fetchImpl as unknown as typeof fetch), '{x}', () => {}),
    ).rejects.toMatchObject({ name: 'BulkOperationError' });
  });
});
