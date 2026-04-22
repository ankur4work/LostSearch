import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { verifySessionToken } from '@/lib/shopify/session';

const SECRET = new TextEncoder().encode(process.env.SHOPIFY_API_SECRET!);

async function mintToken(overrides: Record<string, unknown> = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: 'https://test-shop.myshopify.com/admin',
    dest: 'https://test-shop.myshopify.com',
    sub: 'user-1',
    ...overrides,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setNotBefore(now - 1)
    .setExpirationTime(now + 60)
    .setAudience(process.env.SHOPIFY_API_KEY!)
    .sign(SECRET);
}

describe('session token — iss/dest cross-check (BFS hardening)', () => {
  it('accepts when iss and dest share a host', async () => {
    const token = await mintToken();
    const claims = await verifySessionToken(token);
    expect(claims.shop).toBe('test-shop.myshopify.com');
  });

  it('rejects when iss host != dest host (confused-deputy guard)', async () => {
    const token = await mintToken({
      iss: 'https://evil.myshopify.com/admin',
      dest: 'https://test-shop.myshopify.com',
    });
    await expect(verifySessionToken(token)).rejects.toBeDefined();
  });

  it('rejects non-URL iss', async () => {
    const token = await mintToken({ iss: 'not-a-url' });
    await expect(verifySessionToken(token)).rejects.toBeDefined();
  });

  it('rejects non-URL dest', async () => {
    const token = await mintToken({ dest: 'also-not-a-url' });
    await expect(verifySessionToken(token)).rejects.toBeDefined();
  });

  it('rejects dest whose host is not a Shopify shop domain', async () => {
    const token = await mintToken({
      iss: 'https://evil.com',
      dest: 'https://evil.com',
    });
    await expect(verifySessionToken(token)).rejects.toBeDefined();
  });
});
