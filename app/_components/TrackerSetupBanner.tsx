'use client';

import { Banner, BlockStack, Text, InlineStack, Button } from '@shopify/polaris';

interface Props {
  shopDomain: string;
}

/**
 * Action-required banner shown until storefront searches start arriving. Deep
 * links straight to the theme editor's App embeds tab so the merchant only
 * needs to flip one toggle for LostSearch to start collecting data.
 */
export function TrackerSetupBanner({ shopDomain }: Props): JSX.Element {
  const themeEditorUrl = `https://${shopDomain}/admin/themes/current/editor?context=apps`;

  return (
    <Banner tone="warning" title="One last step — enable the storefront tracker">
      <BlockStack gap="200">
        <Text as="p" variant="bodyMd">
          LostSearch is connected, but no shopper searches have been captured yet because the
          tracker isn&rsquo;t turned on in your theme. It takes about 10 seconds to enable —
          one toggle, no code.
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          1. Click &ldquo;Open theme editor&rdquo; below. 2. In the theme editor sidebar, find
          <strong> App embeds</strong> (puzzle-piece icon). 3. Toggle{' '}
          <strong>LostSearch Tracker</strong> ON. 4. Click <strong>Save</strong> at the top.
          Done.
        </Text>
        <InlineStack gap="200">
          <Button
            variant="primary"
            url={themeEditorUrl}
            external
            target="_top"
          >
            Open theme editor
          </Button>
          <Button
            url="/methodology"
          >
            What does it track?
          </Button>
        </InlineStack>
      </BlockStack>
    </Banner>
  );
}
