import { PrismaClient } from '@prisma/client';
import { createCipheriv, randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

function encrypt(plaintext: string, hexKey: string): string {
  const key = Buffer.from(hexKey, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

async function main(): Promise<void> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !/^[0-9a-f]{64}$/i.test(secret)) {
    throw new Error('SESSION_SECRET must be set to 64 hex chars before seeding');
  }

  const shopDomain = 'dev-store.myshopify.com';
  const store = await prisma.store.upsert({
    where: { shopDomain },
    create: {
      shopDomain,
      accessToken: encrypt('shpat_dev_fake_token_for_ui_only', secret),
      scope: 'read_products,read_content',
      plan: 'FREE',
      aovCents: 6500,
      currency: 'USD',
      timezone: 'UTC',
    },
    update: {},
  });

  const now = new Date();
  const samples = [
    { q: 'organic cotton tshirt', rc: 0, cc: 0 },
    { q: 'vegan leather wallet', rc: 0, cc: 0 },
    { q: 'waterproof hiking boots', rc: 12, cc: 0 },
    { q: 'gift card', rc: 3, cc: 1 },
  ];

  await prisma.searchQuery.createMany({
    data: samples.map((s) => ({
      storeId: store.id,
      query: s.q,
      queryNormalized: s.q.toLowerCase().replace(/\s+/g, ' ').trim(),
      occurredAt: new Date(now.getTime() - Math.random() * 7 * 86400_000),
      resultCount: s.rc,
      clickCount: s.cc,
    })),
    skipDuplicates: true,
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded store ${store.shopDomain} with ${samples.length} search rows`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
