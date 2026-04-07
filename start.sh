#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/tmp/logs"
mkdir -p "$LOGS"

echo "[dockermissions] Starting backend..."
cd "$ROOT/backend"
nohup npx tsx src/index.ts > "$LOGS/backend.log" 2>&1 &
echo $! > "$LOGS/backend.pid"

echo "[dockermissions] Starting frontend..."
cd "$ROOT/frontend"
nohup npx vite --host 0.0.0.0 > "$LOGS/frontend.log" 2>&1 &
echo $! > "$LOGS/frontend.pid"

echo "[dockermissions] Both services started."
echo "  Backend  → http://localhost:3000  (log: tmp/logs/backend.log)"
echo "  Frontend → http://localhost:5173  (log: tmp/logs/frontend.log)"
