'use client';

import { Card, BlockStack, InlineStack, Text, Badge, Button, Toast, Frame, ProgressBar, Banner } from '@shopify/polaris';
import { formatDistanceToNow } from 'date-fns';
import { useState, useRef, useEffect } from 'react';
import type { Plan } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  accent: string;
}

function StatCard({ label, value, hint, accent }: StatCardProps): JSX.Element {
  return (
    <div
      style={{
        flex: '1 1 220px',
        minWidth: 220,
        background: '#fff',
        border: '1px solid #e1e3e5',
        borderLeft: `4px solid ${accent}`,
        borderRadius: 12,
        padding: '20px 24px',
        boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.6, color: '#6d7175' }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: accent, marginTop: 6, lineHeight: 1.2 }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 14, color: '#6d7175', marginTop: 6 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

interface SyncJob {
  jobType: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  progressPct: number;
  progressTotal: number | null;
  progressDone: number | null;
  errorMessage: string | null;
  startedAt: Date | null;
}

const JOB_LABELS: Record<string, string> = {
  INGEST_PRODUCTS: 'Products',
  INGEST_ORDERS: 'Orders',
  INGEST_SEARCH: 'Search analytics',
};

function SyncProgressPanel({
  jobs,
  overallPct,
  hasError,
  syncStartedAt,
}: {
  jobs: SyncJob[];
  overallPct: number;
  hasError: boolean;
  syncStartedAt: number | null;
}): JSX.Element {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h3" variant="headingMd">
            {hasError ? 'Sync completed with errors' : 'Syncing your store…'}
          </Text>
          {!hasError && (
            <Text as="span" variant="bodySm" tone="subdued">
              {overallPct}%
            </Text>
          )}
        </InlineStack>

        {!hasError && (
          <ProgressBar progress={overallPct} size="small" tone="primary" animated />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {jobs.map((job) => {
            // If the run started before the current sync was triggered, treat it
            // as stale and show pending until a fresh run appears.
            const isStale =
              syncStartedAt !== null &&
              job.startedAt !== null &&
              new Date(job.startedAt).getTime() < syncStartedAt;

            const effectiveStatus = isStale ? 'PENDING' : job.status;
            const effectivePct = isStale ? 0 : job.progressPct;

            const icon =
              effectiveStatus === 'DONE'
                ? '✓'
                : effectiveStatus === 'FAILED'
                  ? '✗'
                  : effectiveStatus === 'RUNNING'
                    ? '↻'
                    : '○';

            const color =
              effectiveStatus === 'DONE'
                ? '#16a34a'
                : effectiveStatus === 'FAILED'
                  ? '#dc2626'
                  : effectiveStatus === 'RUNNING'
                    ? '#2563eb'
                    : '#6d7175';

            return (
              <div key={job.jobType}>
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <span style={{ color, fontWeight: 700, fontSize: 14, width: 16, textAlign: 'center' }}>
                      {icon}
                    </span>
                    <Text as="span" variant="bodySm">
                      {JOB_LABELS[job.jobType] ?? job.jobType}
                    </Text>
                  </InlineStack>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {effectiveStatus === 'DONE'
                      ? 'Done'
                      : effectiveStatus === 'FAILED'
                        ? 'Failed'
                        : effectiveStatus === 'RUNNING'
                          ? `${effectivePct}%`
                          : 'Waiting…'}
                  </Text>
                </InlineStack>
                {effectiveStatus === 'RUNNING' && job.jobType === 'INGEST_PRODUCTS' && (
                  <div style={{ marginTop: 4, paddingLeft: 24 }}>
                    <ProgressBar progress={effectivePct} size="small" tone="primary" animated />
                    {job.progressTotal !== null && job.progressDone !== null && (
                      <Text as="span" variant="bodySm" tone="subdued">
                        {job.progressDone.toLocaleString()} / {job.progressTotal.toLocaleString()} products synced
                      </Text>
                    )}
                  </div>
                )}
                {effectiveStatus === 'FAILED' && job.errorMessage && (
                  <div style={{ paddingLeft: 24, marginTop: 4 }}>
                    <Text as="span" variant="bodySm" tone="critical">
                      {job.errorMessage}
                    </Text>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </BlockStack>
    </Card>
  );
}

interface Props {
  storeName: string;
  plan: Plan;
  lastSyncedAt: Date | null;
  totalQueries: number;
  totalGaps: number;
  revenueImpactCents: number;
  currency: string;
  syncReady: boolean;
  syncProgressPct: number;
  syncJobs: SyncJob[];
  hasError: boolean;
  onUpgrade: () => void;
}

export function DashboardOverview({
  storeName,
  plan,
  lastSyncedAt,
  totalQueries,
  totalGaps,
  revenueImpactCents,
  currency,
  syncReady,
  syncProgressPct,
  syncJobs,
  hasError,
  onUpgrade,
}: Props): JSX.Element {
  const utils = trpc.useUtils();
  const [toast, setToast] = useState<string | null>(null);
  // Timestamp of the last "Sync now" click — used to detect stale runs that
  // predate this sync session and show 0% until fresh runs appear.
  const syncStartedAtRef = useRef<number | null>(null);
  const [syncStartedAt, setSyncStartedAt] = useState<number | null>(null);

  const syncNow = trpc.ingestion.syncNow.useMutation({
    onMutate: () => {
      const now = Date.now();
      syncStartedAtRef.current = now;
      setSyncStartedAt(now);
    },
    onSuccess: async () => {
      setToast('Pulling fresh data from your store…');
      const invalidateAll = async (): Promise<void> => {
        await Promise.all([
          utils.onboarding.status.invalidate(),
          utils.dashboard.summary.invalidate(),
          utils.dashboard.gaps.invalidate(),
        ]);
      };
      // Staggered invalidation — catches the moment jobs flip to DONE.
      for (const delay of [800, 2500, 5000, 8000, 12000, 18000, 25000]) {
        setTimeout(() => void invalidateAll(), delay);
      }
    },
    onError: (err) => {
      setSyncStartedAt(null);
      setToast(`Sync failed: ${err.message}`);
    },
  });

  // Clear syncStartedAt once fresh runs (created after the click) appear for all jobs.
  useEffect(() => {
    if (syncStartedAt === null || syncJobs.length === 0) return;
    const allFresh = syncJobs.every(
      (j) => j.startedAt !== null && new Date(j.startedAt).getTime() >= syncStartedAt,
    );
    if (allFresh) setSyncStartedAt(null);
  }, [syncJobs, syncStartedAt]);

  const isSyncing = !syncReady || syncNow.isPending || syncStartedAt !== null;
  const relative = lastSyncedAt ? formatDistanceToNow(lastSyncedAt, { addSuffix: true }) : 'never';
  const formatMoney = (cents: number): string => {
    const fmt = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    });
    return fmt.format(cents / 100);
  };
  const planTone: Record<Plan, 'info' | 'success' | 'attention'> = {
    FREE: 'info',
    GROWTH: 'success',
    PRO: 'attention',
  };

  const statusAccent = syncReady ? '#16a34a' : '#d97706';
  const planAccent = '#2563eb';
  const queriesAccent = '#0ea5e9';
  const revenueAccent = revenueImpactCents > 0 ? '#dc2626' : '#6d7175';

  return (
    <BlockStack gap="500">
      {/* HEADER */}
      <Card>
        <InlineStack align="space-between" blockAlign="center" wrap={false}>
          <InlineStack gap="300" blockAlign="center">
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              LS
            </div>
            <BlockStack gap="050">
              <Text as="h1" variant="headingXl">
                LostSearch Dashboard
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Recover revenue from failed shopper searches on {storeName}
              </Text>
            </BlockStack>
          </InlineStack>
          <InlineStack gap="200" blockAlign="center">
            <Badge tone={planTone[plan]}>{plan}</Badge>
            <Button
              loading={syncNow.isPending}
              onClick={() => syncNow.mutate()}
            >
              {syncNow.isPending ? 'Syncing…' : 'Sync now'}
            </Button>
            {plan === 'FREE' && (
              <Button variant="primary" onClick={onUpgrade}>
                Upgrade
              </Button>
            )}
          </InlineStack>
        </InlineStack>
      </Card>

      {/* SYNC PROGRESS PANEL — visible while a sync is in flight or has errors */}
      {(isSyncing || hasError) && syncJobs.length > 0 && (
        <SyncProgressPanel
          jobs={syncJobs}
          overallPct={syncStartedAt !== null ? 0 : syncProgressPct}
          hasError={hasError}
          syncStartedAt={syncStartedAt}
        />
      )}

      {/* STAT CARDS ROW */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <StatCard
          label="Plan"
          value={plan}
          hint={plan === 'FREE' ? 'Top 5 gaps visible' : 'Full coverage'}
          accent={planAccent}
        />
        <StatCard
          label="Status"
          value={isSyncing ? 'Syncing' : hasError ? 'Error' : 'Active'}
          hint={
            isSyncing
              ? `${syncProgressPct}% complete`
              : hasError
                ? 'Sync error — see details above'
                : `Last synced ${relative}`
          }
          accent={isSyncing ? '#d97706' : hasError ? '#dc2626' : '#16a34a'}
        />
        <StatCard
          label="Searches tracked"
          value={totalQueries.toLocaleString()}
          hint={syncReady ? 'Last 30 days' : 'Collecting…'}
          accent={queriesAccent}
        />
        <StatCard
          label="Revenue at risk"
          value={revenueImpactCents > 0 ? formatMoney(revenueImpactCents) : '—'}
          hint={`${totalGaps} gaps identified`}
          accent={revenueAccent}
        />
      </div>

      {/* PLAN CTA — full comparison lives on /pricing */}
      {plan === 'FREE' && (
        <Card>
          <InlineStack align="space-between" blockAlign="center" wrap={false} gap="400">
            <BlockStack gap="100">
              <Text as="h3" variant="headingMd">
                See the full picture
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Free shows your top 5 gaps. Growth unlocks every gap with $ revenue estimates and
                1-click synonym sync. $9/mo, 14-day free trial.
              </Text>
            </BlockStack>
            <InlineStack gap="200">
              <a
                href="/pricing"
                style={{
                  textDecoration: 'none',
                  color: '#2563eb',
                  fontWeight: 600,
                  fontSize: 14,
                  whiteSpace: 'nowrap',
                }}
              >
                Compare plans
              </a>
              <Button variant="primary" onClick={onUpgrade}>
                Upgrade
              </Button>
            </InlineStack>
          </InlineStack>
        </Card>
      )}

      {toast && (
        <Frame>
          <Toast content={toast} onDismiss={() => setToast(null)} duration={3500} />
        </Frame>
      )}
    </BlockStack>
  );
}
