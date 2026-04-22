import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory mock Redis with SET EX NX + GETDEL semantics for this test.
const kv = new Map<string, string>();
const callMock = vi.fn(async (cmd: string, ...args: string[]) => {
  if (cmd === 'GETDEL') {
    const [key] = args;
    const v = kv.get(key ?? '') ?? null;
    if (v !== null) kv.delete(key ?? '');
    return v;
  }
  throw new Error(`unsupported: ${cmd}`);
});
const setMock = vi.fn(async (key: string, value: string) => {
  kv.set(key, value);
  return 'OK';
});

vi.mock('ioredis', () => ({
  default: class {
    call = callMock;
    set = setMock;
    get = vi.fn();
    del = vi.fn();
    eval = vi.fn();
    keys = vi.fn().mockResolvedValue([]);
    ping = vi.fn();
  },
}));

import { mintOAuthState, consumeOAuthState } from '@/lib/shopify/oauth-state';

beforeEach(() => {
  kv.clear();
  callMock.mockClear();
  setMock.mockClear();
});

describe('OAuth state (Redis-backed, single-use)', () => {
  it('mint → consume returns the payload once', async () => {
    const state = await mintOAuthState({ shop: 'shop.myshopify.com' });
    const payload = await consumeOAuthState(state);
    expect(payload?.shop).toBe('shop.myshopify.com');
  });

  it('consume a second time returns null (single-use)', async () => {
    const state = await mintOAuthState({ shop: 'shop.myshopify.com' });
    await consumeOAuthState(state);
    const replay = await consumeOAuthState(state);
    expect(replay).toBeNull();
  });

  it('rejects unknown state values', async () => {
    const payload = await consumeOAuthState('not-a-real-nonce');
    expect(payload).toBeNull();
  });

  it('rejects malformed input', async () => {
    expect(await consumeOAuthState('')).toBeNull();
    expect(await consumeOAuthState(undefined as unknown as string)).toBeNull();
  });

  it('stores under the expected key prefix with EX', async () => {
    await mintOAuthState({ shop: 'shop.myshopify.com' });
    const call = setMock.mock.calls[0];
    expect(call?.[0]).toMatch(/^oauth:state:/);
    // positional args: (key, value, 'EX', 300)
    expect(call?.[2]).toBe('EX');
    expect(call?.[3]).toBe(300);
  });
});
