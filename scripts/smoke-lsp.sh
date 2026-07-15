#!/usr/bin/env bash
# Smoke-test juni lsp initialization (no editor attached).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT="$ROOT/examples/projects/hello_modules"

# LSP initialize handshake then shutdown.
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"capabilities":{},"rootUri":"file://'"$PROJECT"'"}}' \
  '{"jsonrpc":"2.0","id":2,"method":"shutdown","params":{}}' \
  '{"jsonrpc":"2.0","id":3,"method":"exit","params":{}}' \
  | timeout 5 cargo run -q -p juni-cli -- lsp >/dev/null

echo "juni lsp smoke ok"
