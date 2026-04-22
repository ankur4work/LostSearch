import IORedis from 'ioredis';
import { env } from './env';

// Shared Redis connection pool. BullMQ and ad-hoc consumers (rate limits,
// caches, OAuth state, embedding cache) share a single client to avoid
// exhausting Coolify's managed-Redis connection ceiling.
export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});
