import IORedis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { env } from '../env';

const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

export interface MutexHandle {
  release(): Promise<void>;
}

/**
 * Per-store, per-job-type single-writer lock.
 *
 * Caller holds the lock for `ttlSeconds`; if the caller crashes, the key expires
 * so we don't deadlock a store forever. `acquire()` returns `null` when the
 * lock is already held.
 *
 * Scope: pass `scope` (e.g. "products", "orders", "search") so different
 * ingestion job types can run in parallel for the same store. Default scope
 * "all" preserves the legacy single-writer behavior for callers that need it.
 */
/** Force-release all per-scope mutex keys for a store (used on manual sync). */
export async function clearStoreMutexes(storeId: string): Promise<void> {
  const scopes = ['products', 'orders', 'search', 'all'];
  const keys = scopes.map((s) => `mutex:store:${storeId}:${s}`);
  if (keys.length > 0) await redis.del(...keys);
}

export async function acquireStoreMutex(
  storeId: string,
  ttlSeconds = 600,
  scope: string = 'all',
): Promise<MutexHandle | null> {
  const key = `mutex:store:${storeId}:${scope}`;
  const token = randomUUID();
  const ok = await redis.set(key, token, 'EX', ttlSeconds, 'NX');
  if (ok !== 'OK') return null;
  return {
    async release() {
      await redis.eval(RELEASE_SCRIPT, 1, key, token);
    },
  };
}
