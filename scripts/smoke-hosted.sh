#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/ide"

echo "Building WASM compiler..."
npm run build:wasm

echo "Building production IDE (GitHub Pages base)..."
GITHUB_PAGES=true npm run build

echo ""
echo "Smoke build OK. Preview with:"
echo "  cd ide && npx vite preview"
echo ""
echo "Then open the printed URL and Run: Hello World, Game Paddle, Vec2, Lines, Scene3D."
