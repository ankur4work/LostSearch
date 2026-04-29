'use client';

import { useEffect, useState } from 'react';
import { Card, BlockStack, Text, InlineStack, Tooltip, Button } from '@shopify/polaris';
import { QuestionCircleIcon } from '@shopify/polaris-icons';
import CountUp from 'react-countup';
import { formatMoney, formatMoneyRange } from '@/lib/money';

interface Props {
  totalCents: number;
  bandLowCents: number;
  bandHighCents: number;
  currency: string;
  gapsCount: number;
  storeId: string;
}

const ANIM_SEEN_KEY = (storeId: string): string => `sfm:hero-animated:${storeId}`;

export function RevenueHero({
  totalCents,
  bandLowCents,
  bandHighCents,
  currency,
  gapsCount,
  storeId,
}: Props): JSX.Element {
  // Animation runs only on the first mount per browser session per store; a
  // sessionStorage sentinel protects against re-animation on SPA navigation.
  const [shouldAnimate, setShouldAnimate] = useState(false);
  useEffect(() => {
    try {
      const key = ANIM_SEEN_KEY(storeId);
      if (!window.sessionStorage.getItem(key)) {
        setShouldAnimate(true);
        window.sessionStorage.setItem(key, '1');
      }
    } catch {
      /* sessionStorage may be unavailable — just skip the animation */
    }
  }, [storeId]);

  const displayDollars = totalCents / 100;

  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack gap="100" align="space-between" blockAlign="center">
          <Text as="h2" variant="headingMd">
            Search gaps your shoppers want fixed
          </Text>
          <Tooltip content="How we identify and rank gaps" dismissOnMouseOut>
            <Button
              url="/methodology"
              variant="plain"
              accessibilityLabel="Open methodology"
              icon={QuestionCircleIcon}
            />
          </Tooltip>
        </InlineStack>

        {/* PRIMARY: gap count — the real signal. Exists regardless of order history. */}
        <Text as="p" variant="heading3xl">
          <span data-testid="hero-headline" aria-live="polite">
            <strong>{gapsCount}</strong> {gapsCount === 1 ? 'gap' : 'gaps'} found
          </span>
          <span style={{ fontSize: '0.55em', color: '#6D7175', fontWeight: 400, marginLeft: 12 }}>
            in the last 30 days
          </span>
        </Text>

        <Text as="p" tone="subdued">
          {gapsCount > 0 ? (
            <>
              Real shoppers searched for things they couldn&rsquo;t find on your store. Each one
              is a sale you can recover by adding the right product or fixing a synonym.
            </>
          ) : (
            <>No gaps detected yet — sync your store or wait for more search activity.</>
          )}
        </Text>

        {/* SECONDARY: revenue context — based on category benchmark when no AOV yet. */}
        {gapsCount > 0 && (
          <div
            style={{
              marginTop: 8,
              padding: '14px 18px',
              background: '#f6f8fa',
              border: '1px solid #e1e3e5',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '0 0 auto' }}>
              <Text as="p" variant="bodySm" tone="subdued">
                Estimated monthly revenue at risk
              </Text>
              <Text as="p" variant="headingLg">
                {shouldAnimate ? (
                  <CountUp
                    end={displayDollars}
                    duration={1.2}
                    separator=","
                    decimals={0}
                    formattingFn={(n) => formatMoney(Math.round(n * 100), currency)}
                  />
                ) : (
                  <span data-testid="hero-static">{formatMoney(totalCents, currency)}</span>
                )}
                <span style={{ fontSize: '0.65em', color: '#6D7175', fontWeight: 400 }}>
                  {' '}/ month
                </span>
              </Text>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Text as="p" variant="bodySm" tone="subdued">
                Range: {formatMoneyRange(bandLowCents, bandHighCents, currency)} · Calculated as
                monthly searches × your AOV × category conversion benchmark. The dollar figure
                will sharpen as your store accrues orders.
              </Text>
            </div>
          </div>
        )}
      </BlockStack>
    </Card>
  );
}
