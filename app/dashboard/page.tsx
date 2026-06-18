'use client';

import { useEffect, useRef, useState } from 'react';
import { Page, Layout, BlockStack, SkeletonBodyText, Card } from '@shopify/polaris';
import { trpc } from '@/lib/trpc/client';
import { useTrpcAuth } from '@/lib/trpc/provider';
import { RevenueHero } from '../_components/RevenueHero';
import { DashboardOverview } from '../_components/DashboardOverview';
import { ProductGapsSection } from '../_components/ProductGapsSection';
import { KeywordFixesSection } from '../_components/KeywordFixesSection';
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
  const utils = trpc.useUtils();
  // Timestamp when sync flipped to ready — used to keep polling summary for
  // a bit after completion so we catch the classify job finishing (~30-60s later).
  const [syncCompletedAt, setSyncCompletedAt] = useState<number | null>(null);
  const [syncInitiatedAt, setSyncInitiatedAt] = useState<number | null>(null);

  const onboarding = trpc.onboarding.status.useQuery(undefined, {
    enabled: auth.ready,
    refetchInterval: (q) => {
      if (!q.state.data?.ready) return 3000;
      // Keep polling for 3 minutes after a manual sync so new job records
      // appear in the panel instead of the old stale ones.
      if (syncInitiatedAt !== null && Date.now() - syncInitiatedAt < 3 * 60 * 1000) return 3000;
      return false;
    },
  });
  const summary = trpc.dashboard.summary.useQuery(undefined, {
    enabled: auth.ready,
    refetchOnWindowFocus: false,
    refetchInterval: () => {
      if (onboarding.data?.ready === false) return 3000;
      // Keep polling for 2 minutes after sync completes to catch classify.
      if (syncCompletedAt !== null && Date.now() - syncCompletedAt < 2 * 60 * 1000) return 8000;
      return false;
    },
  });

  // When onboarding flips from in-progress → ready, record the time and
  // immediately invalidate so the first fresh fetch happens right away.
  const prevReady = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    const ready = onboarding.data?.ready;
    if (prevReady.current === false && ready === true) {
      setSyncCompletedAt(Date.now());
      void utils.dashboard.summary.invalidate();
      void utils.dashboard.gaps.invalidate();
    }
    prevReady.current = ready;
  }, [onboarding.data?.ready, utils]);
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
  const ingestJobs = onboarding.data?.jobs ?? [];
  const ingestHasError = onboarding.data?.hasError ?? false;

  const s = summary.data;
  const totalQueries = s.totalMonthlySearches ?? 0;
  // True zero state: ingestion finished but the tracker hasn't captured a
  // single search yet. Show an honest "waiting for first search" banner rather
  // than the generic "collecting" card, so the merchant knows to run a search.
  const isWaitingForFirstSearch = ingestionReady && totalQueries === 0;
  const showInsufficient =
    !isWaitingForFirstSearch && s.totalMonthlySearches < MIN_MONTHLY_SEARCHES;
  const showNoGaps =
    !isWaitingForFirstSearch && !showInsufficient && s.totalClassifications === 0;

  const hasGaps = !isWaitingForFirstSearch && !showInsufficient && !showNoGaps;

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
          syncJobs={ingestJobs}
          hasError={ingestHasError}
          onUpgrade={openUpgrade}
          onSyncStarted={() => setSyncInitiatedAt(Date.now())}
        />

        {isWaitingForFirstSearch && (
          <TrackerSetupBanner
            shopDomain={s.shopDomain}
            embedEnabled={trackerQ.data?.enabled ?? null}
          />
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
