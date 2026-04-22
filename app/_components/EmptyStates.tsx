'use client';

import { Card, EmptyState, BlockStack, Text, ProgressBar, Badge } from '@shopify/polaris';

export function InsufficientDataEmpty(): JSX.Element {
  return (
    <Card>
      <EmptyState
        heading="Come back in 7 days"
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      >
        <p>
          Your storefront is still gathering search volume. We need at least 50 searches per month
          to compute reliable gap estimates. Nothing is broken — shopper search signals just haven
          &rsquo;t accumulated yet.
        </p>
        <p style={{ marginTop: 12, color: '#6D7175', fontSize: 13 }}>
          Why it matters: the revenue estimates are derived from actual shopper intent. With too
          few searches, the numbers would be noise.
        </p>
      </EmptyState>
    </Card>
  );
}

export function NoGapsFoundEmpty(): JSX.Element {
  return (
    <Card>
      <EmptyState
        heading="🎉 Your search is in great shape"
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      >
        <p>
          Every tracked shopper query resolves to a real product in your catalog with clicks. Keep
          an eye on this dashboard after new product launches — gaps tend to surface with catalog
          changes.
        </p>
      </EmptyState>
    </Card>
  );
}

interface IngestingProps {
  progressPct: number;
  jobsLabel?: string;
}

export function IngestingEmpty({ progressPct, jobsLabel }: IngestingProps): JSX.Element {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          Analyzing your store...
        </Text>
        <Text as="p" tone="subdued">
          {jobsLabel ?? 'Syncing products, orders, and search analytics'}
        </Text>
        <ProgressBar progress={progressPct} size="small" />
        <Badge tone="info">{`${progressPct}%`}</Badge>
      </BlockStack>
    </Card>
  );
}
