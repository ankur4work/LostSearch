import IORedis from 'ioredis';
import { createHash } from 'node:crypto';
import { env } from '../env';
import { embed } from '../ingestion/embeddings';
import { engineConfig } from './config';

const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const KEY_PREFIX = 'qemb:v1:';

function keyFor(normalizedQuery: string): string {
  const h = createHash('sha256').update(normalizedQuery).digest('hex').slice(0, 24);
  return `${KEY_PREFIX}${h}`;
}

/**
 * Returns the embedding for a normalized query, caching in Redis for
 * CLASSIFY_QUERY_EMBEDDING_TTL_DAYS. Cached values are stored as length-prefixed
 * base64 Float32 buffers for compactness (1.5kB vs 7kB JSON).
 */
export async function getQueryEmbedding(normalizedQuery: string): Promise<number[]> {
  const key = keyFor(normalizedQuery);
  const cached = await redis.getBuffer(key);
  if (cached) {
    return bufferToFloats(cached);
  }
  const vec = await embed(normalizedQuery);
  const buf = floatsToBuffer(vec);
  await redis.set(key, buf, 'EX', engineConfig.queryEmbeddingTtlDays * 86_400);
  return vec;
}

function floatsToBuffer(v: number[]): Buffer {
  const buf = Buffer.allocUnsafe(v.length * 4);
  for (let i = 0; i < v.length; i += 1) buf.writeFloatLE(v[i] ?? 0, i * 4);
  return buf;
}

function bufferToFloats(buf: Buffer): number[] {
  const n = buf.length / 4;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i += 1) out[i] = buf.readFloatLE(i * 4);
  return out;
}

export async function clearQueryEmbeddingCache(): Promise<void> {
  const keys = await redis.keys(`${KEY_PREFIX}*`);
  if (keys.length > 0) await redis.del(...keys);
}
