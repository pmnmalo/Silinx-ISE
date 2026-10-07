#!/bin/sh
# XAIlinx launcher for Linux: run ./start-xailinx.sh (or double-click it, "Run in terminal").
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version (https://nodejs.org, or e.g. 'sudo apt install nodejs npm') and run this again."
  exit 1
fi
if ! node -e "process.exit(+process.versions.node.split('.')[0] >= 18 ? 0 : 1)"; then
  echo "Your Node.js is too old: install the current LTS version from https://nodejs.org"; exit 1
fi
[ -d node_modules/express ] || npm install --omit=dev || exit 1
echo "Starting XAIlinx at http://127.0.0.1:8642"
exec node bin/xailinx.js serve --open
