# Architecture

## High-level

```
+-------------------+        +------------------+
| Shopify Admin UI  |        | Shopify Admin API|
| (embeds our app)  |        |  (GraphQL 2025-04)|
+---------+---------+        +--------+---------+
          | session JWT                 | access token (AES-256-GCM at rest)
          v                             v
+-------------------+          +------------------+
|  Next.js 14 app   |<-------->|   Shopify client |
|  (App Router)     |  HTTPS   |  (rate-limited,  |
|  - React UI       |          |   retry, logged) |
|  - tRPC v11       |          +------------------+
|  - REST: webhooks |                    ^
+---+----------+----+                    |
    |          |                         |
    | Prisma   | Redis                   |
    v          v                         |
+--------+  +-------+        +------------------+
|Postgres|  | Redis |<------>|   BullMQ workers |
|pgvector|  | (cache|        |  - ingest:search |
|        |  |  +bq) |        |  - ingest:orders |
+--------+  +-------+        |  - ingest:products|
                             |  - classify:store|
                             |  - digest:weekly |
                             |  - redact-purge  |
                             +------------------+
```

## Data flow: install → first insight

```
1. Merchant clicks "Install" in Shopify App Store
   → GET /api/auth?shop=foo.myshopify.com
   → mint OAuth state in Redis (TTL 5min)
   → 302 to shop/admin/oauth/authorize

2. Merchant approves scopes on Shopify
   → GET /api/auth/callback?code=…&state=…&hmac=…
   → verify HMAC (timing-safe)
   → consume-and-delete state from Redis (single-use)
   → exchange code → access token
   → AES-256-GCM encrypt + upsert Store row
   → register 5 mandatory webhooks (app/uninstalled + 3 GDPR + app_subscriptions/update)
   → enqueue install backfill (products, orders, search in parallel, mutex-serialized)
   → redirect to /onboarding

3. Onboarding (polls onboarding.status every 3s)
   → ingest:products: bulk op → JSONL stream → stripHtml → MiniLM embeddings → upsert
   → ingest:orders: paginated → excludes refunded/voided → computes aov_cents
   → ingest:search: ShopifyQL → per-day upsert on (store, query_norm, day)
   → Each terminal DONE transition maybe fires onboarding_completed.
   → Last ingest:search completion enqueues classify:store.

4. Classification pipeline (see lib/engine/pipeline.ts)
   → aggregate 30-day queries → per-query classify() + estimateRevenue()
   → upsert classifications + revenue_estimates (both idempotent)
   → invalidate dash:summary:v1:{storeId}
   → publish classification.complete on Redis pub/sub
   → onboarding.status reports ready=true
   → frontend redirects /onboarding → /

5. Dashboard
   → summary (60s Redis cache) → RevenueHero + counts
   → gaps (type filter, free-tier blur-lock, revenue bucket)
   → trend (per-query sparkline, modal only)
```

## Job pipeline

```
install flow:
  OAuth callback ──► ingestionQueue.add × 3 (products, orders, search)
                         │
                         └─► per-store Redis mutex (10min TTL)
                              │
                              ▼
            ┌─────────────────┼─────────────────┐
      ingest:products    ingest:orders     ingest:search
            │                 │                 │
            └──► finishRun(DONE) ──────────────┘
                              │
                              ▼
                 if all 3 jobs DONE for this store:
                    track('onboarding_completed')

post-ingest search:
  ingest:search DONE ──► classifyQueue.add ──► classify:store
                                                │
                                                ▼
                                      pipeline → upsert → invalidate cache

scheduled:
  0 2 * * * (UTC)  ingest:search   per store
  0 3 * * * (UTC)  ingest:orders   per store
  N 4 * * * (UTC)  ingest:products per store (staggered by index)
  0 9 * * 1 (TZ)   digest:weekly   per store, in-TZ
  0 1 * * * (UTC)  redact-purge    delete stores past 48h window
```

## Modules

| Module | Responsibility |
|---|---|
| `lib/env.ts` | Zod env schema — fail-fast at boot |
| `lib/shopify/client.ts` | ShopifyClient class (rate-limit, retry, cost-aware) |
| `lib/shopify/bulk.ts` | Bulk Operation API with JSONL streaming |
| `lib/shopify/session.ts` | Session-token JWT validation (iss, aud, exp, dest/iss host match) |
| `lib/shopify/hmac.ts` | OAuth and webhook HMAC verification (timing-safe) |
| `lib/crypto.ts` | AES-256-GCM envelope encryption |
| `lib/ingestion/*` | Search analytics, orders, products, embeddings, normalization |
| `lib/engine/*` | Classifier (pure), revenue estimator (pure), pipeline (orchestrator) |
| `lib/email/*` | Resend/SMTP, React-Email templates, unsubscribe tokens |
| `lib/rate-limit.ts` | Redis token bucket, merchant + public variants |
| `lib/cache.ts` | Read-through Redis JSON cache |
| `lib/metrics.ts` | Prometheus histograms/counters/gauges |
| `lib/request-context.ts` | AsyncLocalStorage for request_id + shop_domain |
| `server/routers/*` | tRPC routers (dashboard, onboarding, synonyms, billing) |
| `jobs/*` | BullMQ queues, workers, processors, scheduler |
| `app/*` | Next.js App Router pages + API routes |

## Deployment

- **Coolify** manages a 3-service stack: `app`, `worker`, `postgres`, `redis`, `backup`.
- **Zero-downtime deploys**: Coolify rolling strategy; app healthcheck at `/api/health?strict=1` gates promotion.
- **Migrations**: `pnpm prisma:deploy` runs as a pre-start hook; no app traffic until migrations complete.
- **Secrets**: all via Coolify env UI. Never in Git.
- **Backups**: sidecar container runs nightly pg_dump → B2. Optional client-side age encryption.

## Observability

- **Logs**: Pino JSON, every line tagged with `request_id`, `shop_domain`, `store_id` via AsyncLocalStorage.
- **Metrics**: Prometheus text at `/api/metrics` (bearer-auth in prod). Key series: `sfm_ingestion_job_duration_seconds`, `sfm_classification_latency_seconds`, `sfm_shopify_requests_total`, `sfm_active_stores`, `sfm_revenue_surfaced_cents`.
- **Errors**: Sentry optional via `SENTRY_DSN`. PII scrubbed in `beforeSend`.
- **Uptime**: UptimeRobot probes `/api/health` every 1 min.
- **Audit**: `billing_events`, `ingestion_runs`, `synonyms_applied` (append-only) form the audit trail.
