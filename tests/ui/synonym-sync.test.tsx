import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithPolaris } from './setup';

// Minimal mock of the trpc client surface used by KeywordFixesSection + modal.
const applyMock = vi.fn(async () => ({ id: 'syn1', shopifySynonymId: 'gid://Synonym/1', productTitle: 'Ethnic Nehru Jacket' }));
const undoMock = vi.fn(async () => ({ id: 'syn1-remove' }));
const gapsInvalidate = vi.fn();
const appliedInvalidate = vi.fn();

vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      dashboard: { gaps: { invalidate: gapsInvalidate } },
      synonyms: { appliedThisWeek: { invalidate: appliedInvalidate } },
    }),
    dashboard: {
      gaps: {
        useQuery: () => ({
          data: {
            gaps: [
              {
                id: 'cls1',
                queryNorm: 'bandhgala',
                type: 'TYPE_2',
                confidence: 0.86,
                occurrenceCount: 42,
                matchedProductIds: ['p1'],
                matchedProductTitles: ['Ethnic Nehru Jacket'],
                lowVolume: false,
                locked: false,
                estimateCents: 0,
                bandLowCents: 0,
                bandHighCents: 0,
                revenueBucket: 'MED',
                reasoning: {},
              },
            ],
            total: 1,
            lockedCount: 0,
            lockedRevenueSumCents: 0,
            plan: 'GROWTH' as const,
          },
          isLoading: false,
        }),
      },
    },
    synonyms: {
      appliedThisWeek: { useQuery: () => ({ data: [], isLoading: false }) },
      apply: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutateAsync: async (input: unknown) => {
            const r = await applyMock();
            opts?.onSuccess?.();
            return r;
          },
          isPending: false,
          isError: false,
          error: null,
          reset: () => {},
        }),
      },
      undo: {
        useMutation: () => ({
          mutateAsync: async () => undoMock(),
          isPending: false,
          isError: false,
          error: null,
        }),
      },
    },
  },
}));

import { KeywordFixesSection } from '@/app/_components/KeywordFixesSection';

describe('<KeywordFixesSection> sync flow', () => {
  it('confirms before writing; calls apply + invalidates caches on success', async () => {
    const user = userEvent.setup();
    renderWithPolaris(
      <KeywordFixesSection plan="GROWTH" storeId="shop.myshopify.com" onUpgrade={() => {}} />,
    );

    const addBtn = await screen.findByRole('button', { name: /Add synonym/i });
    await user.click(addBtn);

    // Modal requires explicit confirmation (no silent writes).
    const confirm = await screen.findByRole('button', { name: /Confirm & sync/i });
    expect(
      screen.getByText((t) => t.toLowerCase().includes('bandhgala') && t.toLowerCase().includes('nehru')),
    ).toBeInTheDocument();

    await user.click(confirm);

    await waitFor(() => expect(applyMock).toHaveBeenCalled());
    expect(gapsInvalidate).toHaveBeenCalled();
    expect(appliedInvalidate).toHaveBeenCalled();
  });
});
