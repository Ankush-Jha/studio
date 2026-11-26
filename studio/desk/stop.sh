#!/usr/bin/env bash
# Stop the Studio Desk started by start.sh.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$DIR/.desk.pid"
if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    for _ in $(seq 1 30); do kill -0 "$PID" 2>/dev/null || break; sleep 0.1; done
    kill -0 "$PID" 2>/dev/null && kill -9 "$PID" 2>/dev/null || true
    echo "Studio Desk stopped (pid $PID)."
  else
    echo "Studio Desk was not running (stale pid $PID)."
  fi
  rm -f "$PID_FILE"
else
  echo "Studio Desk is not running (no pid file)."
fi
