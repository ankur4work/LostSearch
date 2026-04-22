import { describe, it, expect } from 'vitest';
import { isValidShopDomain, ShopDomainSchema } from '@/lib/shopify/validators';

describe('shop domain validation', () => {
  it('accepts canonical shop domains', () => {
    expect(isValidShopDomain('my-store.myshopify.com')).toBe(true);
    expect(isValidShopDomain('acme123.myshopify.com')).toBe(true);
    expect(isValidShopDomain('a.myshopify.com')).toBe(true);
  });

  it('normalizes case and whitespace through the schema', () => {
    expect(ShopDomainSchema.parse('  MY-Store.MyShopify.com ')).toBe('my-store.myshopify.com');
  });

  it.each([
    ['empty', ''],
    ['missing tld', 'shop'],
    ['wrong tld', 'shop.shopify.com'],
    ['path traversal', 'shop.myshopify.com/../evil'],
    ['query string', 'shop.myshopify.com?foo=bar'],
    ['subdomain injection', 'evil.com.myshopify.com.attacker.io'],
    ['double suffix', 'shop.myshopify.com.myshopify.com'],
    ['leading dash', '-bad.myshopify.com'],
    ['underscore', 'bad_shop.myshopify.com'],
    ['unicode homograph', 'shop.myѕhopify.com'],
    ['embedded newline', 'shop.myshopify.com\n'],
    ['protocol prefix', 'https://shop.myshopify.com'],
    ['port suffix', 'shop.myshopify.com:8080'],
    ['null bytes', 'shop\0.myshopify.com'],
    ['space in name', 'bad shop.myshopify.com'],
  ])('rejects %s', (_label, input) => {
    expect(isValidShopDomain(input)).toBe(false);
    expect(ShopDomainSchema.safeParse(input).success).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidShopDomain(null)).toBe(false);
    expect(isValidShopDomain(undefined)).toBe(false);
    expect(isValidShopDomain(42)).toBe(false);
    expect(isValidShopDomain({ shop: 'ok.myshopify.com' })).toBe(false);
  });
});
