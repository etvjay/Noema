#!/usr/bin/env bash
# Idempotent launcher for the agy daemon. Safe to run from a devcontainer
# postStartCommand (runs on every container start/restart).
set -euo pipefail

for pid in $(pgrep -f "[p]ython3 /workspaces/Noema/tools/agy-agent-daemon.py" || true); do
  kill "$pid" 2>/dev/null || true
done
sleep 1
pkill -x agy 2>/dev/null || true

if pgrep -f "[p]ython3 /workspaces/Noema/tools/agy-agent-daemon.py" >/dev/null 2>&1; then
  echo "agy daemon already running"
  exit 0
fi

nohup python3 /workspaces/Noema/tools/agy-agent-daemon.py --continue \
  > /workspaces/Noema/tools/agy-daemon.out 2>&1 &
echo "agy daemon started (pid $!)"
