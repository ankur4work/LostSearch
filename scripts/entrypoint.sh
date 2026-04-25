#!/bin/sh
set -e

# Single container image, two runtime modes.
# Coolify sets APP_MODE=worker on the worker app; web app leaves it unset.

case "${APP_MODE:-web}" in
  worker)
    echo "[entrypoint] starting BullMQ worker (APP_MODE=worker)"
    # `.bin/tsx` is a sh shim that invokes node itself — calling it via
    # `node node_modules/.bin/tsx` would try to parse shell as JS. Run direct.
    exec node_modules/.bin/tsx jobs/worker.ts
    ;;
  web|*)
    echo "[entrypoint] starting Next.js web server (APP_MODE=${APP_MODE:-web})"
    exec pnpm start
    ;;
esac
