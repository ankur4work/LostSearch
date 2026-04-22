import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// Mock ioredis to avoid needing a real Redis in CI. The rate limiter uses
// redis.eval; we hand back a programmable array of responses.
const evalMock = vi.fn();
vi.mock('ioredis', () => ({
  default: class {
    eval = evalMock;
    set = vi.fn();
    get = vi.fn();
    del = vi.fn();
    call = vi.fn();
    keys = vi.fn().mockResolvedValue([]);
    ping = vi.fn();
  },
}));

import { merchantRateLimit, publicRateLimit } from '@/lib/rate-limit';

function fakeReq(ip = '1.2.3.4'): NextRequest {
  return {
    headers: new Headers({ 'x-forwarded-for': ip }),
  } as unknown as NextRequest;
}

beforeEach(() => {
  evalMock.mockReset();
});

describe('rate limiter — token bucket', () => {
  it('allows a request when tokens remain', async () => {
    evalMock.mockResolvedValueOnce([1, 99, 100]);
    const r = await merchantRateLimit('shop.myshopify.com');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(99);
  });

  it('returns 429 when bucket empty', async () => {
    evalMock.mockResolvedValueOnce([0, 0, 100]);
    const r = await merchantRateLimit('shop.myshopify.com');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(429);
      expect(r.response.headers.get('retry-after')).toBe('10');
      expect(r.response.headers.get('x-ratelimit-limit')).toBe('100');
    }
  });

  it('extracts IP from x-forwarded-for for public limit', async () => {
    evalMock.mockResolvedValueOnce([1, 29, 30]);
    const r = await publicRateLimit(fakeReq('9.8.7.6, 1.1.1.1'), 'methodology');
    expect(r.ok).toBe(true);
    const key = (evalMock.mock.calls[0] ?? [])[2] as string;
    expect(key).toContain('9.8.7.6');
    expect(key).not.toContain('1.1.1.1');
  });

  it('merchant and public buckets are in different namespaces', async () => {
    evalMock.mockResolvedValueOnce([1, 99, 100]).mockResolvedValueOnce([1, 29, 30]);
    await merchantRateLimit('shop.myshopify.com', 'op');
    await publicRateLimit(fakeReq(), 'op');
    const key1 = (evalMock.mock.calls[0] ?? [])[2] as string;
    const key2 = (evalMock.mock.calls[1] ?? [])[2] as string;
    expect(key1.startsWith('rl:merchant:')).toBe(true);
    expect(key2.startsWith('rl:public:')).toBe(true);
  });
});
