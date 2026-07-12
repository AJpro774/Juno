# Changelog

All notable changes to Juni are documented here.

## [5.0.0] — 2026-07-11

### Projects and modules

- `juni-driver` crate: `juni.toml` parsing, `src/` discovery, module graph, topological sort
- Python-style `import` / `export` / `from` syntax and multi-module link check
- Single merged WASM per project; entry module owns `main` / `frame` exports
- CLI: `juni check` / `juni build` without file arg reads `juni.toml`; `--project` flag

### IDE

- File tree panel, multi-tab Monaco editors, project open (folder + zip fallback)
- Project compile via `compile_project` WASM API
- Completion-lite and go-to-definition from checker/symbol index (browser)
- LSP client hook for Tauri desktop

### Tooling

- `juni-lsp` crate: tower-lsp stdio server, workspace completion + go-to-definition
- `desktop/` Tauri 2 app wrapping the IDE
- `examples/projects/*`: hello_modules, canvas_sprite, scene3d_custom, paddle_physics, audio_demo
- `scripts/check-projects.sh`, `scripts/smoke-lsp.sh`
- Docs: modules, juni.toml, assets, physics, audio, desktop

## [4.0.0] — 2026-07-11

### Language

- Memory-backed module `let` and `state:` blocks (any-expression init; shared across `main` / `frame`)
- `break` / `continue` in `while` and `for` loops
- Improved diagnostics when `frame` references names declared only in `main`

### Standard library

- Strings: `str_len`, `str_eq`, `str_concat`, `str_substr`
- Math: `clamp`, `lerp`, `pow`, `sign`, `fmod`, `smoothstep`, `deg_to_rad`, `rad_to_deg`, `dist2`, `len2`, `dot2`, `pi`
- Integer: `abs_i32`, `imin`, `imax`, `iclamp`

### Graphics

- Canvas2D stroke: `canvas_draw_line`, `canvas_stroke_rect`
- Existing Canvas2D, WebGPU triangle, and scene3d APIs unchanged

### IDE

- Browser IDE with Monaco editor, in-page WASM compile, Docs and Credits panels
- Examples: Hello World, Math, Vec2, Lines, Sprites, Game Paddle, Scene3D Cube, State, …
- Hosted deployment via GitHub Pages

### Tooling

- `juni check` / `juni build` CLI
- CI: `cargo test`, example checks, IDE production build
- `scripts/check-examples.sh` for local validation

## [3.0.0] and earlier

See [CREDITS.md](CREDITS.md) for version history and acknowledgements.
