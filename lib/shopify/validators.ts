import { z } from 'zod';

export const SHOP_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export const ShopDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SHOP_DOMAIN_REGEX, 'Invalid shop domain');

export function isValidShopDomain(input: unknown): input is string {
  if (typeof input !== 'string') return false;
  return SHOP_DOMAIN_REGEX.test(input.trim().toLowerCase());
}

export const OAuthCallbackSchema = z.object({
  shop: ShopDomainSchema,
  code: z.string().min(1),
  state: z.string().min(1),
  hmac: z.string().min(1),
  timestamp: z.string().regex(/^\d+$/),
  host: z.string().optional(),
});
