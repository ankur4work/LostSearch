import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env';

const VERSION = 'v1';
const MAX_AGE_DAYS = 90;

/**
 * Signed unsubscribe token, embedded in every digest footer. Format:
 *   v1.{storeId}.{issuedAtMs}.{sig}
 * Signature is HMAC-SHA256 over `{version}.{storeId}.{issuedAtMs}` using
 * SESSION_SECRET (hex-decoded). 90-day expiry prevents stale-link misuse.
 *
 * Public route consumers must ONLY trust the storeId from a verified token —
 * never a query param.
 */
export function mintUnsubscribeToken(storeId: string): string {
  const issuedAt = Date.now();
  const payload = `${VERSION}.${storeId}.${issuedAt}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export interface VerifiedToken {
  storeId: string;
  issuedAt: number;
}

export function verifyUnsubscribeToken(token: string): VerifiedToken | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [version, storeId, issuedAtStr, sig] = parts;
  if (version !== VERSION || !storeId || !issuedAtStr || !sig) return null;
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt)) return null;
  const ageMs = Date.now() - issuedAt;
  if (ageMs < 0 || ageMs > MAX_AGE_DAYS * 86_400_000) return null;

  const expected = sign(`${version}.${storeId}.${issuedAtStr}`);
  if (!safeEqualHex(expected, sig)) return null;

  return { storeId, issuedAt };
}

function sign(payload: string): string {
  const key = Buffer.from(env.SESSION_SECRET, 'hex');
  return createHmac('sha256', key).update(payload).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ab.length === 0 || ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}
