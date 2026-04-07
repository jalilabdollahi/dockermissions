#!/usr/bin/env bash

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/tmp/logs"

stop_pid() {
  local name="$1"
  local pidfile="$LOGS/${name}.pid"
  if [ -f "$pidfile" ]; then
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" && echo "[dockermissions] Stopped $name (pid $pid)"
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

# Fallback: kill any stray tsx/vite processes if PID files were missing
pkill -f "tsx.*src/index" 2>/dev/null && echo "[dockermissions] Killed stray backend process" || true
pkill -f "vite"           2>/dev/null && echo "[dockermissions] Killed stray frontend process" || true

# Wait for port 3000 to be free before returning
for i in $(seq 1 10); do
  curl -s http://localhost:3000/api/health > /dev/null 2>&1 || break
  sleep 0.5
done
