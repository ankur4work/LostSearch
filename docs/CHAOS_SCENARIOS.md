# Chaos scenarios — pre-submission tests

Run each before App Store submission, each quarter after.

## 1. 1000 stores install within 1 hour

**Setup**: script below spawns 1000 ingestion jobs against a seed test store
image (cloned 1000×).

**Expected**:
- ingestion queue depth rises then drains as workers catch up
- no errors in logs except the expected Shopify 429 backoffs
- no per-store jobs blocked longer than the 10-min mutex TTL
- DLQ stays empty

**Command**:
```
node -e "
  const { ingestionQueue } = require('./jobs/queue');
  (async () => {
    for (let i = 0; i < 1000; i += 1) {
      await ingestionQueue.add('ingest:search', { storeId: \`chaos_\${i}\`, sinceDays: 30, origin: 'manual' });
    }
  })();
"
```

## 2. Shopify API returns 429 for 5 minutes

**Setup**: point `SHOPIFY_APP_URL` at a local reverse proxy that responds
with `429 Too Many Requests` for 5 minutes, then 200.

**Expected**:
- ShopifyClient logs "Shopify 429 — backing off" with exponential delays
- no job hits more than 3 retries inside the 5-min window
- jobs that hit the 3-retry ceiling land in DLQ
- after the window ends, DLQ entries can be manually re-enqueued and succeed
- no lost merchant data (ingestion runs for the failed window are marked FAILED with errorMessage)

## 3. Postgres goes down for 30 seconds

**Setup**: `docker compose stop postgres` then `docker compose start postgres` 30s later.

**Expected**:
- `/api/health` returns 503 during the outage (with `?strict=1`), 200 degraded without
- dashboard shows a graceful error boundary
- BullMQ jobs retry automatically via Prisma's reconnect behavior
- no data corruption after recovery
- `/api/health` returns to full 200 within 30 seconds of Postgres coming back

## 4. Redis goes down for 30 seconds

**Setup**: `docker compose stop redis` for 30s.

**Expected**:
- `/api/health` → `{redis: false}` but session validation and read-only dashboard paths continue (cache miss → compute from DB)
- rate limiting fails OPEN (no Redis = no limiter; this is intentional — we prefer availability over 429s)
- BullMQ workers pause; no jobs lost (durable via Redis AOF)
- on recovery, queue resumes processing with no manual intervention

## 5. Fuzzing the public endpoints

**Targets**: `/methodology`, `/privacy`, `/unsubscribe`, `/api/health`, `/api/webhooks/*`.

**Tool**: OWASP ZAP baseline scan:
```
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://staging.demandradar.solnix.store \
  -r zap-report.html
```

**Expected**:
- 0 high findings
- 0 medium findings
- Any "info"-level findings triaged in `docs/zap-triage.md`

## 6. Malicious shop-domain inputs

Already covered by `tests/shop-domain.test.ts` (15 attack variants). Run that
suite as part of the smoke check:
```
pnpm test tests/shop-domain.test.ts
```

## 7. Clock skew

**Setup**: run the app with system clock +10 minutes off from reality.

**Expected**:
- session tokens with `exp` slightly in the past still succeed (5s tolerance)
- session tokens with `exp` > 5s in the past are rejected
- OAuth `state` still single-use (time-independent)

## 8. Reinstall within 48h redact window

**Setup**: uninstall → wait 10 min → reinstall.

**Expected**:
- `scheduledRedactAt` cleared on reinstall (see `lib/shopify/store.ts`)
- all historical data intact
- classification resumes on first cron tick
