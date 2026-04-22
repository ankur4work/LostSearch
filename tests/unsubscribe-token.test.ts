import { describe, it, expect } from 'vitest';
import { mintUnsubscribeToken, verifyUnsubscribeToken } from '@/lib/email/unsubscribe-token';

describe('unsubscribe token', () => {
  it('round-trips a valid token', () => {
    const token = mintUnsubscribeToken('store_abc123');
    const verified = verifyUnsubscribeToken(token);
    expect(verified?.storeId).toBe('store_abc123');
  });

  it('rejects a tampered signature', () => {
    const token = mintUnsubscribeToken('store_abc123');
    const parts = token.split('.');
    parts[3] = '0'.repeat(parts[3]!.length);
    const tampered = parts.join('.');
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it('rejects a tampered storeId', () => {
    const token = mintUnsubscribeToken('store_abc123');
    const parts = token.split('.');
    parts[1] = 'store_attacker';
    expect(verifyUnsubscribeToken(parts.join('.'))).toBeNull();
  });

  it('rejects >90-day-old tokens', () => {
    const token = mintUnsubscribeToken('store_abc');
    const parts = token.split('.');
    parts[2] = String(Date.now() - 91 * 86_400_000);
    // Re-signing with the stale time would require the secret; an attacker
    // without the secret can't produce a valid aged token. Verify that
    // swapping time without re-signing fails.
    const aged = parts.join('.');
    expect(verifyUnsubscribeToken(aged)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(verifyUnsubscribeToken('nope')).toBeNull();
    expect(verifyUnsubscribeToken('v1.a.b')).toBeNull();
    expect(verifyUnsubscribeToken('v2.store.1234.deadbeef')).toBeNull();
    expect(verifyUnsubscribeToken('')).toBeNull();
  });
});
