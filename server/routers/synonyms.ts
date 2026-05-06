import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';
import { decrypt } from '@/lib/crypto';
import { track } from '@/lib/analytics';

// Shopify synonym management uses the REST Admin API.
// searchSynonymGroupCreate (GraphQL) does not exist; write_search_synonyms is not
// a real OAuth scope Shopify grants. REST at /search/synonyms.json is the real API.
const SYNONYM_API_VERSION = '2024-07';
const SYNONYM_BASE = (shop: string) =>
  `https://${shop}/admin/api/${SYNONYM_API_VERSION}/search/synonyms`;

interface ShopifySynonymRecord {
  id: number;
  synonyms: string[];
  type: string;
}

async function synonymCreate(
  shop: string,
  token: string,
  synonyms: string[],
): Promise<{ id: string; synonyms: string[] }> {
  const res = await fetch(`${SYNONYM_BASE(shop)}.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ synonym: { synonyms, type: 'equivalent' } }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Shopify synonym create failed (${res.status}): ${text.slice(0, 400)}`,
    });
  }
  const data = JSON.parse(text) as { synonym: ShopifySynonymRecord };
  return { id: String(data.synonym.id), synonyms: data.synonym.synonyms };
}

async function synonymVerify(shop: string, token: string, id: string): Promise<boolean> {
  const res = await fetch(`${SYNONYM_BASE(shop)}/${id}.json`, {
    headers: { 'X-Shopify-Access-Token': token },
  });
  return res.ok;
}

async function synonymDelete(shop: string, token: string, id: string): Promise<void> {
  const res = await fetch(`${SYNONYM_BASE(shop)}/${id}.json`, {
    method: 'DELETE',
    headers: { 'X-Shopify-Access-Token': token },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '');
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Shopify synonym delete failed (${res.status}): ${text.slice(0, 400)}`,
    });
  }
}

async function requireStore(ctx: { session: { storeId: string | null } | null; prisma: typeof import('@/lib/prisma').prisma }) {
  const storeId = ctx.session?.storeId;
  if (!storeId) throw new TRPCError({ code: 'UNAUTHORIZED' });
  const store = await ctx.prisma.store.findUnique({ where: { id: storeId } });
  if (!store || store.uninstalledAt) throw new TRPCError({ code: 'NOT_FOUND', message: 'Store missing' });
  return store;
}

export const synonymsRouter = router({
  addSynonym: protectedProcedure
    .input(
      z.object({
        classificationId: z.string().cuid(),
        query: z.string().min(1).max(200),
        productId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const store = await requireStore(ctx);
      const classification = await ctx.prisma.classification.findUnique({
        where: { id: input.classificationId },
        include: { revenueEstimates: true },
      });
      if (!classification || classification.storeId !== store.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Classification not found' });
      }
      const product = await ctx.prisma.catalogProduct.findUnique({
        where: { id: input.productId },
      });
      if (!product || product.storeId !== store.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Product not found' });
      }

      const token = decrypt(store.accessToken);
      const synonyms = Array.from(new Set([input.query.trim(), product.title.trim()])).filter(Boolean);

      const group = await synonymCreate(store.shopDomain, token, synonyms);

      const verified = await synonymVerify(store.shopDomain, token, group.id);
      if (!verified) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Synonym verification read failed — not recording locally',
        });
      }

      const estimatedImpactCents = classification.revenueEstimates[0]?.estimateCents ?? null;
      const row = await ctx.prisma.synonymApplied.create({
        data: {
          storeId: store.id,
          query: input.query,
          productId: input.productId,
          productTitle: product.title,
          shopifySynonymId: group.id,
          source: 'merchant',
          similarity: classification.confidence,
          estimatedImpactCents,
        },
      });
      track({
        event: 'synonym_added',
        distinctId: store.id,
        properties: {
          shop: store.shopDomain,
          query: input.query,
          productTitle: product.title,
          estimatedImpactCents,
        },
      });
      return { id: row.id, shopifySynonymId: group.id, productTitle: product.title };
    }),

  undo: protectedProcedure
    .input(z.object({ synonymAppliedId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const store = await requireStore(ctx);
      const row = await ctx.prisma.synonymApplied.findUnique({
        where: { id: input.synonymAppliedId },
      });
      if (!row || row.storeId !== store.id) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      if (row.source === 'remove') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already undone' });
      }
      const maxAgeMs = 14 * 86_400_000;
      if (Date.now() - row.appliedAt.getTime() > maxAgeMs) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Undo window (14 days) has passed' });
      }

      if (row.shopifySynonymId) {
        const token = decrypt(store.accessToken);
        await synonymDelete(store.shopDomain, token, row.shopifySynonymId);
      }

      const removeRow = await ctx.prisma.synonymApplied.create({
        data: {
          storeId: store.id,
          query: row.query,
          productId: row.productId,
          productTitle: row.productTitle,
          shopifySynonymId: row.shopifySynonymId,
          source: 'remove',
          undoesId: row.id,
        },
      });
      track({
        event: 'synonym_undone',
        distinctId: store.id,
        properties: { shop: store.shopDomain, query: row.query, undoesId: row.id },
      });
      return { id: removeRow.id };
    }),

  appliedThisWeek: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session.storeId) return [];
    const since = new Date(Date.now() - 7 * 86_400_000);
    const applied = await ctx.prisma.synonymApplied.findMany({
      where: { storeId: ctx.session.storeId, source: 'merchant', appliedAt: { gte: since } },
      orderBy: { appliedAt: 'desc' },
      take: 50,
    });
    const undoes = new Set(
      (
        await ctx.prisma.synonymApplied.findMany({
          where: {
            storeId: ctx.session.storeId,
            source: 'remove',
            undoesId: { in: applied.map((a) => a.id) },
          },
          select: { undoesId: true },
        })
      )
        .map((r) => r.undoesId)
        .filter((id): id is string => Boolean(id)),
    );
    return applied
      .filter((a) => !undoes.has(a.id))
      .map((a) => ({
        id: a.id,
        query: a.query,
        productTitle: a.productTitle,
        estimatedImpactCents: a.estimatedImpactCents,
        appliedAt: a.appliedAt,
      }));
  }),
});
