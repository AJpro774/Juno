# Changelog

All notable changes to Juni are documented here.

## [7.5.0] — 2026-07-15

Editor persistence, gameplay APIs, 3D polish, AI/DX, and Netlify deploy.

### Deploy
- Root `netlify.toml` builds the IDE (`ide/`, base `/`, SPA redirects)
- Docs: [Deploy to Netlify](docs/src/projects/netlify.md), [Export for web](docs/src/projects/export-web.md)
- `juni export-web` writes `dist/web/` (+ game `netlify.toml`)

### Editor (7.2)
- Save Scene / ⌘S → disk (FSA / Tauri / download fallback)
- Undo/Redo, play snapshot restore, dirty indicator, hot-reload toggle

### Gameplay (7.3)
- Collision poll, rigidbody/collider APIs, `camera2d_follow`, `prefab_spawn`
- Platformer vertical slice + Making a level docs

### 3D (7.4)
- `world_draw3d`, ambient/fog, richer glTF load

### AI / DX (7.5)
- Model picker, docs RAG chunks, Replace selection / New file from chat

## [7.1.0] — 2026-07-15

Optional local AI assistant in the IDE (WebLLM + Qwen2.5-Coder-1.5B).

### IDE

- Off-by-default AI panel: enable/download, chat, progress status
- Autocorrect: Monaco code action + Apply/Dismiss preview
- Debug assist: Explain with AI on compile diagnostics
- Dynamic-import WebLLM so disabled builds never load the model stack

### Docs

- `docs/src/projects/ai-assistant.md`, `docs/src/engine/intrinsics.md`
- Expanded engine overview / editor docs

## [7.0.0] — 2026-07-15

Game engine release: host ECS world, `.jscene` scenes, 2D/3D systems, and visual editor.

### Engine

- Host-side ECS (`world_*`, `entity_*`, `transform2d_set`, `sprite_set`, `mesh3d_attach`, `world_step`, `world_draw`)
- `.jscene` JSON scenes + `scene_load`; optional `[scene]` in `juni.toml`
- 2D: Camera2D, sprite batching / sheets, tilemaps
- 3D: textured materials, directional/point lights, glTF load, frustum culling
- Physics: velocity integration, circle colliders, `aabb_resolve_y`, ECS `world_step`
- Input: expanded key map, `gamepad_axis` / `gamepad_button`
- Audio: `audio_play_loop`, `audio_set_volume`

### IDE

- Hierarchy, Inspector, Asset browser, Edit/Play modes, scene view gizmos
- Play-in-editor injects the current scene before `main()`

### Examples

- `examples/projects/platformer` — 2D ECS platformer
- `examples/projects/scene3d_lit` — lit 3D + glTF

## [6.0.0] — 2026-07-12

Full software engine release (modules, projects, IDE, LSP, desktop, assets, 3D, physics, audio, generics).

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
