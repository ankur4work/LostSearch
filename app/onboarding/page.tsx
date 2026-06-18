'use client';

import {
  Page,
  Card,
  BlockStack,
  Text,
  ProgressBar,
  InlineStack,
  Badge,
  Banner,
  SkeletonBodyText,
} from '@shopify/polaris';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useTrpcAuth } from '@/lib/trpc/provider';

const LABELS: Record<string, string> = {
  INGEST_PRODUCTS: 'Syncing product catalog',
  INGEST_ORDERS: 'Computing store AOV',
  INGEST_SEARCH: 'Preparing search tracking',
};

const TONE: Record<string, 'info' | 'success' | 'critical' | 'attention'> = {
  PENDING: 'info',
  RUNNING: 'attention',
  DONE: 'success',
  FAILED: 'critical',
};

export default function OnboardingPage(): JSX.Element {
  const router = useRouter();
  const auth = useTrpcAuth();
  const status = trpc.onboarding.status.useQuery(undefined, {
    enabled: auth.ready,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (status.data?.ready) {
      router.replace('/');
    }
  }, [status.data?.ready, router]);

  if (!auth.ready || status.isLoading) {
    return (
      <Page title="Setting up your store" subtitle="This usually takes a minute or two.">
        <Card>
          <SkeletonBodyText lines={5} />
        </Card>
      </Page>
    );
  }

  const hasFailure = status.data?.jobs.some((j) => j.status === 'FAILED') ?? false;

  return (
    <Page title="Setting up your store" subtitle="This usually takes a minute or two.">
      <BlockStack gap="400">
        {hasFailure && (
          <Banner tone="warning" title="One or more ingestion steps failed">
            We'll retry automatically. If this persists, contact support from the app.
          </Banner>
        )}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                Overall progress
              </Text>
              <Text as="p" tone="subdued">
                {status.data?.overallPct ?? 0}%
              </Text>
            </InlineStack>
            <ProgressBar progress={status.data?.overallPct ?? 0} size="small" />
          </BlockStack>
        </Card>

        {(status.data?.jobs ?? []).map((j) => (
          <Card key={j.jobType}>
            <BlockStack gap="200">
              <InlineStack align="space-between">
                <Text as="h3" variant="headingSm">
                  {LABELS[j.jobType] ?? j.jobType}
                </Text>
                <Badge tone={TONE[j.status] ?? 'info'}>{j.status}</Badge>
              </InlineStack>
              <ProgressBar progress={j.status === 'DONE' ? 100 : j.progressPct} size="small" />
              {j.errorMessage && (
                <Text as="p" tone="critical">
                  {j.errorMessage}
                </Text>
              )}
            </BlockStack>
          </Card>
        ))}
      </BlockStack>
    </Page>
  );
}
