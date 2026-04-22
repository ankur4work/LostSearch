'use client';

import { useMemo, useState } from 'react';
import {
  Card,
  ResourceList,
  ResourceItem,
  Text,
  Badge,
  InlineStack,
  BlockStack,
  Button,
} from '@shopify/polaris';
import { formatMoney, labelForBucket, type RevenueBucket } from '@/lib/money';
import { GapDetailModal } from './GapDetailModal';
import { trpc } from '@/lib/trpc/client';

interface Props {
  onUpgrade: () => void;
}

interface GapRow {
  id: string;
  queryNorm: string;
  type: 'TYPE_1' | 'TYPE_2' | 'TYPE_3' | 'TYPE_4' | 'UNCAT';
  confidence: number;
  occurrenceCount: number;
  matchedProductIds: string[];
  matchedProductTitles: string[];
  lowVolume: boolean;
  locked: boolean;
  estimateCents: number | null;
  bandLowCents: number | null;
  bandHighCents: number | null;
  revenueBucket: RevenueBucket | null;
  reasoning: unknown;
}

function confidenceTag(conf: number): { label: string; tone: 'success' | 'attention' | 'info' } {
  if (conf >= 0.8) return { label: 'High', tone: 'success' };
  if (conf >= 0.5) return { label: 'Medium', tone: 'attention' };
  return { label: 'Low', tone: 'info' };
}

export function ProductGapsSection({ onUpgrade }: Props): JSX.Element {
  const gapsQuery = trpc.dashboard.gaps.useQuery({ type: 'TYPE_1', limit: 10, offset: 0 });
  const [selected, setSelected] = useState<GapRow | null>(null);

  const rows = useMemo(() => (gapsQuery.data?.gaps ?? []) as GapRow[], [gapsQuery.data]);
  const lockedCount = gapsQuery.data?.lockedCount ?? 0;
  const lockedSumCents = gapsQuery.data?.lockedRevenueSumCents ?? 0;
  const currency = 'USD'; // passed from parent via context in a real wiring; kept here for now
  const plan = gapsQuery.data?.plan ?? 'FREE';

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingMd">
            Product gaps
          </Text>
          <Text as="p" tone="subdued" variant="bodySm">
            Demand with no matching product in your catalog
          </Text>
        </InlineStack>

        <ResourceList
          resourceName={{ singular: 'gap', plural: 'gaps' }}
          items={rows}
          loading={gapsQuery.isLoading}
          renderItem={(item) => {
            const row = item as GapRow;
            const conf = confidenceTag(row.confidence);
            return (
              <ResourceItem
                id={row.id}
                accessibilityLabel={`View gap ${row.queryNorm}`}
                onClick={() => !row.locked && setSelected(row)}
              >
                <div
                  style={
                    row.locked
                      ? {
                          filter: 'blur(4px)',
                          userSelect: 'none',
                          pointerEvents: 'none',
                          // DOM-level redaction: screen readers announce the
                          // locked copy; real revenue never lands in the DOM
                          // as readable digits.
                        }
                      : {}
                  }
                  aria-hidden={row.locked}
                  data-testid={row.locked ? 'gap-row-locked' : 'gap-row-visible'}
                >
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd" fontWeight="bold">
                        {row.locked ? '••••••••••••' : row.queryNorm}
                      </Text>
                      <InlineStack gap="200">
                        <Badge tone="info">{`${row.occurrenceCount}/mo`}</Badge>
                        <Badge tone={conf.tone}>{conf.label}</Badge>
                        {row.locked && row.revenueBucket && (
                          <Badge tone="attention">
                            {labelForBucket(row.revenueBucket, currency)}
                          </Badge>
                        )}
                      </InlineStack>
                    </BlockStack>
                    <Text as="p" variant="headingSm" fontWeight="semibold" alignment="end">
                      {row.locked
                        ? '$•••.••'
                        : formatMoney(row.estimateCents ?? 0, currency)}
                    </Text>
                  </InlineStack>
                </div>
              </ResourceItem>
            );
          }}
        />

        {plan === 'FREE' && lockedCount > 0 && (
          <Card background="bg-surface-secondary">
            <BlockStack gap="200">
              <Text as="p" variant="headingSm">
                Unlock to see all {lockedCount + rows.filter((r) => !r.locked).length} gaps worth{' '}
                {formatMoney(lockedSumCents, currency)}+
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Upgrade to Growth to see every gap, add synonyms, and turn on the weekly digest.
              </Text>
              <InlineStack>
                <Button variant="primary" onClick={onUpgrade}>
                  Upgrade to Growth
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {selected && (
          <GapDetailModal
            open={!!selected}
            gap={selected}
            currency={currency}
            onClose={() => setSelected(null)}
          />
        )}
      </BlockStack>
    </Card>
  );
}
