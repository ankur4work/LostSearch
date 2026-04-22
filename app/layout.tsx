import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import '@shopify/polaris/build/esm/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Search Failure Miner',
  description: 'Turn Shopify search gaps into revenue.',
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <head>
        <meta name="shopify-api-key" content={process.env.SHOPIFY_API_KEY ?? ''} />
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" async />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
