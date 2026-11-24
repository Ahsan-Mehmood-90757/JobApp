#!/bin/bash
# Make sure Homebrew Postgres is up before the API/worker start.
#
# After an unclean shutdown Postgres can refuse to start because its lock file (postmaster.pid)
# names a process ID that macOS has since given to a different program. If the PID in the lock
# file is not a Postgres process, the lock is stale and safe to remove.
set -u
PG_FORMULA="postgresql@17"
PGDATA="$(brew --prefix)/var/${PG_FORMULA}"
PIDFILE="${PGDATA}/postmaster.pid"

pg_isready -q && exit 0

if [ -f "$PIDFILE" ]; then
  PID="$(head -1 "$PIDFILE")"
  if ! ps -p "$PID" -o comm= 2>/dev/null | grep -q postgres; then
    echo "$(date '+%F %T') removing stale ${PIDFILE} (PID ${PID} is not postgres)"
    rm -f "$PIDFILE"
  fi
fi

brew services restart "$PG_FORMULA" >/dev/null 2>&1 || true

for _ in $(seq 1 60); do
  pg_isready -q && exit 0
  sleep 1
done
echo "$(date '+%F %T') Postgres did not come up" >&2
exit 1
