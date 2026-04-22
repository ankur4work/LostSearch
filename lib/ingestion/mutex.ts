import IORedis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { env } from '../env';

const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

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
 * Per-store single-writer lock.
 *
 * Caller holds the lock for `ttlSeconds`; if the caller crashes, the key expires
 * so we don't deadlock a store forever. `acquire()` returns `null` when the
 * lock is already held.
 */
export async function acquireStoreMutex(
  storeId: string,
  ttlSeconds = 600,
): Promise<MutexHandle | null> {
  const key = `mutex:store:${storeId}`;
  const token = randomUUID();
  const ok = await redis.set(key, token, 'EX', ttlSeconds, 'NX');
  if (ok !== 'OK') return null;
  return {
    async release() {
      await redis.eval(RELEASE_SCRIPT, 1, key, token);
    },
  };
}
