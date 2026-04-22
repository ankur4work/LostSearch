import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyOAuthHmac, verifyWebhookHmac } from '@/lib/shopify/hmac';

const SECRET = process.env.SHOPIFY_API_SECRET!;

function signOAuth(params: Record<string, string>): string {
  const message = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHmac('sha256', SECRET).update(message).digest('hex');
}

describe('OAuth HMAC verification', () => {
  it('accepts a valid signature', () => {
    const params = {
      code: 'abc',
      shop: 'test-shop.myshopify.com',
      state: 'xyz',
      timestamp: '1700000000',
    };
    const hmac = signOAuth(params);
    expect(verifyOAuthHmac({ ...params, hmac })).toBe(true);
  });

  it('rejects a tampered signature', () => {
    const params = { code: 'abc', shop: 'test.myshopify.com', timestamp: '1700000000' };
    const hmac = signOAuth(params);
    expect(verifyOAuthHmac({ ...params, shop: 'evil.myshopify.com', hmac })).toBe(false);
  });

  it('rejects when hmac is missing', () => {
    expect(verifyOAuthHmac({ code: 'abc' })).toBe(false);
  });

  it('rejects non-hex hmac', () => {
    expect(verifyOAuthHmac({ code: 'abc', hmac: 'not-hex!!' })).toBe(false);
  });
});

describe('Webhook HMAC verification', () => {
  it('accepts a valid signature over the raw body', () => {
    const body = JSON.stringify({ id: 1 });
    const hmac = createHmac('sha256', SECRET).update(body).digest('base64');
    expect(verifyWebhookHmac(body, hmac)).toBe(true);
  });

  it('rejects modified body', () => {
    const body = JSON.stringify({ id: 1 });
    const hmac = createHmac('sha256', SECRET).update(body).digest('base64');
    expect(verifyWebhookHmac(JSON.stringify({ id: 2 }), hmac)).toBe(false);
  });

  it('rejects missing header', () => {
    expect(verifyWebhookHmac('{}', null)).toBe(false);
  });

  it('rejects empty string hmac', () => {
    expect(verifyWebhookHmac('{}', '')).toBe(false);
  });
});
