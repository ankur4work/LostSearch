'use client';

import { Card, BlockStack, InlineStack, Text, Badge, Button, Divider, Toast, Frame, ProgressBar } from '@shopify/polaris';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import type { Plan } from '@prisma/client';
import { trpc } from '@/lib/trpc/client';

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  accent: string;
  progressPct?: number;
}

function StatCard({ label, value, hint, accent, progressPct }: StatCardProps): JSX.Element {
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
      {typeof progressPct === 'number' && progressPct < 100 && (
        <div style={{ marginTop: 10 }}>
          <ProgressBar progress={progressPct} size="small" tone="primary" />
        </div>
      )}
    </div>
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
  onUpgrade,
}: Props): JSX.Element {
  const utils = trpc.useUtils();
  const [toast, setToast] = useState<string | null>(null);
  // Optimistic sync state: when user clicks Sync now, show progress immediately
  // (worker can finish faster than 1 poll cycle, so without this the bar never
  // renders). Cleared when real polling reports `ready`.
  const [optimisticSyncing, setOptimisticSyncing] = useState(false);
  const syncNow = trpc.ingestion.syncNow.useMutation({
    onMutate: () => {
      setOptimisticSyncing(true);
    },
    onSuccess: async () => {
      setToast('Pulling fresh data from your store…');
      // The worker is fast (parallel mutexes) but exact finish time is unknown.
      // Re-invalidate at staggered intervals so we catch the moment the
      // ingestion runs flip to DONE and `lastSyncedAt` updates in DB.
      const invalidateAll = async (): Promise<void> => {
        await Promise.all([
          utils.onboarding.status.invalidate(),
          utils.dashboard.summary.invalidate(),
          utils.dashboard.gaps.invalidate(),
        ]);
      };
      setTimeout(() => void invalidateAll(), 800);
      setTimeout(() => void invalidateAll(), 2500);
      setTimeout(() => void invalidateAll(), 5000);
      setTimeout(() => void invalidateAll(), 8000);
      setTimeout(() => void invalidateAll(), 12000);
      setTimeout(() => {
        void invalidateAll();
        setOptimisticSyncing(false);
      }, 16000);
    },
    onError: (err) => {
      setOptimisticSyncing(false);
      setToast(`Sync failed: ${err.message}`);
    },
  });
  const isSyncing = optimisticSyncing || !syncReady;
  const displayedPct = optimisticSyncing && syncReady ? 5 : syncProgressPct;
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
          value={isSyncing ? 'Syncing' : 'Active'}
          hint={isSyncing ? `${displayedPct}% complete` : `Last synced ${relative}`}
          accent={isSyncing ? '#d97706' : '#16a34a'}
          progressPct={isSyncing ? displayedPct : undefined}
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
