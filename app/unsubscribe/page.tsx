import { prisma } from '@/lib/prisma';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe-token';
import { logger } from '@/lib/logger';
import { track } from '@/lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Unsubscribe · LostSearch',
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: { token?: string };
}

export default async function UnsubscribePage({ searchParams }: Props): Promise<JSX.Element> {
  const token = searchParams.token ?? '';
  const verified = verifyUnsubscribeToken(token);

  if (!verified) {
    return (
      <Shell title="Invalid or expired link">
        <p>
          This unsubscribe link is invalid or older than 90 days. Reply to any digest with
          &ldquo;unsubscribe&rdquo; and we&rsquo;ll take care of it manually.
        </p>
      </Shell>
    );
  }

  const store = await prisma.store.findUnique({
    where: { id: verified.storeId },
    select: { id: true, shopDomain: true, digestOptedOutAt: true },
  });

  if (!store) {
    return (
      <Shell title="Already unsubscribed">
        <p>This store is no longer in our records. Nothing more to do.</p>
      </Shell>
    );
  }

  if (!store.digestOptedOutAt) {
    await prisma.store.update({
      where: { id: store.id },
      data: { digestOptedOutAt: new Date() },
    });
    logger.info({ shop: store.shopDomain }, 'Merchant unsubscribed from weekly digest');
    track({
      event: 'digest_unsubscribed',
      distinctId: store.id,
      properties: { shop: store.shopDomain },
    });
  }

  return (
    <Shell title="You're unsubscribed">
      <p>
        We won&rsquo;t send any more weekly digests for <strong>{store.shopDomain}</strong>. You can
        still open the app from the Shopify Admin at any time.
      </p>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <main
      style={{
        maxWidth: 520,
        margin: '80px auto',
        padding: '32px 24px',
        background: '#FFFFFF',
        borderRadius: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        color: '#202223',
      }}
    >
      <h1 style={{ fontSize: 22, margin: '0 0 16px 0' }}>{title}</h1>
      <div style={{ fontSize: 15, lineHeight: 1.5 }}>{children}</div>
      <p style={{ marginTop: 32, fontSize: 12, color: '#6D7175' }}>
        LostSearch &middot;{' '}
        <a href="/methodology" style={{ color: '#6D7175' }}>
          How we compute this
        </a>
      </p>
    </main>
  );
}
