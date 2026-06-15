'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { trpc } from './client';

const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';

interface AuthState {
  ready: boolean;
}

const TrpcAuthContext = createContext<AuthState>({ ready: DEV_BYPASS });

export function useTrpcAuth(): AuthState {
  return useContext(TrpcAuthContext);
}

declare global {
  interface Window {
    shopify?: {
      idToken?: () => Promise<string>;
      navigation?: {
        navigate: (url: string) => void;
      };
    };
  }
}

async function waitForShopifyBridge(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // Poll up to 10 seconds (100 × 100ms) for App Bridge to initialize.
  for (let i = 0; i < 100; i += 1) {
    if (typeof window.shopify?.idToken === 'function') {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false;
}

async function getFreshShopifyIdToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const tokenFn = window.shopify?.idToken;
  if (typeof tokenFn !== 'function') return null;

  try {
    const token = await tokenFn();
    return token || null;
  } catch {
    return null;
  }
}

export function TrpcProvider({ children }: { children: ReactNode }): JSX.Element {
  const [auth, setAuth] = useState<AuthState>({ ready: DEV_BYPASS });
  const bootstrapComplete = useRef(false);

  useEffect(() => {
    if (DEV_BYPASS) return;

    let cancelled = false;
    void (async () => {
      const ready = await waitForShopifyBridge();
      if (cancelled) return;

      if (!ready) {
        // App Bridge did not initialize within the timeout. This usually means
        // the data-api-key on the <script> tag is empty, stale, or the page
        // is not running inside a Shopify admin iframe.
        // Still mark auth ready so the UI renders an error rather than hanging.
        // eslint-disable-next-line no-console
        console.error(
          '[DemandRadar] App Bridge not detected after 10s. Check that SHOPIFY_API_KEY matches the app client ID and the page is loaded inside Shopify admin.',
          { apiKeyMeta: document.querySelector('meta[name="shopify-api-key"]')?.getAttribute('content') ?? '(missing)' },
        );
        setAuth({ ready: true });
        return;
      }

      for (let i = 0; i < 10 && !cancelled && !bootstrapComplete.current; i += 1) {
        const token = await getFreshShopifyIdToken();
        if (!token) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }

        const response = await fetch('/api/auth/callback?embedded=1', {
          method: 'GET',
          headers: { authorization: `Bearer ${token}` },
        }).catch(() => null);

        if (response?.ok) {
          bootstrapComplete.current = true;
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (!cancelled) {
        setAuth({ ready: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
            const headers = new Headers(init?.headers);
            if (!DEV_BYPASS) {
              const token = await getFreshShopifyIdToken();
              if (token) {
                headers.set('authorization', `Bearer ${token}`);
              }
            }
            return fetch(input, { ...init, headers });
          },
        }),
      ],
    });
    return { queryClient: qc, client: c };
  }, []);

  return (
    <TrpcAuthContext.Provider value={auth}>
      <trpc.Provider client={client} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </trpc.Provider>
    </TrpcAuthContext.Provider>
  );
}
