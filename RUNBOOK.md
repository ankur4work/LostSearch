# Runbook

On-call procedures. Every scenario should be resolvable in < 30 minutes.

## Triage checklist (open first)

1. Coolify → app service → last 200 log lines. Look for `level: error` with a
   `request_id` — that ID correlates all downstream logs.
2. `https://<app>/api/health` — 200 with `degraded: true` tells you which
   dependency is down. 503 means the app can't find Postgres or Redis.
3. BullMQ queue state via Arena: `/api/admin/arena` (admin header required).
4. Sentry issues tab, filtered to production.

---

## "Merchant reports wrong dashboard numbers"

Symptom: merchant opens a support ticket saying the revenue hero is wrong / zero / stale.

1. Look up store in `/admin` — note `storeId`, `lastSearchSync`, `lastProductSync`, `lastOrderSync`, `insufficientAov`.
2. Check `ingestion_runs` for the store: the latest run per `jobType` should be `DONE`. If `FAILED`, read `errorMessage`.
3. If `insufficientAov=true`, that's correct — they have <10 orders in 90 days. Tell the merchant.
4. If the classification ran but numbers look off, run a manual re-classify:
   ```
   # in rails-like psql, trigger a fresh classify
   curl -X POST 'https://<app>/api/admin/reingest?storeId=<id>' \
     -H "X-Admin-Email: <your-email>"
   ```
   This clears the dashboard cache and runs the full pipeline.
5. If the aggregate seems right but one row is wrong, look at `classifications.reasoning` — it's the audit log of what rule fired.

Escalate if: numbers still wrong after a manual re-ingest + 5 min wait.

## "Ingestion job stuck"

Symptom: merchant sits on `/onboarding` forever, progress bar doesn't advance, or a BullMQ job is stuck in `active` state.

1. Check Arena → active list. Jobs with `startedAt` > 30 min old are suspect.
2. Check the per-store mutex in Redis: `redis-cli GET mutex:store:<storeId>`. If set, a worker crashed without releasing it. TTL is 10–30 min (varies by job); the lock will auto-expire.
3. If the TTL was already extended (products job), force-release:
   ```
   redis-cli DEL mutex:store:<storeId>
   ```
4. If a specific job repeatedly fails in the DLQ:
   ```
   redis-cli LRANGE bull:dead-letter:wait 0 -1
   ```
   Pick one, read the `originalError`, grep Sentry.
5. Shopify-side issues: check [Shopify status](https://www.shopifystatus.com/). A partial outage in their GraphQL tier is common enough to be a first suspect.

## "Shopify API outage"

Symptom: spike in `ShopifyAPIError` with status 429 / 502 / 503, jobs piling up in DLQ.

1. **Don't panic.** Our retry policy handles short outages (3 attempts with exp backoff + jitter). Let it run for 10 min.
2. If the DLQ grows past ~100, pause the ingestion workers (Arena → pause queue) to stop burning retries.
3. When Shopify is back, drain the DLQ manually:
   ```
   redis-cli LRANGE bull:dead-letter:wait 0 -1 | while read -r job; do
     # inspect, then re-enqueue via ingestionQueue.add()
   done
   ```
4. For extended outages (>1 hour): post a banner in `/admin/notices` (feature flag `ops.degraded_banner` = true; wire via `feature_flags` table).

## "Payment failed / merchant on wrong plan"

Symptom: merchant says they paid but dashboard shows FREE.

1. Check `billing_events` for the store — look for `charge_activated`, `sub_active`.
2. Check Shopify Partner Dashboard → Apps → Subscriptions for the shop — confirms Shopify's view.
3. If our `billing_events` lags Shopify: re-fire the webhook from Shopify's webhook tester against `/api/webhooks/app-subscriptions-update`. Our handler is idempotent.
4. If the callback never ran: verify the merchant was actually on HTTPS through the confirmation. Some merchants bookmark the confirmation URL instead of completing — send them a new `billing.createCharge` via support.

## "Redis down"

Symptom: `/api/health` shows `{redis: false}`, dashboard loads but ingestion/jobs/rate-limits fail.

- **Mode**: app stays up with degraded features. Sessions still validate (jwt). Rate limiting fails open (no Redis = no limiting). Dashboard cache misses and recomputes from DB. BullMQ jobs pause.
- **Fix**: restart Redis container. Data is durable via AOF (`--appendonly yes`). Re-check `/api/health` — should return to `{redis: true}` within 30s.
- **After restart**: cron-seeded repeatable jobs auto-reregister on next worker boot via `seedCronJobs()`.

## "Postgres down"

Symptom: `/api/health` shows `{postgres: false}`, every mutation fails, dashboard shows spinners.

- **Mode**: hard down. The app cannot serve meaningful pages.
- **Coolify**: restart Postgres container. If that doesn't recover, roll back to last night's backup (see below).
- **Restore from backup**:
  ```
  # get the latest dump from B2
  aws --endpoint-url "$S3_ENDPOINT" s3 cp s3://$S3_BUCKET/<latest>.sql.gz .
  gunzip <latest>.sql.gz
  # if age-encrypted: age --decrypt -i /path/to/identity > <latest>.sql
  psql -h postgres -U app -d search_failure_miner < <latest>.sql
  ```
- **Expected data loss**: up to 24h (last nightly snapshot). Merchants can tolerate this — the analytics is not real-time critical.

## "Security incident"

1. **Contain**: if a secret was committed, rotate immediately:
   - `SHOPIFY_API_SECRET` → regenerate in Partner Dashboard; every session token and webhook HMAC invalidates.
   - `SESSION_SECRET` → regenerate; all encrypted access tokens become unreadable (you'll re-OAuth on next login).
   - `METRICS_BEARER`, `RESEND_API_KEY` → rotate in Coolify env UI.
2. **Preserve**: `git log -S <leaked secret>` to find the commit; do NOT force-push history rewrite without team sign-off.
3. **Notify**: if PII accessed, email all affected merchants within 72h (GDPR Art. 33/34). Template in `docs/INCIDENT_NOTIFICATION.md`.
4. **Post-mortem**: within 7 days, write a blameless PM in `docs/incidents/YYYY-MM-DD-<slug>.md`.

## "Unsubscribe link not working"

1. Verify token signature locally: `node -e "require('./lib/email/unsubscribe-token').verifyUnsubscribeToken('<paste>')"`.
2. 90d expiry may have passed — mint a new one and email the merchant manually.
3. If Redis cache for the embedding was corrupted it won't affect unsubscribe (that's DB-only). Reset via the admin console.
