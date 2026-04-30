'use client';

import { useEffect, useState, useCallback } from 'react';
import { Page, BlockStack, Card, Text, Button, Divider } from '@shopify/polaris';
import { trpc } from '@/lib/trpc/client';
import { useTrpcAuth } from '@/lib/trpc/provider';
import { TrackerSetupBanner } from './_components/TrackerSetupBanner';
import { UpgradeModal } from './_components/UpgradeModal';
import { analytics } from './_components/analytics-client';

export default function HomePage(): JSX.Element {
  const auth = useTrpcAuth();
  const planQ = trpc.billing.currentPlan.useQuery(undefined, { enabled: auth.ready });
  const summaryQ = trpc.dashboard.summary.useQuery(undefined, { enabled: auth.ready });
  const trackerQ = trpc.dashboard.trackerStatus.useQuery(undefined, {
    enabled: auth.ready,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const plan = planQ.data?.plan ?? 'FREE';
  const storeName = summaryQ.data?.storeName ?? '';

  useEffect(() => {
    analytics.track('home_viewed', { plan });
  }, [plan]);

  const openUpgrade = (): void => {
    analytics.track('upgrade_cta_clicked', { where: 'home' });
    setUpgradeOpen(true);
  };

  const navigate = useCallback((path: string) => {
    if (typeof window !== 'undefined' && window.shopify?.navigation?.navigate) {
      window.shopify.navigation.navigate(path);
    } else {
      window.location.assign(path);
    }
  }, []);

  return (
    <Page fullWidth>
      <BlockStack gap="500">
        {/* HERO */}
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            background:
              'radial-gradient(120% 140% at 0% 0%, #4f46e5 0%, #6d28d9 35%, #1e1b4b 100%)',
            borderRadius: 16,
            padding: '36px 40px',
            color: '#fff',
            boxShadow: '0 8px 24px rgba(79,70,229,0.22)',
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              right: -80,
              top: -80,
              width: 280,
              height: 280,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(236,72,153,0.45) 0%, transparent 70%)',
              filter: 'blur(20px)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 28,
            }}
          >
            <div style={{ flex: '1 1 460px', minWidth: 280 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: 0.8,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.14)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#22d3ee',
                  }}
                />
                LIVE · capturing every search
              </div>
              <h1
                style={{
                  fontSize: 32,
                  lineHeight: 1.1,
                  fontWeight: 800,
                  margin: 0,
                  marginBottom: 10,
                  letterSpacing: -0.4,
                }}
              >
                Find the searches that{' '}
                <span style={{ color: '#fbbf24' }}>cost you sales.</span>
              </h1>
              <p
                style={{
                  fontSize: 16,
                  lineHeight: 1.5,
                  margin: 0,
                  opacity: 0.92,
                  maxWidth: 580,
                }}
              >
                Every &ldquo;0 results&rdquo; on your storefront is a buyer with intent who walked
                away. LostSearch surfaces every missed query, ranks them by revenue impact, and
                tells you exactly what to fix — usually within minutes of install.
              </p>
              <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <button
                  onClick={() => navigate('/dashboard')}
                  style={{
                    background: '#fff',
                    color: '#4f46e5',
                    fontSize: 14,
                    fontWeight: 700,
                    padding: '10px 18px',
                    borderRadius: 10,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
                  }}
                >
                  Open dashboard →
                </button>
                {plan === 'FREE' && (
                  <button
                    onClick={openUpgrade}
                    style={{
                      background: 'rgba(255,255,255,0.12)',
                      color: '#fff',
                      fontSize: 14,
                      fontWeight: 600,
                      padding: '10px 18px',
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.25)',
                      cursor: 'pointer',
                    }}
                  >
                    Start 14-day free trial
                  </button>
                )}
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(96px, 1fr))',
                gap: 12,
                minWidth: 320,
                flex: '0 1 360px',
              }}
            >
              {[
                { v: 'Real-time', l: 'tracker, no code needed' },
                { v: '< 1 min', l: 'install → first sync' },
                { v: '$ ranked', l: 'gaps by revenue lift' },
              ].map((s) => (
                <div
                  key={s.v}
                  style={{
                    background: 'rgba(255,255,255,0.10)',
                    border: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: 12,
                    padding: '14px 14px',
                    backdropFilter: 'blur(6px)',
                  }}
                >
                  <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>{s.v}</div>
                  <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* WELCOME LINE */}
        {storeName && (
          <Text as="p" tone="subdued">
            Connected to <strong>{storeName}</strong> · Plan: <strong>{plan}</strong>
          </Text>
        )}

        {/* TRACKER SETUP — shown until first search arrives */}
        {summaryQ.data &&
          (summaryQ.data.totalMonthlySearches ?? 0) === 0 &&
          trackerQ.data?.enabled !== true && (
            <TrackerSetupBanner shopDomain={summaryQ.data.shopDomain} />
          )}

        {/* HOW LOSTSEARCH WORKS — 5 steps */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              How LostSearch works
            </Text>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 24,
                justifyContent: 'space-between',
              }}
            >
              {[
                { num: 1, title: 'Install tracker', subtitle: 'Auto-injected on install' },
                { num: 2, title: 'Sync catalog', subtitle: 'Products + 90d orders' },
                { num: 3, title: 'Capture searches', subtitle: 'Storefront events in real time' },
                { num: 4, title: 'Classify gaps', subtitle: 'Missing / Wrong match / Low interest' },
                { num: 5, title: 'Recover revenue', subtitle: 'Add products, fix synonyms' },
              ].map((step) => (
                <div
                  key={step.num}
                  style={{
                    flex: '1 1 160px',
                    minWidth: 160,
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      color: '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      fontWeight: 800,
                      marginBottom: 12,
                      boxShadow: '0 4px 12px rgba(99,102,241,0.30)',
                    }}
                  >
                    {step.num}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{step.title}</div>
                  <div style={{ fontSize: 13, color: '#5a6168', lineHeight: 1.45 }}>
                    {step.subtitle}
                  </div>
                </div>
              ))}
            </div>
          </BlockStack>
        </Card>

        {/* HOW IT WORKS + BEST PRACTICES */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 16,
            alignItems: 'stretch',
          }}
        >
          <div style={{ display: 'flex' }}>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  How it works
                </Text>
                <Divider />
                <BlockStack gap="300">
                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      1. Storefront tracker
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      A 2KB script captures every shopper search — what they typed, how many
                      results came back, whether they clicked anything. Auto-installs, no code.
                    </Text>
                  </div>
                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      2. Catalog matching
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Each query is matched against your products with fuzzy + semantic search.
                      Misses become &ldquo;missing product&rdquo; opportunities; weak matches
                      become &ldquo;wrong match&rdquo; opportunities.
                    </Text>
                  </div>
                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      3. Revenue estimation
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Monthly volume × your AOV × your category&rsquo;s benchmark conversion rate
                      = the revenue at risk for each gap, ranked.
                    </Text>
                  </div>
                </BlockStack>
              </BlockStack>
            </Card>
          </div>

          <div style={{ display: 'flex' }}>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Best practices
                </Text>
                <Divider />
                <BlockStack gap="400">
                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      ✓ Sync regularly — but don&rsquo;t obsess
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      LostSearch auto-syncs daily. Hit <strong>Sync now</strong> on the dashboard
                      after a product launch, a price drop, or anytime you&rsquo;ve added new SKUs
                      so gap detection sees the new catalog. Revenue numbers stabilize once you
                      have <strong>50+ monthly searches</strong> — below that, the dashboard
                      shows volume but holds back $ estimates because the sample is too small to
                      trust.
                    </Text>
                  </div>

                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      ✓ Tackle Missing products first
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      These are searches that returned <strong>zero results</strong> — pure
                      buying intent that hit a wall. Each one is a customer who tried to spend
                      money on your store. Adding the right SKU (or a category page that catches
                      it) is the single highest-leverage fix in this app: one new product can
                      recover the revenue from dozens of failed searches per month.
                    </Text>
                  </div>

                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      ✓ Fix Wrong matches with synonyms
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Shoppers found products but nobody clicked — usually because Shopify
                      surfaced the wrong items. Open <strong>Shopify Search &amp; Discovery</strong>
                      and add the suggested synonym (e.g. &ldquo;tee shirt&rdquo; →
                      &ldquo;t-shirt&rdquo;). The next time someone searches that term, the
                      relevant product ranks first.
                    </Text>
                  </div>

                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      ✓ Re-check after every catalog change
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      New collections, seasonal launches, or even renaming products can create
                      fresh search gaps overnight. Make a habit of opening LostSearch within 48
                      hours of any catalog shift — that&rsquo;s when the highest-impact gaps
                      surface and the easiest wins are still on the table.
                    </Text>
                  </div>

                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      ✓ Watch the trend, not single days
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      A query showing up once is noise. A query showing up <strong>10+ times in
                      the last 30 days</strong> is signal. The dashboard ranks gaps by occurrence
                      × benchmark conversion rate × your AOV — high-occurrence gaps are
                      always the right place to start.
                    </Text>
                  </div>
                </BlockStack>
              </BlockStack>
            </Card>
          </div>
        </div>

        {/* QUICK NAV CARDS */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {[
            { path: '/dashboard', icon: '📊', title: 'Dashboard', desc: 'Live status, real searches, revenue gaps and fixes.' },
            { path: '/pricing',   icon: '💎', title: 'Pricing',   desc: 'Compare Free vs Growth — start a 14-day free trial any time.' },
            { path: '/methodology', icon: '📖', title: 'Methodology', desc: 'How we classify gaps and estimate the revenue at risk.' },
          ].map(({ path, icon, title, desc }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              style={{
                flex: '1 1 280px',
                minWidth: 260,
                background: '#fff',
                border: '1px solid #e1e3e5',
                borderRadius: 12,
                padding: '20px 24px',
                cursor: 'pointer',
                color: '#202223',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 10 }}>{icon}</div>
              <Text as="h3" variant="headingMd">{title}</Text>
              <Text as="p" tone="subdued" variant="bodyMd">{desc}</Text>
            </button>
          ))}
        </div>

        <UpgradeModal
          open={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          storeId={summaryQ.data?.shopDomain ?? ''}
        />
      </BlockStack>
    </Page>
  );
}
