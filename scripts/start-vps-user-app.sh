#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${HOME}/apps/lc-banco-horas"
LOG_FILE="${APP_DIR}/app.log"
NODE_DIR="${HOME}/.local/node"

export PATH="${NODE_DIR}/bin:${PATH}"

mkdir -p "${APP_DIR}"
cd "${APP_DIR}"

tmux kill-session -t lc-banco-horas >/dev/null 2>&1 || true
tmux new-session -d -s lc-banco-horas "cd '${APP_DIR}' && export PATH='${NODE_DIR}/bin':\$PATH && node server.js >> '${LOG_FILE}' 2>&1"

sleep 4
curl -fsS http://127.0.0.1:3100/api/health
