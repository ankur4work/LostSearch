# Security & Threat Model

## Scope

DemandRadar is an embedded Shopify app. It holds:

1. **Merchant-scoped offline access tokens** (the only true secret).
2. **Search query strings and counts** — business-sensitive but not PII.
3. **Catalog metadata** (titles, tags, descriptions) — already public via the storefront.

We do **not** store customer PII. GDPR `customers/data_request` and `customers/redact` webhooks are acknowledged as no-ops.

## Trust boundaries

| From → To | Boundary | Controls |
|---|---|---|
| Merchant browser → our app | Embedded iframe | Session token JWT per request, CSP `frame-ancestors`, no first-party cookies for auth |
| Shopify → our app | OAuth callback + webhooks | HMAC-SHA256 verification (timing-safe), shop-domain regex, cookie-bound `state` parameter |
| Our app → Shopify Admin API | Outbound | Offline access token, decrypted only in-process per request |
| App ↔ DB | Local network / Coolify internal | TLS recommended; `access_token` encrypted at rest |

## Top risks and mitigations

### 1. Stolen access token
Tokens are stored **AES-256-GCM** encrypted in `stores.access_token` using a 32-byte key from `SESSION_SECRET`. Each record has a unique 96-bit IV and 128-bit auth tag. Leaking a DB dump is not sufficient to call the Shopify API — the attacker also needs `SESSION_SECRET`.

- Rotation: re-encrypt all records under a new key; old ciphertext is unreadable afterward.
- Code path: `lib/crypto.ts` (`encrypt`, `decrypt`), exercised by `tests/crypto.test.ts`.

### 2. Forged OAuth callback
Any party can replay `/api/auth/callback`. We defend with:

- **HMAC verification** of query params using `SHOPIFY_API_SECRET` (timing-safe `timingSafeEqual`, `lib/shopify/hmac.ts`).
- **State cookie**: `/api/auth` sets a random `shopify_oauth_state` HttpOnly cookie. Callback requires exact match.
- **Shop allowlist**: only `^[a-z0-9][a-z0-9-]*\.myshopify\.com$` shops accepted. Tested against 15+ attack variants (path traversal, subdomain injection, unicode homographs, port suffixes, protocol prefixes).
- **Fresh cookie-bound shop**: the `shop` param in the callback must match the cookie set at init.

### 3. Forged webhooks
All four mandatory webhooks (`app/uninstalled`, `customers/data_request`, `customers/redact`, `shop/redact`) verify HMAC-SHA256 of the **raw request body** against `SHOPIFY_API_SECRET` before any DB write. Missing or non-matching HMAC → `401`. No DoS-able expensive work before the check.

### 4. Session token forgery (embedded app)
Every `/api/trpc/*` request carries a short-lived JWT minted by App Bridge and signed with `SHOPIFY_API_SECRET`. `lib/shopify/session.ts` verifies:
- Algorithm pinned to `HS256` (prevents `none` attacks).
- Audience must equal our `SHOPIFY_API_KEY`.
- `exp` + 5s clock tolerance.
- `dest` parsed and matched against the shop-domain regex.

The tRPC context resolves the store row by shop and refuses to serve data for uninstalled stores.

### 5. Clickjacking / iframe hijack
Response header `Content-Security-Policy: frame-ancestors https://*.myshopify.com https://admin.shopify.com` locks the embed to Shopify Admin. Set globally in `next.config.mjs`.

### 6. Supply-chain / dependency drift
- Lockfile committed; CI uses `--frozen-lockfile`.
- `next.config.mjs` sets `poweredByHeader: false`.
- No client-side Shopify API calls — all Shopify traffic flows through our server, where secrets live.

### 7. Data retention on uninstall
Per product policy, **uninstalling does not delete data for 30 days**. `app/uninstalled` sets `stores.uninstalled_at` only, and cancels all pending + repeatable BullMQ jobs for the store (so we stop calling a revoked token). `shop/redact` (fired 48h after uninstall) does **not** delete immediately — it writes `stores.scheduled_redact_at = now + 48h`. The `redact-purge` cron runs daily at 01:00 UTC and hard-deletes stores past that window. This preserves a merchant's ability to reinstall during the recovery window without data loss, while still honoring the GDPR deletion request within the 48h spec window.

### 8. PII minimization in ingestion
The ingestion pipeline never stores raw customer data. The orders query only fetches `id`, `createdAt`, `displayFinancialStatus`, and `currentTotalPriceSet` — no names, emails, addresses, or line-item customer metadata. All analytics derived from orders (AOV, sample size) are aggregates. Search analytics likewise stores only the query string, counts, and filter facets — never the searcher's session or identity.

## Secrets management

| Secret | Source | Rotation impact |
|---|---|---|
| `SHOPIFY_API_SECRET` | Shopify Partner Dashboard | Invalidates all session tokens + webhook HMACs. Must rotate in-sync with Shopify. |
| `SESSION_SECRET` | Generated per-env; 32 random bytes | Old encrypted access tokens become unreadable — re-OAuth required, or re-encrypt during transition. |
| `DATABASE_URL` / `REDIS_URL` | Coolify managed services | Standard credential rotation. |

Never commit `.env`. `.env.example` is the only committed template.

## Logging & redaction

Pino redacts `authorization`, `cookie`, `accessToken`, `password`, `SHOPIFY_API_SECRET`, `SESSION_SECRET` from all structured logs. Never log request bodies of webhook handlers before HMAC verification.

## 9. Rate limiting

Redis token-bucket limiter (`lib/rate-limit.ts`):
- **Merchant endpoints**: 100 req/min per shop, per operation (tunable via `RATE_LIMIT_MERCHANT_PER_MIN`).
- **Public endpoints** (`/api/auth/*`, `/methodology`, `/unsubscribe`, `/privacy`, webhooks): 30 req/min per IP (tunable).
- **Failure mode**: fails open on Redis outage. Availability > rejection; the rate-limit is defence-in-depth, not a primary control.

## 10. OAuth state storage

State tokens are now Redis-backed with a 5-minute TTL and atomic `GETDEL`
consumption — a callback with the same state param twice sees the second
attempt rejected. Previously (prompt 1) this lived in a cookie; moved to
Redis so a forged cookie cannot grant state-approval.

## 11. Session token JWT validation

Per Built-for-Shopify review: we now assert both `iss` and `dest` parse as
URLs and share a host, in addition to audience + exp + signature. See
`lib/shopify/session.ts`.

## 12. CSP

Strict CSP with the Shopify-required `frame-ancestors` and tight allowlists
for script/style/connect. No `X-Frame-Options` — it would override
`frame-ancestors` on legacy UAs and break the embed.

## 13. Secret hygiene

- pre-commit gitleaks hook (`.husky/pre-commit`, config in `.gitleaks.toml`)
  with custom Shopify-token patterns.
- Dependabot weekly (`.github/dependabot.yml`) for npm + GitHub Actions + Docker.
- Sentry `beforeSend` hook scrubs anything matching `/token|secret|password|authorization/i` and strips Shopify headers.
- Pino logger redacts `accessToken`, `authorization`, `cookie` paths.

## 14. Privacy endpoints

- `POST /api/privacy/export` — session-token authed, rate-limited, returns the merchant's full dataset as downloadable JSON. Access token is replaced with a marker before serialization.
- `POST /api/privacy/cancel-redact` — merchant cancels a scheduled 48h redact by reinstalling or by explicit call.

## 15. Admin console

`/admin` is gated by the `X-Admin-Email` header set by the upstream auth
proxy (Cloudflare Access or Coolify BasicAuth) and the `ADMIN_EMAILS`
allowlist. Fails closed in production when the allowlist is empty.

## Out of scope (future)

- App Proxy signing (not yet used).
- Shopify Billing API idempotency (idempotent via webhook dedup key; no extra guard yet).
- WAF-layer rate limiting (supplement to our app-level limiter).
