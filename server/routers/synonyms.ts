import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';
import { ShopifyClient } from '@/lib/shopify/client';
import { track } from '@/lib/analytics';

// Shopify Search & Discovery stores synonyms under /admin/api/{ver}/search/synonyms.json.
// They're account-level, scoped to the storefront search. We POST a new group;
// on undo we write an opposite audit row and POST a removal. UI surface is
// append-only — undo never does a hard delete on our records.

const APPLY_MUTATION = /* GraphQL */ `
  mutation SynonymCreate($input: SearchSynonymGroupCreateInput!) {
    searchSynonymGroupCreate(input: $input) {
      searchSynonymGroup { id synonyms }
      userErrors { field message }
    }
  }
`;

const REMOVE_MUTATION = /* GraphQL */ `
  mutation SynonymDelete($id: ID!) {
    searchSynonymGroupDelete(id: $id) {
      deletedSearchSynonymGroupId
      userErrors { field message }
    }
  }
`;

const GET_MUTATION = /* GraphQL */ `
  query SynonymGet($id: ID!) {
    searchSynonymGroup(id: $id) { id synonyms }
  }
`;

type ApplyResp = {
  searchSynonymGroupCreate: {
    searchSynonymGroup: { id: string; synonyms: string[] } | null;
    userErrors: Array<{ field: string[]; message: string }>;
  };
};

type RemoveResp = {
  searchSynonymGroupDelete: {
    deletedSearchSynonymGroupId: string | null;
    userErrors: Array<{ field: string[]; message: string }>;
  };
};

type GetResp = {
  searchSynonymGroup: { id: string; synonyms: string[] } | null;
};

async function requireStore(ctx: { session: { storeId: string | null } | null; prisma: typeof import('@/lib/prisma').prisma }) {
  const storeId = ctx.session?.storeId;
  if (!storeId) throw new TRPCError({ code: 'UNAUTHORIZED' });
  const store = await ctx.prisma.store.findUnique({ where: { id: storeId } });
  if (!store || store.uninstalledAt) throw new TRPCError({ code: 'NOT_FOUND', message: 'Store missing' });
  return store;
}

export const synonymsRouter = router({
  apply: protectedProcedure
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

      const client = new ShopifyClient(store);
      const synonyms = Array.from(new Set([input.query.trim(), product.title.trim()])).filter(Boolean);

      const resp = await client.graphql<ApplyResp>(APPLY_MUTATION, { input: { synonyms } });
      const userErrors = resp.data?.searchSynonymGroupCreate.userErrors ?? [];
      if (userErrors.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Shopify rejected synonym: ${userErrors.map((e) => e.message).join('; ')}`,
        });
      }
      const group = resp.data?.searchSynonymGroupCreate.searchSynonymGroup;
      if (!group) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Shopify returned no synonym group' });
      }

      // Verification read (acceptance criterion: "one-click synonym sync:
      // merchant action → Shopify synonym exists → verified via a second Shopify
      // API read"). A failure here rolls back our local record.
      const check = await client.graphql<GetResp>(GET_MUTATION, { id: group.id });
      if (!check.data?.searchSynonymGroup) {
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
      // 14-day window per spec.
      const maxAgeMs = 14 * 86_400_000;
      if (Date.now() - row.appliedAt.getTime() > maxAgeMs) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Undo window (14 days) has passed' });
      }

      if (row.shopifySynonymId) {
        const client = new ShopifyClient(store);
        const resp = await client.graphql<RemoveResp>(REMOVE_MUTATION, { id: row.shopifySynonymId });
        const userErrors = resp.data?.searchSynonymGroupDelete.userErrors ?? [];
        if (userErrors.length > 0) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Shopify rejected delete: ${userErrors.map((e) => e.message).join('; ')}`,
          });
        }
      }

      // Append-only audit: write a "remove" row pointing at the original.
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
    // Get applies that are NOT undone within the window.
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
