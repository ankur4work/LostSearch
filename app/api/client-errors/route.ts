import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ClientErrorSchema = z.object({
  message: z.string().max(2000),
  stack: z.string().max(10_000).optional(),
  digest: z.string().max(200).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = ClientErrorSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  logger.error({ clientError: body.data }, 'Client-side error boundary triggered');
  return NextResponse.json({ ok: true });
}
