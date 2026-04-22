'use client';

import { useEffect, useState } from 'react';
import { Frame, Toast } from '@shopify/polaris';
import { formatMoney } from '@/lib/money';
import { trpc } from '@/lib/trpc/client';

interface Props {
  firstDashboardViewAt: Date | null;
  gapsCount: number;
  topQuery: { query: string; estimateCents: number } | null;
  currency: string;
  category: string;
}

const INDUSTRY_WORD: Record<string, string> = {
  FASHION: 'apparel',
  BEAUTY: 'beauty',
  ELECTRONICS: 'electronics',
  HOME: 'home',
  FOOD: 'grocery',
};

export function OnboardingToasts(props: Props): JSX.Element | null {
  const { firstDashboardViewAt, gapsCount, topQuery, currency, category } = props;
  const mark = trpc.dashboard.markDashboardViewed.useMutation();

  const [step, setStep] = useState<number | null>(null);
  const [eligible, setEligible] = useState<boolean | null>(null);

  useEffect(() => {
    if (firstDashboardViewAt) {
      setEligible(false);
      return;
    }
    // First-ever view: fire the mutation to persist, then sequence the toasts.
    // The mutation returns isFirstView so we're robust to re-mounts in StrictMode.
    mark.mutate(undefined, {
      onSuccess: (res) => {
        setEligible(res.isFirstView);
        if (res.isFirstView) setStep(0);
      },
      onError: () => setEligible(false),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDashboardViewAt]);

  useEffect(() => {
    if (step === null || step >= 3) return;
    const t = setTimeout(() => setStep((s) => (s === null ? null : s + 1)), 3500);
    return () => clearTimeout(t);
  }, [step]);

  if (!eligible || step === null || step >= 3) return null;

  const industry = INDUSTRY_WORD[category] ?? 'search';

  const messages: string[] = [
    `We found ${gapsCount} ${industry} search gaps in your store.`,
    topQuery
      ? `Your top gap: "${topQuery.query}" — worth ~${formatMoney(topQuery.estimateCents, currency)}/month.`
      : `Your top gaps are ranked by estimated revenue.`,
    `Click any row to see what to do about it.`,
  ];
  const current = messages[step];
  if (!current) return null;

  return (
    <Frame>
      <Toast content={current} onDismiss={() => setStep((s) => (s === null ? null : s + 1))} />
    </Frame>
  );
}
