import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import type { Plan } from '@prisma/client';
import type { Context } from './context';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zod: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Session token required' });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

const PLAN_RANK: Record<Plan, number> = { FREE: 0, GROWTH: 1, PRO: 2 };

/** Gate a procedure on a minimum plan. FREE users hitting a GROWTH procedure
 *  get a FORBIDDEN. Use via `protectedProcedure.use(requirePlan('GROWTH'))`. */
export function requirePlan(minPlan: Plan) {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.session) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Session token required' });
    }
    const plan = ctx.session.plan ?? 'FREE';
    if (PLAN_RANK[plan] < PLAN_RANK[minPlan]) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Plan ${minPlan} required (current: ${plan})`,
      });
    }
    return next({ ctx });
  });
}

export const FREE_PLAN_VISIBLE_GAPS = 5;
