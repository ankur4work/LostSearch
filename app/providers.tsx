'use client';

import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import { NavMenu } from '@shopify/app-bridge-react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { TrpcProvider } from '@/lib/trpc/provider';

const PUBLIC_PATH_PREFIXES = ['/unsubscribe', '/methodology', '/privacy'];
// Dev bypass: render the dashboard at localhost without Shopify's embed —
// AppProvider still gives us Polaris styles, but NavMenu (App Bridge) is
// skipped because it throws when not running in admin.
const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';

export function Providers({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname() ?? '';
  const isPublic = PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));

  if (isPublic) {
    return <>{children}</>;
  }

  if (DEV_BYPASS) {
    return (
      <AppProvider i18n={enTranslations}>
        <TrpcProvider>{children}</TrpcProvider>
      </AppProvider>
    );
  }

  return (
    <AppProvider i18n={enTranslations}>
      <NavMenu>
        <a href="/" rel="home">
          Home
        </a>
        <a href="/dashboard">Dashboard</a>
        <a href="/pricing">Pricing</a>
      </NavMenu>
      <TrpcProvider>{children}</TrpcProvider>
    </AppProvider>
  );
}
