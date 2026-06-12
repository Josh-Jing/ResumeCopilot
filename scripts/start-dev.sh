#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8911}"
FRONTEND_PORT="${FRONTEND_PORT:-5174}"
FORCE=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [--force]

  --force   Stop any process listening on the dev backend/frontend ports
            (${BACKEND_PORT} / ${FRONTEND_PORT}) before starting.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

free_port() {
  local port="$1"
  local -a pids=()
  local pid

  while IFS= read -r pid; do
    [[ -n "$pid" ]] && pids+=("$pid")
  done < <(lsof -ti tcp:"${port}" -sTCP:LISTEN 2>/dev/null || true)

  if ((${#pids[@]} == 0)); then
    return 0
  fi

  echo "==> --force: stopping listener(s) on port ${port}: ${pids[*]}"
  kill "${pids[@]}" 2>/dev/null || true
  sleep 0.5

  pids=()
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && pids+=("$pid")
  done < <(lsof -ti tcp:"${port}" -sTCP:LISTEN 2>/dev/null || true)

  if ((${#pids[@]} > 0)); then
    kill -9 "${pids[@]}" 2>/dev/null || true
  fi
}

if [[ "$FORCE" == true ]]; then
  free_port "$BACKEND_PORT"
  free_port "$FRONTEND_PORT"
fi

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
