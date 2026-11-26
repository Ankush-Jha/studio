#!/usr/bin/env bash
# Start the Studio Desk in the background (idempotent). Prints the URL.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$DIR/.desk.pid"
LOG_FILE="$DIR/.desk.log"
URL="http://127.0.0.1:${DESK_PORT:-4747}"
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Studio Desk already running (pid $(cat "$PID_FILE")): $URL"
  exit 0
fi
if lsof -nP -iTCP:"${DESK_PORT:-4747}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port ${DESK_PORT:-4747} is already in use by another process:" >&2
  lsof -nP -iTCP:"${DESK_PORT:-4747}" -sTCP:LISTEN >&2 || true
  echo "If that is an old Desk, stop it first (kill the pid above), then rerun." >&2
  exit 1
fi
cd "$DIR"
nohup node "$DIR/server.mjs" >>"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"
for _ in $(seq 1 40); do
  if curl -fsS "$URL/api/state" -o /dev/null 2>/dev/null; then
    echo "Studio Desk running (pid $(cat "$PID_FILE")): $URL"
    exit 0
  fi
  sleep 0.15
done
echo "Studio Desk started (pid $(cat "$PID_FILE")) but did not answer yet; see $LOG_FILE" >&2
echo "$URL"
