import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import '@shopify/polaris/build/esm/styles.css';
import './globals.css';

// Force runtime rendering — layout reads SHOPIFY_API_KEY from process.env to
// inject the App Bridge `data-api-key`. If we let Next statically render this
// at build time the value is baked as empty (Coolify only passes secrets at
// runtime, not as build ARGs), which kills App Bridge → idToken() returns
// nothing → every tRPC call 401s → dashboard hangs on skeleton loader.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'DemandRadar',
  description: 'Turn Shopify search gaps into revenue.',
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  const apiKey = process.env.SHOPIFY_API_KEY ?? '';
  return (
    <html lang="en">
      <head>
        {/* App Bridge MUST be the first script — no async/defer/type=module.
            Rendered server-side so data-api-key is always the runtime value. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script
          src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
          data-api-key={apiKey}
        />
        <meta name="shopify-api-key" content={apiKey} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
