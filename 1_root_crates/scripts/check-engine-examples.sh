#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI=(cargo run -q -p juni-cli --)

projects=(
  examples/projects/platformer
  examples/projects/scene3d_lit
)

for dir in "${projects[@]}"; do
  echo "==> check $dir"
  (cd "$ROOT/$dir" && "${CLI[@]}" check)
  echo "==> build $dir"
  (cd "$ROOT/$dir" && "${CLI[@]}" build)
done

echo "Engine example projects OK."
