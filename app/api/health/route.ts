import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness + readiness probe.
 * - Always returns 200 with a diagnostic payload so UptimeRobot can alert on
 *   ANY non-200 (meaning the process itself is down).
 * - Degraded dependencies (DB or Redis unreachable) surface as `degraded: true`
 *   in the JSON body but still 200 — the runbook tells oncall how to read it.
 *   Use `?strict=1` to get a 503 when degraded, which is what Coolify's
 *   rolling-deploy health check wants.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const strict = url.searchParams.get('strict') === '1';

  const [dbOk, redisOk] = await Promise.all([pingPostgres(), pingRedis()]);
  const ok = dbOk && redisOk;
  const status = !ok && strict ? 503 : 200;

  return NextResponse.json(
    {
      ok,
      degraded: !ok,
      checks: { postgres: dbOk, redis: redisOk },
      uptime_sec: Math.round(process.uptime()),
      version: process.env.npm_package_version ?? 'dev',
    },
    { status },
  );
}

async function pingPostgres(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function pingRedis(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
