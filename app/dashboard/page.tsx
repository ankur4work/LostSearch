'use client';

import { useEffect, useState } from 'react';
import { Page, Layout, BlockStack, SkeletonBodyText, Card } from '@shopify/polaris';
import { trpc } from '@/lib/trpc/client';
import { useTrpcAuth } from '@/lib/trpc/provider';
import { RevenueHero } from '../_components/RevenueHero';
import { DashboardOverview } from '../_components/DashboardOverview';
import { ProductGapsSection } from '../_components/ProductGapsSection';
import { KeywordFixesSection } from '../_components/KeywordFixesSection';
import { ResultsNoClickSection } from '../_components/ResultsNoClickSection';
import {
  InsufficientDataEmpty,
  NoGapsFoundEmpty,
} from '../_components/EmptyStates';
import { OnboardingToasts } from '../_components/OnboardingToasts';
import { TrackerSetupBanner } from '../_components/TrackerSetupBanner';
import { UpgradeModal } from '../_components/UpgradeModal';
import { analytics } from '../_components/analytics-client';

const MIN_MONTHLY_SEARCHES = 10;

export default function DashboardPage(): JSX.Element {
  const auth = useTrpcAuth();
  const onboarding = trpc.onboarding.status.useQuery(undefined, {
    enabled: auth.ready,
    refetchInterval: (q) => (q.state.data?.ready ? false : 3000),
  });
  const summary = trpc.dashboard.summary.useQuery(undefined, {
    enabled: auth.ready,
    refetchOnWindowFocus: false,
    refetchInterval: () => (onboarding.data?.ready === false ? 3000 : false),
  });
  const trackerQ = trpc.dashboard.trackerStatus.useQuery(undefined, {
    enabled: auth.ready,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
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

  if (!auth.ready || summary.isLoading || !summary.data) {
    return (
      <Page title="Dashboard">
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

  const ingestionReady = onboarding.data?.ready ?? true;
  const ingestPct = onboarding.data?.overallPct ?? 0;

  const s = summary.data;
  const showInsufficient = s.totalMonthlySearches < MIN_MONTHLY_SEARCHES;
  const showNoGaps = !showInsufficient && s.totalClassifications === 0;

  const totalQueries = s.totalMonthlySearches ?? 0;
  const hasGaps = !showInsufficient && !showNoGaps;

  return (
    <Page fullWidth>
      <BlockStack gap="500">
        <DashboardOverview
          storeName={s.storeName}
          plan={s.plan}
          lastSyncedAt={s.lastSyncedAt}
          totalQueries={totalQueries}
          totalGaps={s.totalClassifications}
          revenueImpactCents={s.revenueImpactCents}
          currency={s.currency}
          syncReady={ingestionReady}
          syncProgressPct={ingestPct}
          onUpgrade={openUpgrade}
        />

        {ingestionReady && totalQueries === 0 && trackerQ.data?.enabled === false && (
          <TrackerSetupBanner shopDomain={s.shopDomain} />
        )}

        {showInsufficient && <InsufficientDataEmpty />}
        {showNoGaps && <NoGapsFoundEmpty />}

        {hasGaps && (
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
