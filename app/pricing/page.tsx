'use client';

import { useCallback, useState } from 'react';
import { Page, BlockStack, Card, Text, Button, Banner } from '@shopify/polaris';
import { trpc } from '@/lib/trpc/client';
import { useTrpcAuth } from '@/lib/trpc/provider';
import { UpgradeModal } from '../_components/UpgradeModal';
import { analytics } from '../_components/analytics-client';

const FREE_FEATURES = [
  { included: true, label: 'Real-time storefront tracker (auto-installs, no code)' },
  { included: true, label: 'Top 5 highest-revenue search gaps visible' },
  { included: true, label: 'Three-way gap classification (missing / wrong match / low interest)' },
  { included: true, label: 'Weekly snapshot of search performance' },
  { included: false, label: 'Full gap list — every missed search, not just the top 5' },
  { included: false, label: 'Dollar revenue estimate on each gap' },
  { included: false, label: 'Weekly digest email' },
  { included: false, label: 'One-click Shopify Search & Discovery synonym sync' },
  { included: false, label: 'Priority email support' },
];

const GROWTH_FEATURES = [
  'Everything in Free, plus:',
  'Every gap shown — no top-5 cap',
  'Dollar revenue estimate per gap (with low/high band)',
  'Weekly digest email summarizing new gaps & fixes applied',
  'One-click sync of suggested synonyms to Shopify Search & Discovery',
  'Priority email support',
];

export default function PricingPage(): JSX.Element {
  const auth = useTrpcAuth();
  const planQ = trpc.billing.currentPlan.useQuery(undefined, { enabled: auth.ready });
  const summaryQ = trpc.dashboard.summary.useQuery(undefined, { enabled: auth.ready });
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const plan = planQ.data?.plan ?? 'FREE';

  const openUpgrade = (): void => {
    analytics.track('upgrade_cta_clicked', { where: 'pricing' });
    setUpgradeOpen(true);
  };

  const goBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.shopify?.navigation?.navigate) {
      window.shopify.navigation.navigate('/');
    } else {
      window.location.assign('/');
    }
  }, []);

  return (
    <Page title="Pricing" backAction={{ content: 'Home', onAction: goBack }}>
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="200">
            <Text as="h1" variant="headingXl">
              Recover lost revenue. Pay nothing while you decide.
            </Text>
            <Text as="p" tone="subdued">
              Every Shopify store loses revenue to searches that return nothing. LostSearch finds
              those moments and tells you exactly what to fix. Start on Free — upgrade only when
              you see real gaps worth recovering.
            </Text>
          </BlockStack>
        </Card>

        {plan === 'GROWTH' && (
          <Banner tone="success" title="You&rsquo;re on Growth">
            <p>Thanks for upgrading. You have access to everything below.</p>
          </Banner>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {/* FREE */}
          <div
            style={{
              flex: '1 1 320px',
              minWidth: 280,
              border: plan === 'FREE' ? '2px solid #2563eb' : '1px solid #e1e3e5',
              borderRadius: 14,
              padding: '28px 30px',
              background: '#fff',
              position: 'relative',
            }}
          >
            {plan === 'FREE' && (
              <div
                style={{
                  position: 'absolute',
                  top: -10,
                  left: 16,
                  background: '#2563eb',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 10px',
                  borderRadius: 999,
                  letterSpacing: 0.6,
                }}
              >
                YOUR PLAN
              </div>
            )}
            <Text as="h2" variant="headingLg">
              Free
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Get a feel for your search gaps before paying anything.
            </Text>
            <div style={{ marginTop: 14, marginBottom: 18 }}>
              <span style={{ fontSize: 40, fontWeight: 800, color: '#1a1a1a' }}>$0</span>
              <span style={{ fontSize: 14, color: '#6d7175', marginLeft: 6 }}>/ month forever</span>
            </div>
            <ul style={{ padding: 0, listStyle: 'none', marginTop: 8 }}>
              {FREE_FEATURES.map((f) => (
                <li
                  key={f.label}
                  style={{
                    fontSize: 14,
                    padding: '7px 0',
                    color: f.included ? '#202223' : '#9ba3af',
                    display: 'flex',
                    gap: 10,
                    lineHeight: 1.4,
                  }}
                >
                  <span
                    style={{
                      color: f.included ? '#16a34a' : '#9ba3af',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {f.included ? '✓' : '✕'}
                  </span>
                  <span>{f.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* GROWTH */}
          <div
            style={{
              flex: '1 1 320px',
              minWidth: 280,
              border: plan === 'GROWTH' ? '2px solid #16a34a' : '2px solid #7c3aed',
              borderRadius: 14,
              padding: '28px 30px',
              background:
                plan === 'GROWTH' ? '#fff' : 'linear-gradient(180deg, #faf5ff 0%, #fff 60%)',
              position: 'relative',
              boxShadow:
                plan === 'GROWTH' ? 'none' : '0 8px 24px rgba(124,58,237,0.14)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -10,
                left: 16,
                background: plan === 'GROWTH' ? '#16a34a' : '#7c3aed',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 10px',
                borderRadius: 999,
                letterSpacing: 0.6,
              }}
            >
              {plan === 'GROWTH' ? 'YOUR PLAN' : 'MOST POPULAR'}
            </div>
            <Text as="h2" variant="headingLg">
              Growth
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              For merchants ready to act on every gap and recover the revenue.
            </Text>
            <div style={{ marginTop: 14, marginBottom: 18 }}>
              <span style={{ fontSize: 40, fontWeight: 800, color: '#1a1a1a' }}>$9</span>
              <span style={{ fontSize: 14, color: '#6d7175', marginLeft: 6 }}>/ month</span>
              <span
                style={{
                  marginLeft: 12,
                  fontSize: 11,
                  background: '#dcfce7',
                  color: '#166534',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontWeight: 700,
                }}
              >
                14-day free trial
              </span>
            </div>
            <ul style={{ padding: 0, listStyle: 'none', marginTop: 8 }}>
              {GROWTH_FEATURES.map((f, i) => (
                <li
                  key={f}
                  style={{
                    fontSize: 14,
                    padding: '7px 0',
                    color: i === 0 ? '#6d7175' : '#202223',
                    fontStyle: i === 0 ? 'italic' : 'normal',
                    display: 'flex',
                    gap: 10,
                    lineHeight: 1.4,
                  }}
                >
                  {i > 0 && (
                    <span style={{ color: '#16a34a', fontWeight: 700, flexShrink: 0 }}>✓</span>
                  )}
                  <span style={i === 0 ? { paddingLeft: 0 } : undefined}>{f}</span>
                </li>
              ))}
            </ul>
            {plan === 'FREE' && (
              <div style={{ marginTop: 22 }}>
                <Button variant="primary" size="large" onClick={openUpgrade} fullWidth>
                  Start 14-day free trial
                </Button>
                <div
                  style={{
                    fontSize: 11,
                    color: '#6d7175',
                    marginTop: 10,
                    textAlign: 'center',
                  }}
                >
                  Cancel anytime · Billed through Shopify · No credit card extra
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FAQ */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Common questions
            </Text>
            {[
              {
                q: 'How does the 14-day trial work?',
                a: 'You start Growth instantly. Shopify charges nothing for 14 days. Cancel from your Shopify admin any time during the trial — no charge, no questions.',
              },
              {
                q: 'What does a "gap" mean?',
                a: 'A gap is a real shopper search where something went wrong: nothing showed up, the wrong things showed up, or what showed up wasn’t worth clicking. Each one is a missed sale we can quantify.',
              },
              {
                q: 'Will this slow down my storefront?',
                a: 'No. The tracker is a 2KB script that fires after the page renders. It cannot block your checkout or product pages.',
              },
              {
                q: 'Can I downgrade later?',
                a: 'Yes — drop back to Free at any time from Shopify’s billing UI. Your historical data stays.',
              },
            ].map((item) => (
              <BlockStack key={item.q} gap="100">
                <Text as="h3" variant="bodyMd" fontWeight="semibold">
                  {item.q}
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  {item.a}
                </Text>
              </BlockStack>
            ))}
          </BlockStack>
        </Card>
      </BlockStack>

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        storeId={summaryQ.data?.shopDomain ?? ''}
      />
    </Page>
  );
}
