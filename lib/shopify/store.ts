import { prisma } from '../prisma';
import { decrypt, encrypt } from '../crypto';
import type { Plan, Store } from '@prisma/client';

export interface StoreUpsertInput {
  shopDomain: string;
  accessToken: string;
  scope: string;
  /** Seconds until the access token expires (null = non-expiring). */
  expiresIn?: number | null;
}

function expiresAt(expiresIn: number | null | undefined): Date | null {
  if (!expiresIn) return null;
  // Subtract 60s buffer so we refresh before the token actually expires.
  return new Date(Date.now() + (expiresIn - 60) * 1000);
}

export async function upsertStoreWithToken(input: StoreUpsertInput): Promise<Store> {
  const encrypted = encrypt(input.accessToken);
  const tokenExpiresAt = expiresAt(input.expiresIn);
  // Reinstall: clear uninstalledAt AND scheduledRedactAt so in-flight 48h redact
  // is cancelled automatically. Matches the `app/uninstalled → app/installed
  // within 48h` merchant flow Shopify explicitly supports.
  return prisma.store.upsert({
    where: { shopDomain: input.shopDomain },
    create: {
      shopDomain: input.shopDomain,
      accessToken: encrypted,
      accessTokenExpiresAt: tokenExpiresAt,
      scope: input.scope,
      plan: 'FREE' satisfies Plan,
      installedAt: new Date(),
    },
    update: {
      accessToken: encrypted,
      accessTokenExpiresAt: tokenExpiresAt,
      scope: input.scope,
      uninstalledAt: null,
      scheduledRedactAt: null,
      installedAt: new Date(),
    },
  });
}

export async function getStoreToken(shopDomain: string): Promise<string | null> {
  const store = await prisma.store.findUnique({ where: { shopDomain } });
  if (!store || store.uninstalledAt) return null;
  return decrypt(store.accessToken);
}

export async function refreshStoreToken(input: StoreUpsertInput): Promise<Store> {
  return prisma.store.update({
    where: { shopDomain: input.shopDomain },
    data: {
      accessToken: encrypt(input.accessToken),
      accessTokenExpiresAt: expiresAt(input.expiresIn),
      scope: input.scope,
      uninstalledAt: null,
      scheduledRedactAt: null,
      installedAt: new Date(),
    },
  });
}

/** Returns true if the store's access token is expired or expiring within 5 minutes. */
export function isTokenExpired(store: { accessTokenExpiresAt: Date | null }): boolean {
  if (!store.accessTokenExpiresAt) return false;
  return store.accessTokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000;
}

export async function markStoreUninstalled(shopDomain: string): Promise<void> {
  await prisma.store.updateMany({
    where: { shopDomain, uninstalledAt: null },
    data: { uninstalledAt: new Date() },
  });
}
