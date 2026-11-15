#!/usr/bin/env bash
# Stop the backend and frontend started by start.sh.
#   ./stop.sh            keep the sandbox container running (fast next start)
#   ./stop.sh --sandbox  also remove the sandbox container (its image cache volume is kept)

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/tmp/logs"

stop_tree() {
  local pid="$1"
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    stop_tree "$child"
  done
  kill "$pid" 2>/dev/null
}

stop_pid() {
  local name="$1"
  local pidfile="$LOGS/${name}.pid"
  if [ -f "$pidfile" ]; then
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      stop_tree "$pid" && echo "[dockermissions] Stopped $name (pid $pid)"
    else
      echo "[dockermissions] $name was not running"
    fi
    rm -f "$pidfile"
  else
    echo "[dockermissions] No pid file for $name"
  fi
}

stop_pid backend
stop_pid frontend

# Fallback for processes started without pid files — only this project's processes.
pkill -f "$ROOT/backend/node_modules/.bin/tsx" 2>/dev/null && echo "[dockermissions] Killed stray backend process" || true
pkill -f "$ROOT/frontend/node_modules/.bin/vite" 2>/dev/null && echo "[dockermissions] Killed stray frontend process" || true

if [ "$1" = "--sandbox" ]; then
  docker rm -f dockermissions-sandbox >/dev/null 2>&1 && echo "[dockermissions] Removed sandbox container"
fi

# Wait for the backend port to be free before returning
for _ in $(seq 1 10); do
  curl -s "http://127.0.0.1:${PORT:-3001}/api/health" > /dev/null 2>&1 || break
  sleep 0.5
done
