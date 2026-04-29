import { prisma } from '../prisma';
import { decrypt, encrypt } from '../crypto';
import type { Plan, Store } from '@prisma/client';

export interface StoreUpsertInput {
  shopDomain: string;
  accessToken: string;
  scope: string;
}

export async function upsertStoreWithToken(input: StoreUpsertInput): Promise<Store> {
  const encrypted = encrypt(input.accessToken);
  // Reinstall: clear uninstalledAt AND scheduledRedactAt so in-flight 48h redact
  // is cancelled automatically. Matches the `app/uninstalled → app/installed
  // within 48h` merchant flow Shopify explicitly supports.
  return prisma.store.upsert({
    where: { shopDomain: input.shopDomain },
    create: {
      shopDomain: input.shopDomain,
      accessToken: encrypted,
      scope: input.scope,
      plan: 'FREE' satisfies Plan,
      installedAt: new Date(),
    },
    update: {
      accessToken: encrypted,
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
      scope: input.scope,
      uninstalledAt: null,
      scheduledRedactAt: null,
      installedAt: new Date(),
    },
  });
}

export async function markStoreUninstalled(shopDomain: string): Promise<void> {
  await prisma.store.updateMany({
    where: { shopDomain, uninstalledAt: null },
    data: { uninstalledAt: new Date() },
  });
}
