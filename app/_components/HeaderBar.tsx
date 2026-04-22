'use client';

import { Card, InlineStack, BlockStack, Text, Badge, Button } from '@shopify/polaris';
import type { Plan } from '@prisma/client';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  storeName: string;
  plan: Plan;
  lastSyncedAt: Date | null;
  onUpgrade: () => void;
}

const PLAN_TONE: Record<Plan, 'info' | 'success' | 'attention'> = {
  FREE: 'info',
  GROWTH: 'success',
  PRO: 'attention',
};

export function HeaderBar({ storeName, plan, lastSyncedAt, onUpgrade }: Props): JSX.Element {
  const relative = lastSyncedAt ? formatDistanceToNow(lastSyncedAt, { addSuffix: true }) : 'never';

  return (
    <Card>
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="050">
          <Text as="h1" variant="headingLg">
            {storeName}
          </Text>
          <Text as="p" tone="subdued" variant="bodySm">
            Last synced {relative}
          </Text>
        </BlockStack>
        <InlineStack gap="200" blockAlign="center">
          <Badge tone={PLAN_TONE[plan]}>{plan}</Badge>
          {plan === 'FREE' && (
            <Button variant="primary" onClick={onUpgrade} accessibilityLabel="Upgrade plan">
              Upgrade
            </Button>
          )}
        </InlineStack>
      </InlineStack>
    </Card>
  );
}
