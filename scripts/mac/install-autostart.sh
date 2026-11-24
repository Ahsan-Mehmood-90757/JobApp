#!/bin/bash
# Installs three launchd agents so JobApp's backend starts when you log in to this Mac and is
# restarted automatically if it crashes:
#   com.jobapp.api     API server (port 4000), after making sure Postgres is up
#   com.jobapp.worker  job ingestion every 4h + daily dead-link sweep
#   com.jobapp.tunnel  ngrok tunnel giving the API a public https address
# Postgres itself is started by Homebrew's own agent (brew services start postgresql@17).
#
# Logs: ~/Library/Logs/JobApp/   Remove with: scripts/mac/uninstall-autostart.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs/JobApp"
UID_NUM="$(id -u)"
mkdir -p "$AGENTS" "$LOGS"
chmod +x "$HERE"/*.sh

# launchd starts with a bare PATH: include where node, brew, ngrok and psql live on this machine.
NODE_DIR="$(dirname "$(node -p process.execPath)")"
BREW_PREFIX="$(brew --prefix)"
SVC_PATH="$NODE_DIR:$BREW_PREFIX/bin:$BREW_PREFIX/sbin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# Postgres should come up on its own at login too.
brew services start postgresql@17 >/dev/null 2>&1 || true

for svc in api worker tunnel; do
  label="com.jobapp.$svc"
  plist="$AGENTS/$label.plist"
  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$HERE/run-service.sh</string>
    <string>$svc</string>
  </array>
  <key>WorkingDirectory</key><string>$HERE</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$SVC_PATH</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>StandardOutPath</key><string>$LOGS/$svc.log</string>
  <key>StandardErrorPath</key><string>$LOGS/$svc.log</string>
</dict>
</plist>
PLIST
  launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$UID_NUM" "$plist"
  echo "installed $label"
done

echo
echo "Done. Services start at login and restart if they crash. Logs: $LOGS"
echo "Status: $HERE/status.sh"
