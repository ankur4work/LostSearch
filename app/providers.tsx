'use client';

import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import { NavMenu } from '@shopify/app-bridge-react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { TrpcProvider } from '@/lib/trpc/provider';

const PUBLIC_PATH_PREFIXES = ['/unsubscribe', '/methodology', '/privacy'];

export function Providers({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname() ?? '';
  const isPublic = PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));

  if (isPublic) {
    // Public routes (unsubscribe / methodology) render without App Bridge — they
    // must work outside the Shopify admin iframe (e.g. reached from email).
    return <>{children}</>;
  }

  return (
    <AppProvider i18n={enTranslations}>
      <NavMenu>
        <a href="/" rel="home">
          Dashboard
        </a>
        <a href="/methodology">Methodology</a>
      </NavMenu>
      <TrpcProvider>{children}</TrpcProvider>
    </AppProvider>
  );
}
