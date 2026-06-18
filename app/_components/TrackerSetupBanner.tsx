'use client';

import { Banner, BlockStack, Text, InlineStack, Button } from '@shopify/polaris';

interface Props {
  shopDomain: string;
  /** Whether the optional theme app embed is enabled (null = couldn't tell). */
  embedEnabled: boolean | null;
}

/**
 * Honest "waiting for first searches" state. Tracking is auto-enabled at
 * install via a ScriptTag (see lib/shopify/script-tag.ts), so this is NOT an
 * "action required" blocker — searches are already being captured. We just
 * haven't seen one yet. We tell the merchant to run a test search and, only as
 * an optional fallback (e.g. a theme that strips injected scripts), offer the
 * one-toggle theme app embed.
 */
export function TrackerSetupBanner({ shopDomain, embedEnabled }: Props): JSX.Element {
  const themeEditorUrl = `https://${shopDomain}/admin/themes/current/editor?context=apps`;

  return (
    <Banner tone="info" title="Tracking is live — waiting for your first search">
      <BlockStack gap="200">
        <Text as="p" variant="bodyMd">
          DemandRadar is connected and automatically tracking storefront searches. We haven&rsquo;t
          captured any yet. Run a search on your storefront (try a term you don&rsquo;t sell) and it
          will appear here within a minute or two.
        </Text>
        {embedEnabled !== true && (
          <Text as="p" variant="bodySm" tone="subdued">
            Not seeing data after a test search? Some themes strip injected scripts. As a backup you
            can enable the theme app embed: open the theme editor, find <strong>App embeds</strong>{' '}
            (puzzle-piece icon), toggle <strong>DemandRadar Tracker</strong> ON, then{' '}
            <strong>Save</strong>.
          </Text>
        )}
        <InlineStack gap="200">
          <Button url={`https://${shopDomain}`} external target="_top">
            Open storefront
          </Button>
          {embedEnabled !== true && (
            <Button url={themeEditorUrl} external target="_top">
              Open theme editor
            </Button>
          )}
          <Button url="/methodology">What does it track?</Button>
        </InlineStack>
      </BlockStack>
    </Banner>
  );
}
