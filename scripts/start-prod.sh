#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8901}"
HOST="${HOST:-127.0.0.1}"

echo "==> Building frontend (production bundle)"
cd "$ROOT/frontend"
npm ci
npm run build

echo "==> Starting backend on http://${HOST}:${PORT} (serves API + static frontend)"
cd "$ROOT/backend"
export FRONTEND_DIST="$ROOT/frontend/dist"
export SERVE_FRONTEND=true
uv sync
uv run uvicorn main:app --host "$HOST" --port "$PORT"
