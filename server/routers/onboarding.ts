import { protectedProcedure, router } from '../trpc';
import type { IngestionJobType, IngestionRun } from '@prisma/client';

const JOB_TYPES: IngestionJobType[] = ['INGEST_PRODUCTS', 'INGEST_ORDERS', 'INGEST_SEARCH'];

interface JobTypeStatus {
  jobType: IngestionJobType;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  progressPct: number;
  errorMessage: string | null;
}

export const onboardingRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session.storeId) {
      return { ready: false, jobs: [] as JobTypeStatus[], overallPct: 0 };
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
      if (!run) return { jobType, status: 'PENDING', progressPct: 0, errorMessage: null };
      return {
        jobType,
        status: run.status,
        progressPct: run.progressPct,
        errorMessage: run.errorMessage,
      };
    });

    const allDone = jobs.every((j) => j.status === 'DONE');
    const overallPct = Math.round(
      jobs.reduce((acc, j) => acc + (j.status === 'DONE' ? 100 : j.progressPct), 0) / jobs.length,
    );
    return { ready: allDone, jobs, overallPct };
  }),
});
