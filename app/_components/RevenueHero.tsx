'use client';

import { useEffect, useState } from 'react';
import { Card, BlockStack, Text, InlineStack, Icon, Tooltip, Button } from '@shopify/polaris';
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
            Revenue left on the table
          </Text>
          <Tooltip content="How we compute this" dismissOnMouseOut>
            <Button
              url="/methodology"
              variant="plain"
              accessibilityLabel="Open methodology"
              icon={QuestionCircleIcon}
            />
          </Tooltip>
        </InlineStack>

        <Text as="p" variant="heading3xl">
          <span data-testid="hero-headline" aria-live="polite">
            You&rsquo;re missing{' '}
            {shouldAnimate ? (
              <CountUp
                end={displayDollars}
                duration={1.2}
                separator=","
                prefix={new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency,
                  maximumFractionDigits: 0,
                })
                  .format(0)
                  .replace(/0/g, '')}
                decimals={0}
                formattingFn={(n) => formatMoney(Math.round(n * 100), currency)}
              />
            ) : (
              <span data-testid="hero-static">{formatMoney(totalCents, currency)}</span>
            )}
            <span style={{ fontSize: '0.7em', color: '#6D7175', fontWeight: 400 }}>/month</span>
          </span>
        </Text>

        <Text as="p" tone="subdued">
          Across {gapsCount} classified search gaps in the last 30 days.{' '}
          <span style={{ color: '#6D7175' }}>
            ({formatMoneyRange(bandLowCents, bandHighCents, currency)} confidence band)
          </span>
        </Text>
      </BlockStack>
    </Card>
  );
}
