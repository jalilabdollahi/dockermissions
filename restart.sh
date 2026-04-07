#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

"$ROOT/stop.sh"
sleep 1
"$ROOT/start.sh"
