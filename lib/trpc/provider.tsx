'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { useAppBridge } from '@shopify/app-bridge-react';
import { useMemo, type ReactNode } from 'react';
import { trpc } from './client';

export function TrpcProvider({ children }: { children: ReactNode }): JSX.Element {
  const app = useAppBridge();
  const { queryClient, client } = useMemo(() => {
    const qc = new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
    });
    const c = trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          transformer: superjson,
          fetch: async (input, init) => {
            const token = await app.idToken();
            const headers = new Headers(init?.headers);
            if (token) headers.set('authorization', `Bearer ${token}`);
            return fetch(input, { ...init, headers });
          },
        }),
      ],
    });
    return { queryClient: qc, client: c };
  }, [app]);

  return (
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
