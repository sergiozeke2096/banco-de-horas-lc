#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${HOME}/apps/lc-banco-horas"
CLOUDFLARED_DIR="${HOME}/.local/cloudflared"
CLOUDFLARED_BIN="${CLOUDFLARED_DIR}/cloudflared"
LOG_FILE="${APP_DIR}/cloudflared.log"

mkdir -p "${APP_DIR}" "${CLOUDFLARED_DIR}"

if [ ! -x "${CLOUDFLARED_BIN}" ]; then
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o "${CLOUDFLARED_BIN}"
  chmod +x "${CLOUDFLARED_BIN}"
fi

tmux kill-session -t lc-banco-horas-tunnel >/dev/null 2>&1 || true
tmux new-session -d -s lc-banco-horas-tunnel "cd '${APP_DIR}' && '${CLOUDFLARED_BIN}' tunnel --url http://127.0.0.1:3100 --no-autoupdate >> '${LOG_FILE}' 2>&1"

for _ in $(seq 1 30); do
  if grep -o 'https://[-0-9a-z]*\.trycloudflare\.com' "${LOG_FILE}" | head -n1 >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

grep -o 'https://[-0-9a-z]*\.trycloudflare\.com' "${LOG_FILE}" | head -n1
