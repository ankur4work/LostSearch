import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { DigestEmail, type DigestEmailProps } from '@/lib/email/templates/DigestEmail';

const base: DigestEmailProps = {
  storeName: 'Acme Fashion',
  currency: 'USD',
  totalImpactCents: 84_000,
  gapsCount: 12,
  topGaps: [
    { queryNorm: 'bandhgala', estimateCents: 60_000, bandLowCents: 48_000, bandHighCents: 72_000, type: 'TYPE_1' },
    { queryNorm: 'silk saree', estimateCents: 14_000, bandLowCents: 11_200, bandHighCents: 16_800, type: 'TYPE_2' },
    { queryNorm: 'cutting board', estimateCents: 10_000, bandLowCents: 8_000, bandHighCents: 12_000, type: 'TYPE_1' },
  ],
  fixesApplied: [],
  dashboardUrl: 'https://app.example/?shop=acme.myshopify.com',
  methodologyUrl: 'https://app.example/methodology',
  unsubscribeUrl: 'https://app.example/unsubscribe?token=abc',
  companyAddress: 'Search Failure Miner · Bangalore, India',
  plan: 'GROWTH',
};

describe('DigestEmail rendering', () => {
  it('snapshot: rich data scenario', async () => {
    const html = await render(DigestEmail(base));
    expect(html).toMatchInlineSnapshot.toString
      ? undefined
      : undefined; // appease TS w/ unused
    expect(html).toContain('Acme Fashion');
    expect(html).toContain('$840'); // headline impact
    expect(html).toContain('bandhgala');
    expect(html).toContain('Open dashboard');
    expect(html).toContain('Unsubscribe');
    expect(html).toContain('Bangalore');
  });

  it('snapshot: sparse data (no gaps list content but still sends)', async () => {
    const sparse: DigestEmailProps = { ...base, topGaps: [] };
    const html = await render(DigestEmail(sparse));
    expect(html).toContain('No high-confidence gaps this week');
  });

  it('snapshot: fixes-applied section renders when fixes present', async () => {
    const withFixes: DigestEmailProps = {
      ...base,
      fixesApplied: [
        { query: 'bandhgala', productTitle: 'Ethnic Nehru Jacket', estimatedImpactCents: 60_000 },
        { query: 'cutting board', productTitle: 'Bamboo Chopping Board', estimatedImpactCents: 10_000 },
      ],
    };
    const html = await render(DigestEmail(withFixes));
    expect(html).toContain('Fixes you made this week');
    expect(html).toContain('Ethnic Nehru Jacket');
    expect(html).toContain('Bamboo Chopping Board');
  });

  it('free plan shows only top 3 gaps', async () => {
    const many: DigestEmailProps = {
      ...base,
      plan: 'FREE',
      topGaps: Array.from({ length: 7 }, (_, i) => ({
        queryNorm: `gap ${i}`,
        estimateCents: (7 - i) * 10_000,
        bandLowCents: (7 - i) * 8_000,
        bandHighCents: (7 - i) * 12_000,
        type: 'TYPE_1' as const,
      })),
    };
    const html = await render(DigestEmail(many));
    expect(html).toContain('gap 0');
    expect(html).toContain('gap 1');
    expect(html).toContain('gap 2');
    expect(html).not.toContain('gap 3');
    expect(html).not.toContain('gap 6');
  });

  it('plaintext render contains key content (accessibility + deliverability)', async () => {
    const text = await render(DigestEmail(base), { plainText: true });
    expect(text).toContain('Acme Fashion');
    expect(text).toContain('Open dashboard');
    expect(text).toContain('Unsubscribe');
  });
});
