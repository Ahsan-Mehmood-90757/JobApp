#!/bin/bash
# Entry point used by the launchd agents (see install-autostart.sh).
#   run-service.sh api     -> API server on port 4000
#   run-service.sh worker  -> scheduled job ingestion + daily dead-link sweep
#   run-service.sh tunnel  -> ngrok tunnel to the API (public https address)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
TSX="$ROOT/node_modules/.bin/tsx"

case "${1:-}" in
  api)
    "$HERE/ensure-postgres.sh" || exit 1
    cd "$ROOT/apps/api" && exec "$TSX" src/server.ts
    ;;
  worker)
    "$HERE/ensure-postgres.sh" || exit 1
    cd "$ROOT/apps/api" && exec "$TSX" src/worker.ts
    ;;
  tunnel)
    # Wait for the API so testers never hit a tunnel with nothing behind it.
    for _ in $(seq 1 120); do
      curl -sf http://localhost:4000/health >/dev/null && break
      sleep 2
    done
    # With no --url, ngrok uses the account's free static dev domain.
    exec ngrok http 4000 --log stdout --log-level warn
    ;;
  *)
    echo "usage: $0 api|worker|tunnel" >&2
    exit 2
    ;;
esac
