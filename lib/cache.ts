import { redis } from './redis';
import { logger } from './logger';

// Thin read-through cache. JSON-serialized. Best-effort: a Redis outage falls
// back to the producer without failing the request.

export async function getOrCompute<T>(
  key: string,
  ttlSec: number,
  producer: () => Promise<T>,
): Promise<T> {
  if (ttlSec <= 0) return producer();
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as T;
  } catch (err) {
    logger.warn({ key, err: (err as Error).message }, 'cache read failed — bypassing');
  }
  const fresh = await producer();
  try {
    await redis.set(key, JSON.stringify(fresh), 'EX', ttlSec);
  } catch (err) {
    logger.warn({ key, err: (err as Error).message }, 'cache write failed — silent');
  }
  return fresh;
}

export async function invalidate(keyOrPattern: string): Promise<void> {
  if (keyOrPattern.endsWith('*')) {
    const keys = await redis.keys(keyOrPattern);
    if (keys.length > 0) await redis.del(...keys);
  } else {
    await redis.del(keyOrPattern);
  }
}
