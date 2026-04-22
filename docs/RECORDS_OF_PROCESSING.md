# Records of Processing Activities (GDPR Article 30)

_Internal document. Not published. Reviewed quarterly._
_Last reviewed: 2026-04-22._

## 1. Controller

| | |
|---|---|
| Name | Search Failure Miner (trading entity: see legal entity record) |
| Primary address | See `COMPANY_ADDRESS` env var |
| Privacy officer | see `PRIVACY_CONTACT_EMAIL` |

## 2. Processing purposes

| Purpose | Lawful basis |
|---|---|
| Analyse shopper search queries on the merchant's storefront to surface product gaps and revenue estimates | Legitimate interest (of the merchant, our direct customer) |
| Send weekly digest emails to the merchant | Legitimate interest + opt-out available at any time |
| Billing via Shopify | Contract performance |
| Error tracking (Sentry) and analytics (PostHog) | Legitimate interest |

## 3. Categories of data subjects

- **Merchants** (shop owner / operator): business contact (email, shop domain).
- **Shoppers** (end consumers): **NOT a data subject for this app.** We do not store shopper identifiers. Search query strings are retained at the aggregate-query level, not linked to any shopper.

## 4. Categories of personal data

See `docs/PII_INVENTORY.md`.

## 5. Recipients

See sub-processor table in `PII_INVENTORY.md`.

## 6. International transfers

| Transfer | Safeguard |
|---|---|
| EU → US (Resend, Sentry) | SCCs (Standard Contractual Clauses) in sub-processor DPAs |
| IN → US (Backblaze B2) | SCCs + client-side encryption (age) |

## 7. Retention schedule

| Data | Retention |
|---|---|
| Active store data | Life of install + 30 days |
| Billing audit log | 7 years (tax requirement) |
| Error traces (Sentry) | 90 days (Sentry default) |
| Product analytics (PostHog) | 7 years (PostHog default; can reduce) |
| DB backups | 30 days |

## 8. Technical and organisational measures

- AES-256-GCM encryption of access tokens at rest.
- TLS 1.2+ for all inbound and Shopify egress.
- Session-token-bound access for all merchant endpoints; admin console behind email allowlist + proxy-layer auth.
- HMAC verification on all webhooks.
- PII scrubbed from Sentry payloads before egress.
- Least-privilege DB role for app (no DDL).
- Nightly encrypted backups; tested restore quarterly (see `RUNBOOK.md`).

## 9. Incident response

See `RUNBOOK.md` §"Security incident."

## 10. Review schedule

Quarterly review. Material changes require a new DPIA (Data Protection
Impact Assessment) — template in `docs/DPIA_TEMPLATE.md` (to be created
when the first material change lands).
