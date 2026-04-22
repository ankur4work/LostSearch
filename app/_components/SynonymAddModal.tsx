'use client';

import { Modal, BlockStack, Text, Banner } from '@shopify/polaris';

interface Row {
  queryNorm: string;
  matchedProductIds: string[];
  matchedProductTitles: string[];
}

interface Props {
  row: Row;
  onClose: () => void;
  onConfirm: (productId: string) => Promise<void>;
}

export function SynonymAddModal({ row, onClose, onConfirm }: Props): JSX.Element {
  const primaryId = row.matchedProductIds[0];
  const primaryTitle = row.matchedProductTitles[0];

  if (!primaryId || !primaryTitle) {
    return (
      <Modal open onClose={onClose} title="Cannot add synonym">
        <Modal.Section>
          <Text as="p">No matching product was found for this query.</Text>
        </Modal.Section>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add synonym to Shopify Search & Discovery"
      primaryAction={{
        content: 'Confirm & sync',
        onAction: () => void onConfirm(primaryId),
      }}
      secondaryActions={[{ content: 'Cancel', onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Text as="p">
            Add <strong>&ldquo;{row.queryNorm}&rdquo;</strong> as a synonym for{' '}
            <strong>&ldquo;{primaryTitle}&rdquo;</strong> in Shopify Search &amp; Discovery?
          </Text>
          <Banner tone="info">
            <Text as="p" variant="bodySm">
              Shoppers who search <strong>{row.queryNorm}</strong> will now also see this product.
              You can undo this for 14 days from the row menu.
            </Text>
          </Banner>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
