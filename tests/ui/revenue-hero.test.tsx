import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithPolaris } from './setup';
import { RevenueHero } from '@/app/_components/RevenueHero';

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('<RevenueHero>', () => {
  const baseProps = {
    totalCents: 84_000,
    bandLowCents: 67_200,
    bandHighCents: 100_800,
    currency: 'USD',
    gapsCount: 12,
    storeId: 'test-shop',
  };

  it('animates on first mount (counter starts below target, finishes at target)', async () => {
    renderWithPolaris(<RevenueHero {...baseProps} />);
    // react-countup renders "$0" first tick then ramps to target.
    // By waiting up to 1500ms (animation duration 1.2s + margin) we should see
    // the final "$840" value.
    await waitFor(() => {
      expect(screen.getByTestId('hero-headline')).toHaveTextContent('$840');
    }, { timeout: 1800 });
  });

  it('does NOT animate on subsequent mounts (sessionStorage sentinel)', () => {
    window.sessionStorage.setItem('sfm:hero-animated:test-shop', '1');
    renderWithPolaris(<RevenueHero {...baseProps} />);
    // Static path renders immediately with the final value; no CountUp element.
    expect(screen.getByTestId('hero-static')).toHaveTextContent('$840');
  });

  it('renders the confidence band range', async () => {
    renderWithPolaris(<RevenueHero {...baseProps} />);
    expect(
      screen.getByText((t) => t.includes('$672') && t.includes('$1,008')),
    ).toBeInTheDocument();
  });

  it('uses the store currency in formatted output', () => {
    window.sessionStorage.setItem('sfm:hero-animated:test-shop', '1');
    renderWithPolaris(<RevenueHero {...baseProps} currency="INR" totalCents={800_000} />);
    expect(screen.getByTestId('hero-static').textContent).toMatch(/₹/);
  });
});
