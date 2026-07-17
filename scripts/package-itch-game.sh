#!/usr/bin/env bash
# Package a Juni export-web folder into an itch.io HTML game ZIP.
# Usage:
#   ./scripts/package-itch-game.sh [path/to/dist/web] [output.zip]
# Examples:
#   juni export-web --project examples/projects/platformer --zip
#   ./scripts/package-itch-game.sh examples/projects/platformer/dist/web
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/dist/web}"
OUT="${2:-}"

if [[ ! -f "$SRC/index.html" ]]; then
  echo "error: missing $SRC/index.html — run: juni export-web --project <game> --output $SRC" >&2
  exit 1
fi
if [[ ! -f "$SRC/runtime/browser.js" ]]; then
  echo "error: missing $SRC/runtime/browser.js — export is not self-contained" >&2
  exit 1
fi
if [[ ! -f "$SRC/play.js" ]]; then
  echo "error: missing $SRC/play.js" >&2
  exit 1
fi

if [[ -z "$OUT" ]]; then
  name="$(basename "$(dirname "$SRC")")"
  if [[ "$name" == "dist" ]]; then
    name="$(basename "$(dirname "$(dirname "$SRC")")")"
  fi
  OUT="$(cd "$SRC/.." && pwd)/${name}-web.zip"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# Flatten into zip root (itch requires index.html at archive root)
cp -R "$SRC"/. "$TMP/"
(
  cd "$TMP"
  rm -f "$OUT"
  zip -r "$OUT" . \
    -x "*.map" \
    -x "*.d.ts" \
    -x "*.DS_Store"
)

echo "wrote itch game zip → $OUT"
echo "Upload as HTML + “played in the browser”. See docs/src/projects/export-web.md"
