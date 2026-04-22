'use client';

import { Modal, BlockStack, Text, List, Banner, InlineStack, Badge } from '@shopify/polaris';
import { trpc } from '@/lib/trpc/client';
import { analytics } from './analytics-client';

interface Props {
  open: boolean;
  onClose: () => void;
  storeId: string;
}

export function UpgradeModal({ open, onClose, storeId }: Props): JSX.Element {
  const createCharge = trpc.billing.createCharge.useMutation();

  const handleUpgrade = async (): Promise<void> => {
    analytics.track('upgrade_cta_clicked', { storeId });
    const res = await createCharge.mutateAsync({ plan: 'GROWTH' });
    // Top-level redirect out of the embed to Shopify's confirmation screen.
    if (typeof window !== 'undefined') {
      window.top?.location.assign(res.confirmationUrl);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upgrade to Growth"
      primaryAction={{
        content: createCharge.isPending ? 'Opening Shopify billing…' : 'Start 14-day free trial',
        onAction: () => void handleUpgrade(),
        loading: createCharge.isPending,
      }}
      secondaryActions={[{ content: 'Not now', onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <InlineStack gap="200" blockAlign="center">
            <Text as="p" variant="heading2xl">
              $15
            </Text>
            <Text as="p" tone="subdued" variant="bodyMd">
              /month
            </Text>
            <Badge tone="success">14-day free trial</Badge>
          </InlineStack>

          <Text as="p">Growth unlocks:</Text>
          <List type="bullet">
            <List.Item>Every product gap (not just the top 5), with full revenue numbers.</List.Item>
            <List.Item>
              One-click synonym sync to Shopify Search &amp; Discovery — the keyword fixes section
              becomes actionable.
            </List.Item>
            <List.Item>
              Weekly digest email summarizing new gaps, fixes applied, and estimated impact.
            </List.Item>
          </List>

          {createCharge.isError && (
            <Banner tone="critical">
              Couldn&rsquo;t create charge: {createCharge.error?.message ?? 'unknown'}
            </Banner>
          )}

          <Text as="p" tone="subdued" variant="bodySm">
            Billed through Shopify. Cancel anytime from your Shopify Admin.
          </Text>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
