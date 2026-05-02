import { protectedProcedure, router } from '../trpc';
import type { IngestionJobType, IngestionRun } from '@prisma/client';

const JOB_TYPES: IngestionJobType[] = ['INGEST_PRODUCTS', 'INGEST_ORDERS', 'INGEST_SEARCH'];

// Products is the slow one (bulk query + embedding). Weight it heavily so the
// progress bar moves gradually instead of jumping 0→33→67→100.
const WEIGHTS: Record<IngestionJobType, number> = {
  INGEST_PRODUCTS: 0.6,
  INGEST_ORDERS: 0.2,
  INGEST_SEARCH: 0.2,
};

interface JobTypeStatus {
  jobType: IngestionJobType;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  progressPct: number;
  errorMessage: string | null;
  startedAt: Date | null;
}

export const onboardingRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session.storeId) {
      return { ready: false, hasError: false, jobs: [] as JobTypeStatus[], overallPct: 0 };
    }

    const latestPerType = await Promise.all(
      JOB_TYPES.map((jobType) =>
        ctx.prisma.ingestionRun.findFirst({
          where: { storeId: ctx.session.storeId as string, jobType },
          orderBy: { createdAt: 'desc' },
        }),
      ),
    );

    const jobs: JobTypeStatus[] = JOB_TYPES.map((jobType, i) => {
      const run: IngestionRun | null = latestPerType[i] ?? null;
      if (!run) return { jobType, status: 'PENDING', progressPct: 0, errorMessage: null, startedAt: null };
      return {
        jobType,
        status: run.status,
        progressPct: run.progressPct,
        errorMessage: run.errorMessage,
        startedAt: run.createdAt,
      };
    });

    // FAILED counts as terminal so we stop polling and show an error state.
    const allDone = jobs.every((j) => j.status === 'DONE' || j.status === 'FAILED');
    const hasError = jobs.some((j) => j.status === 'FAILED');
    const overallPct = Math.round(
      jobs.reduce((acc, j) => {
        const pct = j.status === 'DONE' ? 100 : j.progressPct;
        return acc + WEIGHTS[j.jobType] * pct;
      }, 0),
    );
    return { ready: allDone && !hasError, hasError, jobs, overallPct };
  }),
});
