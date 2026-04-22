'use client';

import { useEffect, useMemo, useState } from 'react';
import { Page, Layout, BlockStack, SkeletonBodyText, Card } from '@shopify/polaris';
import { trpc } from '@/lib/trpc/client';
import { RevenueHero } from './_components/RevenueHero';
import { HeaderBar } from './_components/HeaderBar';
import { ProductGapsSection } from './_components/ProductGapsSection';
import { KeywordFixesSection } from './_components/KeywordFixesSection';
import { ResultsNoClickSection } from './_components/ResultsNoClickSection';
import {
  IngestingEmpty,
  InsufficientDataEmpty,
  NoGapsFoundEmpty,
} from './_components/EmptyStates';
import { OnboardingToasts } from './_components/OnboardingToasts';
import { UpgradeModal } from './_components/UpgradeModal';
import { analytics } from './_components/analytics-client';

const MIN_MONTHLY_SEARCHES = 50;

export default function DashboardPage(): JSX.Element {
  const summary = trpc.dashboard.summary.useQuery(undefined, { refetchOnWindowFocus: false });
  const onboarding = trpc.onboarding.status.useQuery(undefined, {
    refetchInterval: (q) => (q.state.data?.ready ? false : 3000),
  });
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const openUpgrade = (): void => {
    analytics.track('upgrade_cta_clicked', { where: 'dashboard' });
    setUpgradeOpen(true);
  };

  useEffect(() => {
    if (summary.data) {
      analytics.identify(summary.data.shopDomain, {
        plan: summary.data.plan,
        category: summary.data.category,
      });
      analytics.track('dashboard_viewed', {
        plan: summary.data.plan,
        gaps: summary.data.totalClassifications,
      });
    }
  }, [summary.data]);

  // Loading shell.
  if (summary.isLoading || !summary.data) {
    return (
      <Page title="Search Failure Miner">
        <Layout>
          <Layout.Section>
            <Card>
              <SkeletonBodyText lines={5} />
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // Ingestion still running → redirect user experience: show progress card.
  const ingestionReady = onboarding.data?.ready ?? true;
  if (!ingestionReady) {
    return (
      <Page title="Search Failure Miner">
        <Layout>
          <Layout.Section>
            <IngestingEmpty progressPct={onboarding.data?.overallPct ?? 0} />
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const s = summary.data;
  const showInsufficient = s.totalMonthlySearches < MIN_MONTHLY_SEARCHES;
  const showNoGaps = !showInsufficient && s.totalClassifications === 0;

  return (
    <Page fullWidth>
      <BlockStack gap="400">
        <HeaderBar
          storeName={s.storeName}
          plan={s.plan}
          lastSyncedAt={s.lastSyncedAt}
          onUpgrade={openUpgrade}
        />

        {showInsufficient ? (
          <InsufficientDataEmpty />
        ) : showNoGaps ? (
          <NoGapsFoundEmpty />
        ) : (
          <Layout>
            <Layout.Section>
              <RevenueHero
                totalCents={s.revenueImpactCents}
                bandLowCents={s.bandLowCents}
                bandHighCents={s.bandHighCents}
                currency={s.currency}
                gapsCount={s.totalClassifications}
                storeId={s.shopDomain}
              />
            </Layout.Section>

            <Layout.Section>
              <ProductGapsSection onUpgrade={openUpgrade} />
            </Layout.Section>

            <Layout.Section>
              <KeywordFixesSection plan={s.plan} storeId={s.shopDomain} onUpgrade={openUpgrade} />
            </Layout.Section>

            <Layout.Section>
              <ResultsNoClickSection plan={s.plan} onUpgrade={openUpgrade} />
            </Layout.Section>
          </Layout>
        )}

        <OnboardingToasts
          firstDashboardViewAt={s.firstDashboardViewAt}
          gapsCount={s.totalClassifications}
          topQuery={s.topQuery}
          currency={s.currency}
          category={s.category}
        />

        <UpgradeModal
          open={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          storeId={s.shopDomain}
        />
      </BlockStack>
    </Page>
  );
}
