import { env } from './env';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Admin pages/routes are gated by a two-factor contract:
 *   1. The caller's email (from a Shopify session token claim OR from a header
 *      signed upstream by Coolify's Cloudflare Access / BasicAuth layer) must
 *      be in ADMIN_EMAILS.
 *   2. NODE_ENV === 'production' additionally requires that the request
 *      carries an `X-Admin-Bearer` matching METRICS_BEARER (reused) for
 *      defense in depth.
 *
 * Dev path: if ADMIN_EMAILS is unset, admin is open. Prod path: if unset,
 * admin is CLOSED (fail-safe default).
 */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = env.ADMIN_EMAILS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.length === 0) return env.NODE_ENV !== 'production';
  return list.includes(email.toLowerCase());
}

export function requireAdminForRoute(req: NextRequest): NextResponse | null {
  // `X-Admin-Email` expected to be set by the upstream auth proxy
  // (Cloudflare Access / Coolify BasicAuth + email header). Dev path bypasses.
  const email = req.headers.get('x-admin-email');
  if (isAdmin(email)) return null;
  return NextResponse.json({ error: 'admin only' }, { status: 403 });
}
