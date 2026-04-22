import { fromZonedTime } from 'date-fns-tz';

/**
 * Compute the next "Monday 09:00 local" UTC instant for a given IANA timezone.
 * Returns a Date whose `getTime()` is the UTC epoch at which the local wall
 * clock in `timezone` reads Monday 09:00 on the next upcoming Monday
 * (strictly > `from`).
 */
export function nextMondayNineAM(timezone: string, from: Date = new Date()): Date {
  const year = from.getUTCFullYear();
  // Search forward up to 8 days; at most one iteration returns a future Monday.
  for (let i = 0; i < 9; i += 1) {
    const candidate = new Date(from.getTime() + i * 86_400_000);
    const candidateUtc = buildLocalWallClock(
      candidate.getUTCFullYear(),
      candidate.getUTCMonth(),
      candidate.getUTCDate(),
      9,
      0,
      timezone,
    );
    if (candidateUtc.getTime() <= from.getTime()) continue;
    // Check that in the target timezone, this instant is a Monday.
    if (isMondayInTZ(candidateUtc, timezone)) return candidateUtc;
  }
  // Fallback: shouldn't hit.
  return new Date(year + 1, 0, 1);
}

function buildLocalWallClock(
  y: number,
  mIndex: number,
  d: number,
  hours: number,
  minutes: number,
  timezone: string,
): Date {
  // We want the UTC instant that corresponds to Y-M-D hh:mm in `timezone`.
  // date-fns-tz's fromZonedTime takes a Date representing the local wall clock
  // (in "UTC-agnostic" form) and the timezone, and returns the real UTC Date.
  const wallClock = new Date(Date.UTC(y, mIndex, d, hours, minutes, 0, 0));
  return fromZonedTime(wallClock, timezone);
}

function isMondayInTZ(utcInstant: Date, timezone: string): boolean {
  // Use Intl with timezone to get the local weekday.
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(utcInstant);
  return weekday === 'Mon';
}
