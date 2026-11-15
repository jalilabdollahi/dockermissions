#!/usr/bin/env bash
# Start the DockerMissions backend (API + terminal relay) and frontend in the background.
# Both bind to localhost only: the backend hands out shells, so it must not be reachable from the network.
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/tmp/logs"
mkdir -p "$LOGS"

if ! docker info >/dev/null 2>&1; then
  echo "[dockermissions] Docker is not running. Start Docker Desktop (or your Docker engine) first." >&2
  exit 1
fi

if [ ! -f "$ROOT/backend/missions/data/catalog.json" ]; then
  node "$ROOT/scripts/build-catalog.mjs"
fi

echo "[dockermissions] Starting backend..."
cd "$ROOT/backend"
nohup env PORT="${PORT:-3001}" HOST="${HOST:-127.0.0.1}" npm run dev > "$LOGS/backend.log" 2>&1 &
echo $! > "$LOGS/backend.pid"

echo "[dockermissions] Starting frontend..."
cd "$ROOT/frontend"
nohup npm run dev -- --host "${FRONTEND_HOST:-localhost}" --strictPort > "$LOGS/frontend.log" 2>&1 &
echo $! > "$LOGS/frontend.pid"

echo "[dockermissions] Both services started."
echo "  Backend  → http://127.0.0.1:${PORT:-3001}  (log: tmp/logs/backend.log)"
echo "  Frontend → http://localhost:5173  (log: tmp/logs/frontend.log)"
echo "  The first mission start builds the sandbox image and can take a minute."
