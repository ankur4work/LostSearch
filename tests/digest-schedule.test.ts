import { describe, it, expect } from 'vitest';
import { nextMondayNineAM } from '@/lib/email/schedule';

/**
 * Timezone correctness (acceptance criterion):
 *   a store in Asia/Kolkata (IST, UTC+5:30) must receive its digest at
 *   Monday 09:00 IST, which is Monday 03:30 UTC.
 *   a store in America/New_York (EST, UTC-5 winter) at 09:00 local is 14:00 UTC.
 */
describe('nextMondayNineAM', () => {
  it('IST store: 09:00 Mon IST = 03:30 Mon UTC', () => {
    // Start from a Sunday afternoon in UTC.
    const from = new Date('2026-04-19T12:00:00Z'); // Sunday
    const result = nextMondayNineAM('Asia/Kolkata', from);
    // 2026-04-20 at 03:30 UTC is 2026-04-20 09:00 IST.
    expect(result.toISOString()).toBe('2026-04-20T03:30:00.000Z');
  });

  it('New York store: 09:00 Mon ET', () => {
    // 2026-04-19 is Sunday. Monday 09:00 NYC (EDT = UTC-4 in April) = 13:00 UTC.
    const from = new Date('2026-04-19T12:00:00Z');
    const result = nextMondayNineAM('America/New_York', from);
    expect(result.toISOString()).toBe('2026-04-20T13:00:00.000Z');
  });

  it('UTC store: 09:00 Mon UTC is 09:00 Mon UTC', () => {
    const from = new Date('2026-04-19T12:00:00Z');
    const result = nextMondayNineAM('UTC', from);
    expect(result.toISOString()).toBe('2026-04-20T09:00:00.000Z');
  });

  it('skips current Monday if already past 09:00 local', () => {
    // Monday 2026-04-20 at 15:00 UTC is past 09:00 IST.
    const from = new Date('2026-04-20T15:00:00Z');
    const result = nextMondayNineAM('Asia/Kolkata', from);
    // Next Monday is 2026-04-27, 03:30 UTC.
    expect(result.toISOString()).toBe('2026-04-27T03:30:00.000Z');
  });
});
