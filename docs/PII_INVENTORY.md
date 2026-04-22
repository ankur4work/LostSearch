# PII inventory

Inventory of every piece of personal data Search Failure Miner stores. Reviewed
quarterly; last review 2026-04-22.

| Data | Column(s) | Source | Purpose | Retention | Access |
|---|---|---|---|---|---|
| Shop domain | `stores.shop_domain` | OAuth install | Identify the merchant | Life of install + 30d | App code + admin UI |
| Merchant email | `stores.merchant_email` | Shopify Admin `shop { email }` | Digest delivery, support | Life of install + 30d | App code + admin UI |
| Offline access token | `stores.access_token` | OAuth exchange | Call Shopify API | Deleted on uninstall | **AES-256-GCM encrypted**, only decrypted in process memory |
| Product metadata | `catalog_products.*` | Shopify Admin API | Match queries to products | 24h rolling sync | App code |
| Search query strings | `search_queries.query` | Shopify Search analytics | Classification input | 30d rolling | App code |
| Order aggregates | computed → `stores.aov_cents` | Shopify Admin API | Revenue formula | 90d window (aggregates only) | App code |
| Classifications | `classifications.*` | Computed | Dashboard | Life of install + 30d | Merchant (own shop only) |
| Billing events | `billing_events.*` | Shopify Billing | Audit | Life of install + 7y (tax) | App code, admin UI |
| Digest send history | `digest_log.*` | App | Dedup + unsubscribe audit | 2 years | App code |

## Not stored (by policy)

- Customer names
- Customer emails
- Customer addresses
- Customer phone numbers
- Payment card details (handled by Shopify)
- Cart contents
- Session IDs

## Processor list (sub-processors)

| Vendor | Purpose | Data transferred |
|---|---|---|
| Shopify | Source + integration | shop domain, access token scope |
| Coolify-hosted VPS | App runtime | all app data |
| Resend | Email delivery | merchant email, digest body |
| PostHog | Analytics (optional) | opaque store_id, event names + numeric properties |
| Sentry | Error tracking (optional) | exception traces (scrubbed of tokens) |
| Backblaze B2 / S3-compatible | DB backups | encrypted DB snapshots |

## Subject rights workflow

- **Access/export**: in-app Settings → Privacy → Export my data (`POST /api/privacy/export`).
- **Deletion**: merchant uninstalls the app; hard delete fires 30d later OR immediately on Shopify `shop/redact`. Reinstall within 48h cancels deletion.
- **Rectification**: shop domain, email are sourced from Shopify — fix in Shopify and re-sync.
- **Objection**: unsubscribe link in every digest (`/unsubscribe?token=...`).

## Contact

Privacy officer: see `PRIVACY_CONTACT_EMAIL` env var (default: privacy@searchfailureminer.app).
