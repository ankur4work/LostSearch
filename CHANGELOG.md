# Changelog

All notable changes to DemandRadar are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-04-22

Initial Shopify App Store submission release.

### Added
- OAuth 2.0 install flow with HMAC verification, Redis-backed single-use state tokens, AES-256-GCM envelope encryption of offline access tokens.
- Embedded Polaris dashboard with Revenue Impact hero (animated counter), Product Gaps, Keyword Fixes, and Results-No-Click sections.
- Three-stream ingestion pipeline: Shopify search analytics, orders (for AOV), products via Bulk Operation API.
- Classification engine: 8-step deterministic decision tree with Fuse.js fuzzy match, semantic similarity via local pgvector + `all-MiniLM-L6-v2` embeddings (zero external ML APIs).
- 306-entry bidirectional synonym library with India-specific Hindi-English ethnic-wear coverage.
- Revenue estimator with category-aware benchmarks and ±20% confidence band.
- Shopify Billing integration: Growth plan at $15/mo with 14-day free trial; callback and `app_subscriptions/update` webhook.
- One-click synonym sync to Shopify Search & Discovery with 14-day merchant undo.
- Weekly digest email (React Email + Resend/SMTP) in the merchant's local timezone.
- Unsubscribe flow with signed 90-day HMAC tokens.
- Public `/methodology` and `/privacy` pages; sitemap; merchant data export endpoint.
- Observability: structured Pino logging with AsyncLocalStorage request IDs, Sentry hooks, Prometheus `/api/metrics`, health endpoint.
- Security hardening: strict CSP, per-shop and public rate limits (Redis token bucket), session-token JWT validation (iss/aud/exp/dest).
- Admin console (`/admin`) behind email allowlist + proxy-auth header.
- GDPR: `customers/data_request`, `customers/redact`, `shop/redact` (48h-delayed with reinstall cancel).
- 30-day retention policy on uninstall; hard delete only on `shop/redact` past the 48h window.
- Deployment: Coolify-ready multi-stage Dockerfile, `docker-compose.prod.yml`, nightly encrypted Postgres backups sidecar.
- Dependabot weekly updates grouped by vendor; gitleaks pre-commit hook.

### Security
- Timing-safe `timingSafeEqual` for HMAC and custom secret comparisons.
- PII scrubbing in Sentry `beforeSend`.
- pre-commit secret scanning (gitleaks).

### Tests
- 170+ unit + integration tests covering OAuth HMAC, shop domain validation, AES round-trip, session JWT claims, rate-limit behavior, bulk-operation states, AOV edge cases, normalizer (35 Unicode/script cases), classifier (52 cases covering all 4 types + synonyms), revenue snapshots + property tests, email templates, timezone correctness, billing webhook idempotency, unsubscribe token round-trip.

### Known limitations
- End-to-end integration test against a live Shopify dev store is not in CI (requires manual credentials).
- Lighthouse accessibility + performance scores not asserted in CI (run locally before submission).
- Shopify App Store screenshots and demo video are content deliverables produced outside the codebase.
