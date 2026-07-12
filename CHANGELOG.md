# Changelog

All notable changes to Juni are documented here.

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
