import { router } from '../trpc';
import { dashboardRouter } from './dashboard';
import { onboardingRouter } from './onboarding';
import { synonymsRouter } from './synonyms';
import { billingRouter } from './billing';

export const appRouter = router({
  dashboard: dashboardRouter,
  onboarding: onboardingRouter,
  synonyms: synonymsRouter,
  billing: billingRouter,
});

export type AppRouter = typeof appRouter;
