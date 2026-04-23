'use client';

import { Modal, BlockStack, Text, InlineStack, Link, Divider, Box } from '@shopify/polaris';
import { formatMoney } from '@/lib/money';
import { trpc } from '@/lib/trpc/client';

interface GapLite {
  queryNorm: string;
  estimateCents: number | null;
  bandLowCents: number | null;
  bandHighCents: number | null;
  occurrenceCount: number;
  matchedProductTitles: string[];
  reasoning: unknown;
}

interface Props {
  open: boolean;
  gap: GapLite;
  currency: string;
  onClose: () => void;
}

/** Sourcing deep-links per PRD §21.9 — pre-filled search on each marketplace. */
function sourcingLinks(query: string): Array<{ label: string; href: string }> {
  const q = encodeURIComponent(query);
  return [
    { label: 'Faire', href: `https://www.faire.com/search?query=${q}` },
    { label: 'AliExpress', href: `https://www.aliexpress.com/wholesale?SearchText=${q}` },
    { label: 'Alibaba', href: `https://www.alibaba.com/trade/search?SearchText=${q}` },
  ];
}

export function GapDetailModal({ open, gap, currency, onClose }: Props): JSX.Element {
  const trend = trpc.dashboard.trend.useQuery(
    { queryNormalized: gap.queryNorm },
    { enabled: open, staleTime: 60_000 },
  );

  return (
    <Modal open={open} onClose={onClose} title={`"${gap.queryNorm}"`}>
      <Modal.Section>
        <BlockStack gap="400">
          <InlineStack gap="800">
            <BlockStack gap="050">
              <Text as="p" tone="subdued" variant="bodySm">
                Estimated revenue
              </Text>
              <Text as="p" variant="headingLg">
                {gap.estimateCents != null ? formatMoney(gap.estimateCents, currency) : '—'}/mo
              </Text>
              {gap.bandLowCents != null && gap.bandHighCents != null && (
                <Text as="p" tone="subdued" variant="bodySm">
                  {formatMoney(gap.bandLowCents, currency)} – {formatMoney(gap.bandHighCents, currency)}
                </Text>
              )}
            </BlockStack>
            <BlockStack gap="050">
              <Text as="p" tone="subdued" variant="bodySm">
                Searches last 30 days
              </Text>
              <Text as="p" variant="headingLg">
                {gap.occurrenceCount}
              </Text>
            </BlockStack>
          </InlineStack>

          <Divider />

          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Why we classified this
            </Text>
            <Box
              padding="300"
              background="bg-surface-secondary"
              borderRadius="200"
            >
              <pre
                style={{
                  margin: 0,
                  fontSize: 12,
                  lineHeight: 1.5,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {JSON.stringify(gap.reasoning ?? {}, null, 2)}
              </pre>
            </Box>
          </BlockStack>

          <Divider />

          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              30-day trend
            </Text>
            <Sparkline data={(trend.data ?? []).map((d) => d.count)} />
          </BlockStack>

          <Divider />

          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Sourcing ideas
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Pre-filled searches on common B2B and DTC marketplaces.
            </Text>
            <InlineStack gap="400">
              {sourcingLinks(gap.queryNorm).map((l) => (
                <Link key={l.label} url={l.href} external removeUnderline>
                  {l.label} ↗
                </Link>
              ))}
            </InlineStack>
          </BlockStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function Sparkline({ data }: { data: number[] }): JSX.Element {
  if (data.length === 0) {
    return (
      <Text as="p" tone="subdued" variant="bodySm">
        Not enough data to plot.
      </Text>
    );
  }
  const max = Math.max(...data, 1);
  const w = 280;
  const h = 40;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const path = data
    .map((v, i) => {
      const x = i * step;
      const y = h - (v / max) * h;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} role="img" aria-label={`Trend sparkline, ${data.length} days`}>
      <path d={path} fill="none" stroke="#008060" strokeWidth={2} />
    </svg>
  );
}
