import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc';
import { env } from '@/lib/env';
import { ShopifyClient } from '@/lib/shopify/client';

const CREATE_CHARGE_MUTATION = /* GraphQL */ `
  mutation AppSubCreate(
    $name: String!,
    $returnUrl: URL!,
    $lineItems: [AppSubscriptionLineItemInput!]!,
    $trialDays: Int,
    $test: Boolean
  ) {
    appSubscriptionCreate(
      name: $name,
      returnUrl: $returnUrl,
      lineItems: $lineItems,
      trialDays: $trialDays,
      test: $test
    ) {
      appSubscription { id status }
      confirmationUrl
      userErrors { field message }
    }
  }
`;

type CreateChargeResp = {
  appSubscriptionCreate: {
    appSubscription: { id: string; status: string } | null;
    confirmationUrl: string | null;
    userErrors: Array<{ field: string[]; message: string }>;
  };
};

export const billingRouter = router({
  currentPlan: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session.storeId) {
      return { plan: 'FREE' as const, graceEndsAt: null, shopifyChargeId: null };
    }
    const store = await ctx.prisma.store.findUnique({
      where: { id: ctx.session.storeId },
      select: { plan: true, graceEndsAt: true, shopifyChargeId: true },
    });
    return {
      plan: store?.plan ?? 'FREE',
      graceEndsAt: store?.graceEndsAt ?? null,
      shopifyChargeId: store?.shopifyChargeId ?? null,
    };
  }),

  createCharge: protectedProcedure
    .input(z.object({ plan: z.enum(['GROWTH']) }))
    .mutation(async ({ ctx, input }) => {
      const storeId = ctx.session.storeId;
      if (!storeId) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const store = await ctx.prisma.store.findUnique({ where: { id: storeId } });
      if (!store || store.uninstalledAt) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Store missing' });
      }

      const client = new ShopifyClient(store);
      const priceUSD = env.GROWTH_PLAN_PRICE_USD;
      const trialDays = env.GROWTH_PLAN_TRIAL_DAYS;

      const resp = await client.graphql<CreateChargeResp>(CREATE_CHARGE_MUTATION, {
        name: `LostSearch — ${input.plan}`,
        returnUrl: `${ctx.appUrl}/billing/callback?shop=${encodeURIComponent(store.shopDomain)}`,
        trialDays,
        test: env.BILLING_TEST_MODE,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: priceUSD.toFixed(2), currencyCode: 'USD' },
                interval: 'EVERY_30_DAYS',
              },
            },
          },
        ],
      });

      const userErrors = resp.data?.appSubscriptionCreate.userErrors ?? [];
      if (userErrors.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Shopify billing rejected: ${userErrors.map((e) => `${e.field?.join('.')}: ${e.message}`).join('; ')}`,
        });
      }
      const confirmationUrl = resp.data?.appSubscriptionCreate.confirmationUrl;
      const subscription = resp.data?.appSubscriptionCreate.appSubscription;
      if (!confirmationUrl || !subscription) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No confirmation URL' });
      }
      await ctx.prisma.store.update({
        where: { id: store.id },
        data: { shopifyChargeId: subscription.id },
      });
      return { confirmationUrl, chargeId: subscription.id, status: subscription.status };
    }),
});
