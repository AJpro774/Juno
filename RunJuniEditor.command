#!/bin/bash
# Double-click to launch the Juni web editor locally (http://localhost:5173).
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"
IDE="$ROOT/ide"

echo "==> Juni web editor"
echo "    repo: $ROOT"

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm not found. Install Node.js first: https://nodejs.org/"
  read -r -p "Press Enter to close…"
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo not found. Install Rust first: https://rustup.rs/"
  read -r -p "Press Enter to close…"
  exit 1
fi

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "==> Installing wasm-pack…"
  cargo install wasm-pack
fi

cd "$IDE"

if [[ ! -d node_modules ]]; then
  echo "==> npm install…"
  npm install
fi

if [[ ! -f public/pkg/juni_wasm.js ]]; then
  echo "==> Building Juni WASM compiler for the browser…"
  npm run build:wasm
fi

# Open the browser shortly after Vite starts.
(
  sleep 2
  open "http://localhost:5173" 2>/dev/null || true
) &

echo "==> Starting Vite at http://localhost:5173"
echo "    Press Ctrl+C to stop."
echo

npm run dev
