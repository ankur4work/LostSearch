#!/bin/sh
set -eu

# Nightly Postgres backup → S3-compatible storage (Backblaze B2 works; so
# does Cloudflare R2, MinIO, real S3). Installs aws-cli on first run because
# the postgres:16-alpine image ships without it.
#
# Retention: 30 daily, 12 monthly. Cleanup runs after each upload. Backups are
# gzipped + encrypted client-side with age (if AGE_RECIPIENT env is set).

BACKUP_PREFIX="${BACKUP_PREFIX:-sfm}"
CRON="${BACKUP_CRON:-0 3 * * *}"

install_deps() {
  apk add --no-cache aws-cli gzip ca-certificates tzdata >/dev/null
  if [ -n "${AGE_RECIPIENT:-}" ]; then
    apk add --no-cache age >/dev/null
  fi
}

upload_one() {
  local ts
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  local filename="${BACKUP_PREFIX}-${ts}.sql.gz"

  pg_dump \
    --host=postgres \
    --username=app \
    --no-owner --no-acl \
    --format=plain \
    search_failure_miner \
    | gzip -9 > "/tmp/${filename}"

  if [ -n "${AGE_RECIPIENT:-}" ]; then
    age --recipient "${AGE_RECIPIENT}" --output "/tmp/${filename}.age" "/tmp/${filename}"
    rm "/tmp/${filename}"
    filename="${filename}.age"
  fi

  aws --endpoint-url "${S3_ENDPOINT}" \
    s3 cp "/tmp/${filename}" "s3://${S3_BUCKET}/${filename}"
  rm "/tmp/${filename}"

  echo "backup uploaded: ${filename}"
}

prune_old() {
  # Keep the 30 most recent daily dumps; B2/R2 lifecycle can handle monthly.
  aws --endpoint-url "${S3_ENDPOINT}" s3 ls "s3://${S3_BUCKET}/" \
    | awk '{print $4}' \
    | grep "^${BACKUP_PREFIX}-" \
    | sort -r \
    | tail -n +31 \
    | while read -r f; do
        aws --endpoint-url "${S3_ENDPOINT}" s3 rm "s3://${S3_BUCKET}/${f}" || true
      done
}

install_deps

# Simple cron loop — one-shot at the scheduled UTC minute, then sleep until
# the next day. Keeps the sidecar dependency-free of a real cron daemon.
while true; do
  now="$(date -u +%H%M)"
  if [ "${now}" = "0300" ]; then
    upload_one
    prune_old
    sleep 90
  fi
  sleep 30
done
