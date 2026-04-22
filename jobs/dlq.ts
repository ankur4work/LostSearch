import type { Job } from 'bullmq';
import { dlq } from './queue';
import { logger } from '@/lib/logger';

/**
 * Move a terminally-failed ingestion job to the DLQ for manual inspection and
 * fire a structured alert log line. A downstream alert manager (e.g. Grafana
 * alert on log stream) can match `dlq=true` to page an operator.
 */
export async function moveToDlq<T extends { storeId: string }>(
  job: Job<T>,
  err: Error,
): Promise<void> {
  await dlq.add('dead', {
    ...job.data,
    originalError: err.message.slice(0, 1000),
  } as T & { originalError: string });
  logger.error(
    {
      dlq: true,
      queue: job.queueName,
      name: job.name,
      jobId: job.id,
      storeId: job.data.storeId,
      err: err.message,
    },
    'Job moved to DLQ after exhausting retries — manual intervention required',
  );
}
