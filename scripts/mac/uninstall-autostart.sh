#!/bin/bash
# Stops and removes the JobApp launchd agents installed by install-autostart.sh.
# (Leaves Homebrew's Postgres service alone.)
UID_NUM="$(id -u)"
for svc in api worker tunnel; do
  label="com.jobapp.$svc"
  launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null && echo "stopped $label"
  rm -f "$HOME/Library/LaunchAgents/$label.plist"
done
echo "Removed. Logs are still in ~/Library/Logs/JobApp/"
