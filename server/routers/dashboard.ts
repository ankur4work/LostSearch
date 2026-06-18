import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { ClassificationType, PrismaClient } from '@prisma/client';
import { protectedProcedure, router, FREE_PLAN_VISIBLE_GAPS } from '../trpc';
import { bucketForEstimate } from '@/lib/money';
import { getOrCompute } from '@/lib/cache';
import { env } from '@/lib/env';
import { decrypt } from '@/lib/crypto';
import { ADMIN_API_VERSION } from '@/lib/shopify/client';

const TypeFilterSchema = z.enum(['ALL', 'TYPE_1', 'TYPE_2', 'TYPE_3', 'TYPE_4']);

function latestDate(dates: Array<Date | null | undefined>): Date | null {
  let latest: Date | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (!latest || d.getTime() > latest.getTime()) latest = d;
  }
  return latest;
}

export const dashboardRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session.storeId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No store in session' });
    const storeId = ctx.session.storeId;
    // Redis read-through cache — 60s by default. Cache key is per-store.
    const cacheKey = `dash:summary:v1:${storeId}`;
    return getOrCompute(cacheKey, env.DASHBOARD_SUMMARY_CACHE_TTL_SEC, () =>
      computeSummary(ctx.prisma, storeId),
    );
  }),

  gaps: protectedProcedure
    .input(
      z.object({
        type: TypeFilterSchema.default('ALL'),
        limit: z.number().int().positive().max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.session.storeId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No store resolved' });
      }
      const storeId = ctx.session.storeId;
      const plan = ctx.session.plan ?? 'FREE';

      // NOTE: We intentionally do NOT filter out low-volume gaps on FREE. A
      // brand-new store (and an App Reviewer doing a burst of distinct test
      // searches) initially has ONLY low-volume gaps — hiding them made the
      // FREE list render empty while the stat card still claimed gaps existed,
      // which read as "the app is broken". Monetization is preserved by the
      // blur-lock below: FREE still only reveals the top FREE_PLAN_VISIBLE_GAPS
      // (ordered by occurrence/revenue, so genuine high-volume gaps win the
      // visible slots), with the rest shown blurred behind the upgrade CTA.
      const where = {
        storeId,
        ...(input.type === 'ALL' ? {} : { type: input.type }),
      };

      const [total, rows] = await Promise.all([
        ctx.prisma.classification.count({ where }),
        ctx.prisma.classification.findMany({
          where,
          include: { revenueEstimates: true },
          orderBy: [{ occurrenceCount: 'desc' }, { queryNorm: 'asc' }],
          take: input.limit * 2,
          skip: input.offset,
        }),
      ]);

      rows.sort((a, b) => {
        const av = a.revenueEstimates[0]?.estimateCents ?? 0;
        const bv = b.revenueEstimates[0]?.estimateCents ?? 0;
        if (bv !== av) return bv - av;
        if (b.occurrenceCount !== a.occurrenceCount) return b.occurrenceCount - a.occurrenceCount;
        return a.queryNorm.localeCompare(b.queryNorm);
      });
      const paged = rows.slice(0, input.limit);

      const matchedIds = Array.from(
        new Set(paged.flatMap((r) => r.matchedProductIds.slice(0, 3))),
      );
      const products = matchedIds.length
        ? await ctx.prisma.catalogProduct.findMany({
            where: { id: { in: matchedIds } },
            select: { id: true, title: true, shopifyProductId: true },
          })
        : [];
      const titleById = new Map(products.map((p) => [p.id, p]));

      let lockedRevenueSumCents = 0;
      const gaps = paged.map((c, i) => {
        const globalIndex = i + input.offset;
        const visible = plan !== 'FREE' || globalIndex < FREE_PLAN_VISIBLE_GAPS;
        const revenue = c.revenueEstimates[0] ?? null;
        const titles = c.matchedProductIds
          .slice(0, 3)
          .map((id) => titleById.get(id)?.title)
          .filter((t): t is string => Boolean(t));

        if (!visible && revenue) lockedRevenueSumCents += revenue.estimateCents;

        return {
          id: c.id,
          queryNorm: c.queryNorm,
          type: c.type,
          confidence: c.confidence,
          occurrenceCount: c.occurrenceCount,
          matchedProductIds: visible ? c.matchedProductIds : [],
          matchedProductTitles: visible ? titles : [],
          lowVolume: c.lowVolume,
          locked: !visible,
          estimateCents: visible ? revenue?.estimateCents ?? 0 : null,
          bandLowCents: visible ? revenue?.bandLowCents ?? 0 : null,
          bandHighCents: visible ? revenue?.bandHighCents ?? 0 : null,
          revenueBucket: revenue ? bucketForEstimate(revenue.estimateCents) : null,
          reasoning: visible ? c.reasoning : null,
        };
      });

      return {
        gaps,
        total,
        lockedCount: gaps.filter((g) => g.locked).length,
        lockedRevenueSumCents,
        plan,
      };
    }),

  trend: protectedProcedure
    .input(z.object({ queryNormalized: z.string().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      if (!ctx.session.storeId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      const rows = await ctx.prisma.searchQuery.findMany({
        where: {
          storeId: ctx.session.storeId,
          queryNormalized: input.queryNormalized,
          occurredAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
        },
        orderBy: { dateBucket: 'asc' },
        select: { dateBucket: true, occurrenceCount: true },
      });
      return rows.map((r) => ({ date: r.dateBucket, count: r.occurrenceCount }));
    }),

  trackerStatus: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session?.storeId) return { enabled: null as boolean | null };
    const storeId = ctx.session.storeId;
    const cacheKey = `dash:tracker-status:v4:${storeId}`;
    return getOrCompute(cacheKey, 300, async () => {
      try {
        const store = await ctx.prisma.store.findUnique({
          where: { id: storeId },
          select: { shopDomain: true, accessToken: true },
        });
        if (!store) return { enabled: null as boolean | null };
        const token = decrypt(store.accessToken);
        const headers = {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
        };

        const themesRes = await fetch(
          `https://${store.shopDomain}/admin/api/${ADMIN_API_VERSION}/themes.json?role=main`,
          { headers },
        );
        if (!themesRes.ok) return { enabled: null as boolean | null };

        const themesData = (await themesRes.json()) as {
          themes: Array<{ id: number; role: string }>;
        };
        const mainTheme = themesData.themes.find((t) => t.role === 'main');
        if (!mainTheme) return { enabled: null as boolean | null };

        const assetRes = await fetch(
          `https://${store.shopDomain}/admin/api/${ADMIN_API_VERSION}/themes/${mainTheme.id}/assets.json?asset[key]=config/settings_data.json`,
          { headers },
        );
        if (!assetRes.ok) return { enabled: null as boolean | null };

        const assetData = (await assetRes.json()) as { asset: { value: string } };

        type ThemeBlock = { type: string; disabled?: boolean; blocks?: Record<string, ThemeBlock> };
        type SettingsData = {
          current?: {
            blocks?: Record<string, ThemeBlock>;
            sections?: Record<string, { type?: string; disabled?: boolean; blocks?: Record<string, ThemeBlock> }>;
          };
        };
        const settings = JSON.parse(assetData.asset.value) as SettingsData;

        function isTrackerBlock(b: ThemeBlock): boolean {
          // Theme block type: shopify://apps/<app-handle>/blocks/<block-handle>/<uid>
          // Match on the BLOCK handle (`tracker`, from blocks/tracker.liquid),
          // not the app handle. The app handle changes when the app is renamed
          // or re-created — it was previously hardcoded as `lostsearch`, which
          // silently broke tracker detection after the DemandRadar rebrand. The
          // block handle is stable across renames.
          return /^shopify:\/\/apps\/[^/]+\/blocks\/tracker\//.test(b.type);
        }

        // App embed blocks live at current.blocks in OS 2.0 themes.
        // Some themes store them nested inside sections — search both.
        const topBlocks = Object.values(settings.current?.blocks ?? {});
        const sectionBlocks = Object.values(settings.current?.sections ?? {}).flatMap(
          (s) => Object.values(s.blocks ?? {}),
        );
        const trackerBlock = [...topBlocks, ...sectionBlocks].find(isTrackerBlock);

        ctx.logger.info(
          { shop: store.shopDomain, found: !!trackerBlock, enabled: trackerBlock ? trackerBlock.disabled !== true : false },
          'trackerStatus check',
        );

        if (!trackerBlock) return { enabled: false };
        return { enabled: trackerBlock.disabled !== true };
      } catch {
        return { enabled: null as boolean | null };
      }
    });
  }),

  markDashboardViewed: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.session.storeId) return { isFirstView: false };
    const result = await ctx.prisma.store.updateMany({
      where: { id: ctx.session.storeId, firstDashboardViewAt: null },
      data: { firstDashboardViewAt: new Date() },
    });
    return { isFirstView: result.count === 1 };
  }),
});

async function computeSummary(
  prisma: PrismaClient,
  storeId: string,
): Promise<ReturnType<typeof emptySummary>> {
  const [store, agg, counts, latest, searchVolume30, topGap] = await Promise.all([
    prisma.store.findUnique({
      where: { id: storeId },
      select: {
        shopDomain: true,
        plan: true,
        currency: true,
        industry: true,
        category: true,
        aovCents: true,
        insufficientAov: true,
        lastSearchSync: true,
        lastProductSync: true,
        lastOrderSync: true,
        firstDashboardViewAt: true,
      },
    }),
    prisma.revenueEstimate.aggregate({
      _sum: { estimateCents: true, bandLowCents: true, bandHighCents: true },
      where: { classification: { storeId } },
    }),
    prisma.classification.groupBy({
      by: ['type'],
      where: { storeId },
      _count: { _all: true },
    }),
    prisma.classification.aggregate({
      _max: { createdAt: true },
      where: { storeId },
    }),
    prisma.searchQuery.aggregate({
      _sum: { occurrenceCount: true },
      where: {
        storeId,
        occurredAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
    }),
    prisma.classification.findFirst({
      where: { storeId, lowVolume: false, type: { not: 'UNCAT' } },
      orderBy: [{ occurrenceCount: 'desc' }],
      include: { revenueEstimates: true },
    }),
  ]);

  const countsByType: Record<ClassificationType, number> = {
    TYPE_1: 0,
    TYPE_2: 0,
    TYPE_3: 0,
    TYPE_4: 0,
    UNCAT: 0,
  };
  for (const c of counts) countsByType[c.type] = c._count._all;

  return {
    storeName: store?.shopDomain.replace(/\.myshopify\.com$/, '') ?? 'Store',
    shopDomain: store?.shopDomain ?? '',
    plan: store?.plan ?? 'FREE',
    currency: store?.currency ?? 'USD',
    industry: store?.industry ?? null,
    category: store?.category ?? 'DEFAULT',
    aovCents: store?.aovCents ?? null,
    insufficientAov: store?.insufficientAov ?? false,
    lastSyncedAt: latestDate([
      store?.lastSearchSync,
      store?.lastProductSync,
      store?.lastOrderSync,
    ]),
    firstDashboardViewAt: store?.firstDashboardViewAt ?? null,
    revenueImpactCents: agg._sum.estimateCents ?? 0,
    bandLowCents: agg._sum.bandLowCents ?? 0,
    bandHighCents: agg._sum.bandHighCents ?? 0,
    countsByType: {
      TYPE_1: countsByType.TYPE_1,
      TYPE_2: countsByType.TYPE_2,
      TYPE_3: countsByType.TYPE_3,
      TYPE_4: countsByType.TYPE_4,
    },
    productGaps: countsByType.TYPE_1,
    keywordFixes: countsByType.TYPE_2,
    resultsNoClick: countsByType.TYPE_3,
    totalMonthlySearches: searchVolume30._sum.occurrenceCount ?? 0,
    totalClassifications:
      countsByType.TYPE_1 + countsByType.TYPE_2 + countsByType.TYPE_3 + countsByType.TYPE_4,
    topQuery: topGap
      ? {
          query: topGap.queryNorm,
          estimateCents: topGap.revenueEstimates[0]?.estimateCents ?? 0,
        }
      : null,
    lastUpdatedAt: latest._max.createdAt,
  };
}

function emptySummary(): {
  storeName: string;
  shopDomain: string;
  plan: 'FREE' | 'GROWTH' | 'PRO';
  currency: string;
  industry: string | null;
  category: string;
  aovCents: number | null;
  insufficientAov: boolean;
  lastSyncedAt: Date | null;
  firstDashboardViewAt: Date | null;
  revenueImpactCents: number;
  bandLowCents: number;
  bandHighCents: number;
  countsByType: { TYPE_1: number; TYPE_2: number; TYPE_3: number; TYPE_4: number };
  productGaps: number;
  keywordFixes: number;
  resultsNoClick: number;
  totalMonthlySearches: number;
  totalClassifications: number;
  topQuery: { query: string; estimateCents: number } | null;
  lastUpdatedAt: Date | null;
} {
  return {
    storeName: 'Store',
    shopDomain: '',
    plan: 'FREE',
    currency: 'USD',
    industry: null,
    category: 'DEFAULT',
    aovCents: null,
    insufficientAov: false,
    lastSyncedAt: null,
    firstDashboardViewAt: null,
    revenueImpactCents: 0,
    bandLowCents: 0,
    bandHighCents: 0,
    countsByType: { TYPE_1: 0, TYPE_2: 0, TYPE_3: 0, TYPE_4: 0 },
    productGaps: 0,
    keywordFixes: 0,
    resultsNoClick: 0,
    totalMonthlySearches: 0,
    totalClassifications: 0,
    topQuery: null,
    lastUpdatedAt: null,
  };
}
