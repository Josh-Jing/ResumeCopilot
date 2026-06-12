#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8911}"
FRONTEND_PORT="${FRONTEND_PORT:-5174}"

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then kill "$BACKEND_PID" 2>/dev/null || true; fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then kill "$FRONTEND_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

echo "==> Dev backend :${BACKEND_PORT} (data: ${ROOT}/examples)"
cd "$ROOT/backend"
export RESUME_COPILOT_HOME="$ROOT/examples"
export SERVE_FRONTEND=false
uv sync
uv run uvicorn main:app --host 127.0.0.1 --port "$BACKEND_PORT" --reload &
BACKEND_PID=$!

echo "==> Dev frontend :${FRONTEND_PORT} (proxy /api -> :${BACKEND_PORT})"
cd "$ROOT/frontend"
npm ci
VITE_RESUME_COPILOT_BACKEND="http://127.0.0.1:${BACKEND_PORT}" \
  VITE_DEV_PORT="$FRONTEND_PORT" \
  npm run dev &
FRONTEND_PID=$!

echo ""
echo "ResumeCopilot dev ready:"
echo "  UI:      http://127.0.0.1:${FRONTEND_PORT}"
echo "  API:     http://127.0.0.1:${BACKEND_PORT}/api/health"
echo ""
wait
