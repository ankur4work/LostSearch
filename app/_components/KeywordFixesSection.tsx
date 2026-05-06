'use client';

import {
  Card,
  ResourceList,
  ResourceItem,
  Text,
  BlockStack,
  InlineStack,
  Badge,
} from '@shopify/polaris';
import { trpc } from '@/lib/trpc/client';

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
  const gaps = trpc.dashboard.gaps.useQuery({ type: 'TYPE_2', limit: 20, offset: 0 });

  return (
    <Card>
      <BlockStack gap="300">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">
            Keyword fixes
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Customers searched these terms but found the wrong product. Add synonyms manually in{' '}
            <strong>Shopify Search &amp; Discovery</strong> to fix them.
          </Text>
        </BlockStack>
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
                accessibilityLabel={`${row.queryNorm} → ${target ?? 'no match'}`}
                onClick={() => { /* read-only */ }}
              >
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      {row.queryNorm}{' '}
                      <Text as="span" tone="subdued">
                        →
                      </Text>{' '}
                      <em>{target ?? '(no match)'}</em>
                    </Text>
                    <Badge tone="info">{`${Math.round(row.confidence * 100)}% match`}</Badge>
                  </BlockStack>
                </InlineStack>
              </ResourceItem>
            );
          }}
        />
      </BlockStack>
    </Card>
  );
}
