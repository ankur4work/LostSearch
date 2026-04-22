'use client';

import { useState } from 'react';
import {
  Card,
  ResourceList,
  ResourceItem,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  Banner,
  Popover,
  ActionList,
} from '@shopify/polaris';
import { trpc } from '@/lib/trpc/client';
import { SynonymAddModal } from './SynonymAddModal';
import { analytics } from './analytics-client';

interface Props {
  plan: 'FREE' | 'GROWTH' | 'PRO';
  storeId: string;
  onUpgrade: () => void;
}

interface Type2Gap {
  id: string;
  queryNorm: string;
  confidence: number;
  matchedProductIds: string[];
  matchedProductTitles: string[];
  locked: boolean;
}

export function KeywordFixesSection({ plan, storeId, onUpgrade }: Props): JSX.Element {
  const utils = trpc.useUtils();
  const gaps = trpc.dashboard.gaps.useQuery({ type: 'TYPE_2', limit: 20, offset: 0 });
  const applied = trpc.synonyms.appliedThisWeek.useQuery();
  const [activeRow, setActiveRow] = useState<Type2Gap | null>(null);
  const [overflowFor, setOverflowFor] = useState<string | null>(null);

  const apply = trpc.synonyms.apply.useMutation({
    onSuccess: () => {
      utils.dashboard.gaps.invalidate();
      utils.synonyms.appliedThisWeek.invalidate();
    },
  });
  const undo = trpc.synonyms.undo.useMutation({
    onSuccess: () => {
      utils.dashboard.gaps.invalidate();
      utils.synonyms.appliedThisWeek.invalidate();
    },
  });

  if (plan === 'FREE') {
    return (
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            Keyword fixes
          </Text>
          <Banner tone="info">
            <Text as="p">
              One-click synonym sync is a Growth feature. Upgrade to push fixes into Shopify
              Search &amp; Discovery with a single click.
            </Text>
          </Banner>
          <InlineStack>
            <Button variant="primary" onClick={onUpgrade}>
              Upgrade to Growth
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          Keyword fixes
        </Text>
        {apply.isError && (
          <Banner tone="critical" onDismiss={() => apply.reset()}>
            Sync failed: {apply.error?.message ?? 'unknown error'}
          </Banner>
        )}
        <ResourceList
          resourceName={{ singular: 'fix', plural: 'fixes' }}
          items={(gaps.data?.gaps ?? []) as Type2Gap[]}
          loading={gaps.isLoading}
          renderItem={(item) => {
            const row = item as Type2Gap;
            const target = row.matchedProductTitles[0];
            return (
              <ResourceItem
                id={row.id}
                accessibilityLabel={`Add synonym for ${row.queryNorm}`}
                onClick={() => {
                  /* handled by per-row button */
                }}
              >
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      {row.queryNorm} <Text as="span" tone="subdued">→</Text>{' '}
                      <em>{target ?? '(no match)'}</em>
                    </Text>
                    <InlineStack gap="200">
                      <Badge tone="info">
                        {`${Math.round(row.confidence * 100)}% match`}
                      </Badge>
                    </InlineStack>
                  </BlockStack>
                  <InlineStack gap="200">
                    <Button
                      onClick={() => {
                        analytics.track('gap_row_clicked', { storeId, type: 'TYPE_2', queryNorm: row.queryNorm });
                        setActiveRow(row);
                      }}
                      disabled={!target}
                    >
                      Add synonym
                    </Button>
                  </InlineStack>
                </InlineStack>
              </ResourceItem>
            );
          }}
        />

        {applied.data && applied.data.length > 0 && (
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Applied this week
            </Text>
            {applied.data.map((a) => (
              <InlineStack key={a.id} align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm">
                  ✓ &ldquo;{a.query}&rdquo; → <em>{a.productTitle ?? 'product'}</em>
                </Text>
                <Popover
                  active={overflowFor === a.id}
                  onClose={() => setOverflowFor(null)}
                  activator={
                    <Button
                      variant="plain"
                      onClick={() => setOverflowFor(overflowFor === a.id ? null : a.id)}
                      accessibilityLabel="More actions"
                    >
                      ⋯
                    </Button>
                  }
                >
                  <ActionList
                    items={[
                      {
                        content: 'Undo (14 days)',
                        onAction: async () => {
                          setOverflowFor(null);
                          await undo.mutateAsync({ synonymAppliedId: a.id });
                        },
                      },
                    ]}
                  />
                </Popover>
              </InlineStack>
            ))}
          </BlockStack>
        )}

        {activeRow && (
          <SynonymAddModal
            row={activeRow}
            onClose={() => setActiveRow(null)}
            onConfirm={async (productId) => {
              await apply.mutateAsync({
                classificationId: activeRow.id,
                query: activeRow.queryNorm,
                productId,
              });
              analytics.track('synonym_added', { storeId, queryNorm: activeRow.queryNorm });
              setActiveRow(null);
            }}
          />
        )}
      </BlockStack>
    </Card>
  );
}
