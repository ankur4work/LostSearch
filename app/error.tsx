'use client';

import { useEffect } from 'react';
import { Page, Card, EmptyState, BlockStack, Button } from '@shopify/polaris';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  useEffect(() => {
    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
      }),
    }).catch(() => {
      /* swallow — logging is best-effort */
    });
  }, [error]);

  return (
    <Page>
      <Card>
        <BlockStack gap="400">
          <EmptyState
            heading="Something went wrong"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>We hit an unexpected error. The team has been notified.</p>
          </EmptyState>
          <Button onClick={reset}>Try again</Button>
        </BlockStack>
      </Card>
    </Page>
  );
}
