#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

shopt -s nullglob
files=(examples/*.juni)
if ((${#files[@]} == 0)); then
  echo "No examples/*.juni files found"
  exit 1
fi

for f in "${files[@]}"; do
  echo "juni check $f"
  cargo run -q -p juni-cli -- check "$f"
done

echo "All examples passed juni check."
