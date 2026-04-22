import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPolaris } from './setup';

// Mock the tRPC client used by ProductGapsSection.
const mockGapsResponse = {
  gaps: [
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `v${i}`,
      queryNorm: `visible query ${i}`,
      type: 'TYPE_1',
      confidence: 0.9,
      occurrenceCount: 100 - i,
      matchedProductIds: [],
      matchedProductTitles: [],
      lowVolume: false,
      locked: false,
      estimateCents: 50_000 - i * 1_000,
      bandLowCents: 40_000,
      bandHighCents: 60_000,
      revenueBucket: 'MED',
      reasoning: {},
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `l${i}`,
      queryNorm: `locked query ${i}`,
      type: 'TYPE_1',
      confidence: 0.85,
      occurrenceCount: 40,
      matchedProductIds: [],
      matchedProductTitles: [],
      lowVolume: false,
      locked: true,
      estimateCents: null,
      bandLowCents: null,
      bandHighCents: null,
      revenueBucket: 'MED',
      reasoning: null,
    })),
  ],
  total: 10,
  lockedCount: 5,
  lockedRevenueSumCents: 120_000,
  plan: 'FREE' as const,
};

vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    dashboard: {
      gaps: {
        useQuery: () => ({ data: mockGapsResponse, isLoading: false }),
      },
      trend: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
    },
  },
}));

import { ProductGapsSection } from '@/app/_components/ProductGapsSection';

describe('free-tier locked rows (PRD §12)', () => {
  it('locked rows render but are visually blurred + user-select:none + DOM text redacted', () => {
    renderWithPolaris(<ProductGapsSection onUpgrade={() => {}} />);

    const visibleRows = screen.getAllByTestId('gap-row-visible');
    const lockedRows = screen.getAllByTestId('gap-row-locked');

    // Server flagged 5 locked; each rendered.
    expect(visibleRows).toHaveLength(5);
    expect(lockedRows).toHaveLength(5);

    // Visible rows surface the real query text.
    expect(visibleRows[0]?.textContent ?? '').toContain('visible query 0');

    // Locked rows do NOT contain the real query string in the DOM —
    // the row is hidden-from-a11y, filtered with blur, and text is replaced
    // with bullets. No free-tier user can copy the real revenue number out.
    for (const row of lockedRows) {
      expect(row.textContent ?? '').not.toContain('locked query');
      expect(row.textContent ?? '').toContain('•');
      expect(row.getAttribute('aria-hidden')).toBe('true');
    }

    // Inline style carries the redaction contract.
    const firstLocked = lockedRows[0]!;
    expect(firstLocked).toHaveStyle({ filter: 'blur(4px)', userSelect: 'none' });
  });

  it('shows an upgrade CTA with the aggregate locked revenue sum', () => {
    renderWithPolaris(<ProductGapsSection onUpgrade={() => {}} />);
    expect(screen.getByRole('button', { name: /Upgrade to Growth/ })).toBeInTheDocument();
    expect(screen.getByText((t) => t.includes('$1,200'))).toBeInTheDocument();
  });
});
