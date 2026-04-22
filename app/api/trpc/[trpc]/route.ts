import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { NextRequest } from 'next/server';
import { appRouter } from '@/server/routers/_app';
import { createContext } from '@/server/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = (req: NextRequest): Promise<Response> =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContext({ req }),
  });

export { handler as GET, handler as POST };
