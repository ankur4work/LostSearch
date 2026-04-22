import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { verifySessionToken, extractBearerToken } from '@/lib/shopify/session';

const SECRET = new TextEncoder().encode(process.env.SHOPIFY_API_SECRET!);

async function mintToken(overrides: Record<string, unknown> = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: 'https://test-shop.myshopify.com/admin',
    dest: 'https://test-shop.myshopify.com',
    sub: 'user-123',
    sid: 'session-abc',
    ...overrides,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setNotBefore(now - 1)
    .setExpirationTime(now + 60)
    .setAudience(process.env.SHOPIFY_API_KEY!)
    .setJti('jti-1')
    .sign(SECRET);
}

describe('extractBearerToken', () => {
  it('parses a Bearer header', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });
  it('returns null for missing / malformed', () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken('Bearer ')).toBeNull();
  });
});

describe('verifySessionToken', () => {
  it('accepts a valid session token', async () => {
    const token = await mintToken();
    const claims = await verifySessionToken(token);
    expect(claims.shop).toBe('test-shop.myshopify.com');
    expect(claims.sub).toBe('user-123');
  });

  it('rejects tokens signed with the wrong secret', async () => {
    const wrongSecret = new TextEncoder().encode('not-the-right-secret');
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      iss: 'https://test.myshopify.com/admin',
      dest: 'https://test.myshopify.com',
      sub: 'u',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .setAudience(process.env.SHOPIFY_API_KEY!)
      .sign(wrongSecret);
    await expect(verifySessionToken(token)).rejects.toBeDefined();
  });

  it('rejects expired tokens', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      iss: 'https://test.myshopify.com/admin',
      dest: 'https://test.myshopify.com',
      sub: 'u',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now - 3600)
      .setExpirationTime(now - 1000)
      .setAudience(process.env.SHOPIFY_API_KEY!)
      .sign(SECRET);
    await expect(verifySessionToken(token)).rejects.toBeDefined();
  });

  it('rejects token with invalid shop domain in dest', async () => {
    const token = await mintToken({ dest: 'https://evil.com' });
    await expect(verifySessionToken(token)).rejects.toBeDefined();
  });

  it('rejects token with wrong audience', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      iss: 'https://test.myshopify.com/admin',
      dest: 'https://test.myshopify.com',
      sub: 'u',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .setAudience('wrong-audience')
      .sign(SECRET);
    await expect(verifySessionToken(token)).rejects.toBeDefined();
  });
});
