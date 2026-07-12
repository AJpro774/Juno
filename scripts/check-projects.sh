#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

shopt -s nullglob
projects=(examples/projects/*/)
if ((${#projects[@]} == 0)); then
  echo "No examples/projects/* directories found"
  exit 1
fi

for dir in "${projects[@]}"; do
  if [[ ! -f "$dir/juni.toml" ]]; then
    echo "skip $dir (no juni.toml)"
    continue
  fi
  echo "juni check --project $dir"
  cargo run -q -p juni-cli -- check --project "$dir"
  echo "juni build --project $dir"
  cargo run -q -p juni-cli -- build --project "$dir" -o "$dir/build.wasm"
done

echo "All example projects passed juni check/build."
