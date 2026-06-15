# DemandRadar

A Shopify App Store product that turns failed-search signals into revenue: identifies product gaps, applies keyword fixes via Shopify Search & Discovery, and surfaces a weekly revenue-impact digest.

## Stack

- Next.js 14 (App Router) + TypeScript strict
- Shopify Polaris v12 + App Bridge v4 (embedded)
- @shopify/shopify-api v11
- Prisma + PostgreSQL 16
- BullMQ + Redis
- tRPC v11 + Zod
- Pino structured logging
- Vitest

## Prerequisites

- Node 20+, pnpm 9+
- Docker (for Postgres/Redis)
- A Shopify Partner account with an app created.
- For embedded local dev, prefer Shopify CLI with the local config in `shopify.app.local.toml`. It already points at `https://localhost:3000` and lets Shopify update app URLs during dev.
- If you are not using Shopify CLI dev, set the app's **Allowed redirection URL** to `${SHOPIFY_APP_URL}/api/auth/callback` and ensure all app/webhook URLs point at the same host.

## Setup

```bash
cp .env.example .env
# Fill in SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL
# Generate SESSION_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

pnpm install
pnpm docker:up              # Postgres + Redis
pnpm prisma:migrate         # create tables
pnpm prisma:seed            # dev fixture store + fake search queries
pnpm dev                    # Next.js on :3000
pnpm worker                 # (optional) BullMQ workers in a second terminal
```

If you use Shopify CLI local dev, run the app against `shopify.app.local.toml` so Shopify keeps the embedded app URLs aligned with `https://localhost:3000`.

Install the app by visiting `${SHOPIFY_APP_URL}/api/auth?shop=<your-dev-store>.myshopify.com`. Shopify will prompt for scope approval, redirect back through `/api/auth/callback`, register the mandatory GDPR webhooks, and drop you into the embedded dashboard.

For onboarding to complete locally, run both the web app and the worker:

```bash
pnpm dev
pnpm worker
```

Without the worker, onboarding will stay partially complete because the ingestion jobs remain queued.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` | Production build (includes `prisma generate`) |
| `pnpm start` | Run production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest |
| `pnpm prisma:migrate` | Apply schema in dev |
| `pnpm prisma:seed` | Seed a dev store |
| `pnpm worker` | Start BullMQ workers |
| `pnpm docker:up` / `docker:down` | Manage infra |

## Deploying to Coolify (self-hosted)

1. Point Coolify at this repo. Build target: `docker/Dockerfile`. Expose port 3000.
2. Attach managed Postgres 16 and Redis 7 services; set `DATABASE_URL` and `REDIS_URL` to their internal URLs.
3. Set `SHOPIFY_APP_URL` to your public HTTPS domain; update the Shopify Partner Dashboard to match.
4. Set `SESSION_SECRET` (64 hex chars) — rotating it invalidates all stored access tokens.
5. Run `pnpm prisma:deploy` as a post-deploy hook.
6. Run the worker as a separate service: same image, `CMD ["node", "jobs/worker.js"]` (or `pnpm worker` in dev).

## Data ingestion pipeline

On install (and on cron), a BullMQ worker pulls three data streams from Shopify:

| Job | What it pulls | Cron (UTC) | Notes |
|---|---|---|---|
| `ingest:products` | Full catalog via Bulk Operation API | 04:{stagger} daily | Min 24h between runs; generates 384-dim MiniLM embeddings locally (no external API) |
| `ingest:orders` | 90-day orders via GraphQL pagination | 03:00 daily | Pins to shop primary currency; refunded/voided excluded; `aov_cents = NULL` if < 10 orders (`insufficient_aov` flag set) |
| `ingest:search` | ShopifyQL over `online_store_search_analytics` | 02:00 daily | Requires Search & Discovery app; returns empty-but-successful if not installed |

**Guarantees:**
- Idempotent: re-running produces the same DB state (unique index on `(store_id, query_normalized, date_bucket)` for search; upsert on `(store_id, shopify_product_id)` for products).
- Per-store mutex in Redis — no two ingestion jobs run concurrently for the same shop.
- Rate-limit safe: reads `extensions.cost.throttleStatus` on every GraphQL response and sleeps before `currentlyAvailable` crosses 100.
- Retries: 429 → exponential backoff with jitter (max 3). 5xx → same. GraphQL `THROTTLED` code → treated as 429.
- DLQ: after exhausting retries, the job is moved to `dead-letter` queue and an alert log (`dlq: true`) is emitted.

### Running ingestion locally

```bash
pnpm docker:up
pnpm prisma:deploy        # includes pgvector bootstrap migration
pnpm prisma:seed
pnpm worker               # BullMQ worker; cron jobs auto-seeded on boot
```

### GraphQL types

Admin API types are generated from the 2025-04 schema:

```bash
pnpm codegen
```

The generated `lib/shopify/generated/admin.ts` is committed. Ingestion modules currently carry hand-written response interfaces; swap them for the generated types after the first `pnpm codegen` run.

### Ingestion observability

| Signal | Where |
|---|---|
| Per-job progress (0-100) | `ingestion_runs.progress_pct`, exposed via `onboarding.status` tRPC |
| Request cost / throttle level | `logger.debug({ cost, available }, 'shopify.graphql')` |
| DLQ alerts | Log events matching `dlq: true, queue: ingestion` |

## Repo layout

```
app/                    Next.js App Router pages + API routes
  api/auth/             OAuth init + callback
  api/webhooks/         Mandatory GDPR + app/uninstalled
  api/trpc/[trpc]/      tRPC HTTP handler
lib/                    Shared libs (env, logger, crypto, shopify)
  shopify/              OAuth, HMAC, session token, store upsert
  trpc/                 Client + provider
server/                 tRPC routers + context
prisma/                 Schema + seed
jobs/                   BullMQ queues, worker, processor stubs
docker/                 Dockerfile + docker-compose
tests/                  Vitest specs
.github/workflows/      CI
```

## Conventions

- Strict TypeScript; no `any`, no `@ts-ignore`.
- Polaris components only — no other UI libraries.
- Never call Shopify from the browser; always proxy through `/api/*`.
- No `console.log` — use the Pino `logger` from `lib/logger.ts`.
- Every env var goes through `lib/env.ts` (Zod). App refuses to boot with a bad config.

## Production hardening

See these for details on the production-grade story:
- [SECURITY.md](./SECURITY.md) — threat model, CSP, rate limits, session JWT validation
- [ARCHITECTURE.md](./ARCHITECTURE.md) — diagrams, data flow, module boundaries
- [RUNBOOK.md](./RUNBOOK.md) — on-call procedures
- [docs/BFS_CHECKLIST.md](./docs/BFS_CHECKLIST.md) — Built-for-Shopify self-audit
- [docs/PII_INVENTORY.md](./docs/PII_INVENTORY.md) — every piece of stored data, retention
- [docs/APP_LISTING.md](./docs/APP_LISTING.md) — Shopify App Store submission copy
- [docs/CHAOS_SCENARIOS.md](./docs/CHAOS_SCENARIOS.md) — chaos tests to run before release
- [CHANGELOG.md](./CHANGELOG.md), [CONTRIBUTING.md](./CONTRIBUTING.md)

### Extra scripts

```bash
pnpm audit --audit-level high   # dependency vulnerability check
k6 run scripts/load-test.k6.js  # 500-VU dashboard load test
pnpm test tests/                # vitest — security, engine, email, UI suites
```

### Production deploy (Coolify)

```bash
# From Coolify: git push → auto-build from docker/Dockerfile
# Point Coolify at docker/docker-compose.prod.yml as the orchestration file
# Set all env vars from .env.example in Coolify's secrets UI
# First deploy runs prisma migrate deploy as a pre-start hook
```
