#!/usr/bin/env bash
set -euo pipefail

NODE_DIR="${HOME}/.local/node"
APP_DIR="${HOME}/apps/lc-banco-horas"

mkdir -p "${NODE_DIR}" "${HOME}/.local/bin" "${APP_DIR}"
export PATH="${NODE_DIR}/bin:${PATH}"

if [ ! -x "${NODE_DIR}/bin/node" ]; then
  file_name="$(curl -fsSL https://nodejs.org/dist/latest-v22.x/ | grep -o 'node-v22[^" ]*-linux-x64.tar.xz' | head -n1)"
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/${file_name}" -o /tmp/node-v22-linux-x64.tar.xz
  tar -xJf /tmp/node-v22-linux-x64.tar.xz -C "${NODE_DIR}" --strip-components=1
fi

node -v
npm -v
