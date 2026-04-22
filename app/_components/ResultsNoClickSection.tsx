'use client';

import { Card, BlockStack, Text, IndexTable, Badge, Banner, Button } from '@shopify/polaris';
import { trpc } from '@/lib/trpc/client';

interface Props {
  plan: 'FREE' | 'GROWTH' | 'PRO';
  onUpgrade: () => void;
}

interface Type3Gap {
  id: string;
  queryNorm: string;
  occurrenceCount: number;
  matchedProductTitles: string[];
  locked: boolean;
}

export function ResultsNoClickSection({ plan, onUpgrade }: Props): JSX.Element {
  const query = trpc.dashboard.gaps.useQuery(
    { type: 'TYPE_3', limit: 20, offset: 0 },
    { enabled: plan !== 'FREE' },
  );

  if (plan === 'FREE') {
    return (
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            Results shown but no click
          </Text>
          <Banner tone="info">
            <Text as="p">
              These are queries where Shopify showed products but shoppers didn&rsquo;t click — a
              merchandising signal. Available on Growth.
            </Text>
          </Banner>
          <Button variant="primary" onClick={onUpgrade}>
            Upgrade to Growth
          </Button>
        </BlockStack>
      </Card>
    );
  }

  const rows = (query.data?.gaps ?? []) as Type3Gap[];

  const suggestions = ['Review product images', 'Check price against market', 'Re-order results'];

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          Results shown but no click
        </Text>
        <IndexTable
          resourceName={{ singular: 'row', plural: 'rows' }}
          itemCount={rows.length}
          loading={query.isLoading}
          headings={[
            { title: 'Query' },
            { title: 'Appearing products' },
            { title: 'Impressions' },
            { title: 'Suggestion' },
          ]}
          selectable={false}
        >
          {rows.map((r, i) => (
            <IndexTable.Row id={r.id} key={r.id} position={i}>
              <IndexTable.Cell>
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  {r.queryNorm}
                </Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="p" variant="bodySm">
                  {r.matchedProductTitles.slice(0, 3).join(', ') || '—'}
                </Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Badge tone="info">{`${r.occurrenceCount}`}</Badge>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="p" variant="bodySm">
                  {suggestions[i % suggestions.length]}
                </Text>
              </IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </IndexTable>
      </BlockStack>
    </Card>
  );
}
