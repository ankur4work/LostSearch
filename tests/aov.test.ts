import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing modules that use it.
const updateMock = vi.fn<[unknown], Promise<unknown>>().mockResolvedValue({});
vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: {
      update: updateMock,
      findUnique: vi.fn(),
    },
    ingestionRun: { update: vi.fn() },
  },
}));

import { ingestOrders } from '@/lib/ingestion/orders';
import type { Store } from '@prisma/client';

function mockStore(): Store {
  return {
    id: 'store_1',
    shopDomain: 'aov.myshopify.com',
    accessToken: 'placeholder',
    scope: '',
    plan: 'FREE',
    aovCents: null,
    currency: null,
    timezone: null,
    merchantEmail: null,
    orderSampleSize: null,
    insufficientAov: false,
    installedAt: new Date(),
    uninstalledAt: null,
    lastSyncAt: null,
    lastProductSync: null,
    lastOrderSync: null,
    lastSearchSync: null,
    scheduledRedactAt: null,
  } as Store;
}

function orderEdge(amount: string, status = 'PAID', currency = 'USD') {
  return {
    node: {
      id: `gid://Order/${Math.random()}`,
      createdAt: '2026-04-01T00:00:00Z',
      displayFinancialStatus: status,
      currentTotalPriceSet: { shopMoney: { amount, currencyCode: currency } },
    },
  };
}

function mockGraphQL(edges: ReturnType<typeof orderEdge>[], currency = 'USD') {
  return vi.fn(async () => ({
    data: {
      orders: { pageInfo: { hasNextPage: false, endCursor: null }, edges },
      shop: { currencyCode: currency },
    },
  }));
}

beforeEach(() => {
  updateMock.mockClear();
});

describe('AOV calculation', () => {
  it('returns null AOV for zero orders', async () => {
    const { ShopifyClient } = await import('@/lib/shopify/client');
    vi.spyOn(ShopifyClient.prototype, 'graphql').mockImplementation(mockGraphQL([]));
    const result = await ingestOrders(mockStore(), { windowDays: 90 });
    expect(result.orderCount).toBe(0);
    expect(result.aovCents).toBeNull();
    expect(result.insufficientData).toBe(true);
  });

  it('returns null AOV for < 10 orders and flags insufficient', async () => {
    const { ShopifyClient } = await import('@/lib/shopify/client');
    vi.spyOn(ShopifyClient.prototype, 'graphql').mockImplementation(
      mockGraphQL([orderEdge('50.00'), orderEdge('75.00')]),
    );
    const result = await ingestOrders(mockStore(), { windowDays: 90 });
    expect(result.orderCount).toBe(2);
    expect(result.aovCents).toBeNull();
    expect(result.insufficientData).toBe(true);
  });

  it('excludes refunded, partially refunded, and voided orders', async () => {
    const { ShopifyClient } = await import('@/lib/shopify/client');
    const edges = [
      ...Array.from({ length: 10 }, () => orderEdge('100.00')),
      orderEdge('999.00', 'REFUNDED'),
      orderEdge('999.00', 'PARTIALLY_REFUNDED'),
      orderEdge('999.00', 'VOIDED'),
    ];
    vi.spyOn(ShopifyClient.prototype, 'graphql').mockImplementation(mockGraphQL(edges));
    const result = await ingestOrders(mockStore(), { windowDays: 90 });
    expect(result.orderCount).toBe(10);
    expect(result.aovCents).toBe(10_000);
  });

  it('computes correct AOV in cents (rounds half-up)', async () => {
    const { ShopifyClient } = await import('@/lib/shopify/client');
    const edges = [
      ...Array.from({ length: 10 }, (_, i) => orderEdge(String(100 + i))),
    ];
    vi.spyOn(ShopifyClient.prototype, 'graphql').mockImplementation(mockGraphQL(edges));
    const result = await ingestOrders(mockStore(), { windowDays: 90 });
    // 100..109 = 1045 total / 10 = 104.5 → 10_450 cents.
    expect(result.aovCents).toBe(10_450);
  });

  it('pins to store primary currency (ignores multi-currency presentment)', async () => {
    const { ShopifyClient } = await import('@/lib/shopify/client');
    const edges = [
      ...Array.from({ length: 10 }, () => orderEdge('100.00', 'PAID', 'USD')),
      orderEdge('9999.00', 'PAID', 'EUR'), // must be dropped
    ];
    vi.spyOn(ShopifyClient.prototype, 'graphql').mockImplementation(mockGraphQL(edges, 'USD'));
    const result = await ingestOrders(mockStore(), { windowDays: 90 });
    expect(result.currency).toBe('USD');
    expect(result.orderCount).toBe(10);
    expect(result.aovCents).toBe(10_000);
  });
});
