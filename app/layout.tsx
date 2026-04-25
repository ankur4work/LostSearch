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
  title: 'LostSearch — Search Failure Miner',
  description: 'Turn Shopify search gaps into revenue.',
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <head>
        {/* App Bridge MUST be the first script tag, no async/defer/type=module.
            Shopify refuses to initialize otherwise. */}
        <script
          src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
          data-api-key={process.env.SHOPIFY_API_KEY ?? ''}
        />
        <meta name="shopify-api-key" content={process.env.SHOPIFY_API_KEY ?? ''} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
