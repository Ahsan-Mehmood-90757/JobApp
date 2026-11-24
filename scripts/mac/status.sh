#!/bin/bash
# Quick health check of the JobApp backend services.
echo "== launchd agents (PID, last exit, label)"
launchctl list | grep -E "com\.jobapp\.|postgresql" || echo "none installed"
echo
printf "Postgres: "; pg_isready -q && echo "up" || echo "DOWN"
printf "API:      "; curl -sf http://localhost:4000/health >/dev/null && echo "up (http://localhost:4000)" || echo "DOWN"
printf "Tunnel:   "
URL="$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | sed -n 's/.*"public_url":"\([^"]*\)".*/\1/p' | head -1)"
if [ -n "$URL" ]; then echo "up ($URL)"; else echo "DOWN"; fi
echo
echo "Logs: ~/Library/Logs/JobApp/{api,worker,tunnel}.log"
