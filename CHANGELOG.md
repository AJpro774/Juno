# Changelog

All notable changes to Juni are documented here.

## [12.0.0] — 2026-07-24

License contract, permanent provenance, Android APK pipeline, and Kuni nested in the hosted IDE.

### License / legal
- Adopt **Juni Software License and Commercial Contract 1.0** (modified PolyForm Small Business) + updated EULA
- Docs/README/CREDITS describe free Small Business tier and **USD $200/mo** commercial license above that

### Provenance
- Embed `juni.notice` WASM custom section + producers metadata from codegen
- Project `JUNI.NOTICE` / export notices and runtime Required Notice header

### Android / release
- Bubblewrap TWA APK workflow uploads to GitHub Releases (version from tag / `ide/package.json`)
- TWA manifest brand version → **12.0.0** (`appVersionCode` 12000)

### IDE / Kuni
- App switcher and promo rail for **Juni** + **Kuni** (nested Vite build under `/kuni/`)
- Netlify routing for Kuni; wasm init `BASE_URL` fix; layout-resize console noise fix
- Platformer tutorial / Cat Coffee polish from recent IDE work

### Release
- Brand / package / desktop versions → **12.0.0**

## [11.0.0] — 2026-07-20

Language harden: runtime bounds traps, safer `str_substr`, named borrow diagnostics, `array_len`.

### Language / checker / codegen
- Dynamic `T[N]` indexes emit runtime bounds checks and trap via WASM `unreachable`
- `str_substr` guards `start`/`len` against the source length (overflow-safe) before copy
- Borrow diagnostics name locals (`` `a` `` / ``mut ref `b` ``) instead of `local#N`
- Builtin `array_len(xs)` lowers to the compile-time length `N`

### Docs / IDE
- Sync [stdlib](docs/src/language/stdlib.md) and [types](docs/src/language/types.md) for traps / `array_len`
- Run console remaps WASM unreachable/`RuntimeError` to a clear Juni out-of-bounds message

### Release
- Brand / package / desktop versions → **11.0.0**

## [10.1.0] — 2026-07-19

IDE polish: resizable panes, ten new themes, Cat Coffee badges and local leaderboard.

### IDE
- **Resizable panes** — drag seams between columns, console height, and side panel width (saved in this browser)
- **10 new themes** — midnight, sunrise, ocean, lava, mint, grape, paper, neon, forest, desert
- **Cat Coffee** — multi-badges, nickname, local leaderboard (localStorage), copy/download shareable SVG badge

### Release
- Brand / package / desktop versions → **10.1.0**

## [10.0.0] — 2026-07-18

Language borrow checking, 3D physics, animation authoring, deeper optional AI, flat repo, signed desktop hooks.

### Language / checker
- Real **borrow checking** (`ref` / `mut`): reject immutable writes, overlapping mut aliases, escaping refs
- Generics docs, richer diagnostics, const array index bounds
- Docs: [Types](docs/src/language/types.md), [Generics](docs/src/language/generics.md)

### IDE
- Categorical Monarch highlight + theme colors; **Code Search** by category
- **Anim** panel: sprite-sheet / keyframe clips → `assets/anims/*.json` + `sprite_animator`
- Deeper optional AI: RAG refresh, project-aware chat prompts — still **off by default**

### Engine / physics
- AABB `rigidbody3d` / `collider3d` alongside 2D; hybrid 2D-phys → 3D-render sync
- Script event `on_trigger_exit` when a prior trigger pair disappears
- Template: `examples/projects/platformer_3d`

### Repo / release
- Canonical flat layout only (removed nested `1_root_crates` / `2_ide_runtime` / `3_docs_examples` / `_github_upload`)
- Netlify builds flat `ide/` only
- Desktop release workflow: macOS notarization + Windows signing when secrets present (unsigned fallback otherwise)
- Brand / package / desktop versions → **10.0.0**

## [9.3.0] — 2026-07-18

Scripts that feel real: open → stub → collide → see colliders → ship.

### IDE / authoring
- Inspector **Open** / **Stub** for entity scripts against the project entry `.juni`
- Edit-mode **Show colliders** overlays (AABB/circle; solid vs trigger stroke); toggle default on

### Engine / scripts
- Entity script events: `on_collision` and `on_trigger_enter` (`export fn {module}_on_*`)
- Host poll: `collision_is_trigger(i)` through checker/codegen
- Platformer coin pickup demo via `on_trigger_enter`

### Release
- Brand / package / desktop versions → **9.3.0**

## [9.2.0] — 2026-07-17

Parity polish for browser IDE and runtime assets.

### IDE / LSP
- Browser IDE **hover** and **diagnostics** via WASM (`hover_source` / `diagnostics_source`), closer to desktop Tauri LSP
- Completion + go-to-definition unchanged on the wasm path

### Assets / audio
- **`.glb`** load path for `mesh_load_gltf` / Mesh3D glTF authoring (JSON `.gltf` still supported)
- Audio: `audio_stop(handle)` and master `audio_set_bus_volume(volume)` through a simple Web Audio bus

### Tutorials / hygiene
- Committed `ship-a-game/step-1.wav` sample; Speak still falls back to `speechSynthesis`
- Docs note `scripts/generate-tutorial-tts.mjs` for optional OpenAI MP3s
- Brand / package / desktop versions → **9.2.0**

## [9.1.0] — 2026-07-17

### 3D Edit
- WebGPU scene view in **Edit** for Mesh3D / Light3D / Camera3D (orbit, select, XZ drag; RGB axis gizmo)
- Canvas2D isometric fallback when WebGPU is unavailable
- **Play** still stops the edit preview and draws via `world_draw3d`
- Docs: [3D](docs/src/graphics/3d.md)

### Installers / download hub
- GitHub Actions **Release desktop** workflow: Tauri multi-arch matrix (macOS x86_64 + aarch64, Windows x86_64 + ARM64 when runners allow, Linux x86_64 + aarch64); draft GitHub Release on `v*` tags
- Web **`/download/`** hub (IDE Classic styling): OS/arch detect, GitHub Releases links/placeholders
- Android: installable **PWA** (`manifest.webmanifest` + service worker) with Add to Home Screen instructions on the download page
- Desktop bundle icons/targets updated in `tauri.conf.json`; docs: [Desktop IDE](docs/src/projects/desktop.md)

## [9.0.0] — 2026-07-17

Author in Juni: WASM entity scripts, 2D tilemap paint, and release hygiene.

### Scripts
- Entry-module `export fn` names compile to WASM exports (alongside `main` / `frame`)
- Convention: `.jscene` `script.module` + `script.handler` → WASM `{module}_{handler}` (e.g. `player_on_update`)
- Host still prefers JS `registerScriptHandler` when registered; otherwise invokes Juni WASM
- Docs: [Entity scripts](docs/src/engine/scripts.md); platformer hazard uses `export fn hazard_on_update`

### Tilemap paint
- Scene view brush / erase for tilemap entities (Alt or right-click erase; ⌘/Ctrl-drag to move)
- Inspector: grid size, tileset, brush tile index; tiles array pads on resize
- Painted tiles round-trip through Save Scene / `.jscene`

### Docs / tutorials
- README Status → v9.0; filled leftover `[8.0.0]` changelog stub
- Intro covers 9.0 scripts + tile paint
- Tutorial lesson pack **Scripts and tile paint** under `ide/public/tutorials/scripts-tiles/`

## [8.3.0] — 2026-07-17

Modern / Classic UI appearance.

### IDE
- Settings panel with **UI appearance** toggle: Classic (default) or Modern
- Preference persisted in `localStorage` (`juni.ui.appearance`)
- Modern: cooler dark chrome (DM Sans), grouped toolbar, Scene-forward workspace order
- Classic: original warm parchment layout (Syne) — default for new visitors

## [8.2.0] — 2026-07-17

Desktop IDE, 3D editor slice, and stronger local AI.

### Desktop
- Tauri: `load_project_files` / `read_project_file` for full project FS open; safer writes
- LSP: hover + pull diagnostics (beyond completion / goto); Monaco markers on desktop
- Docs: [Desktop IDE](docs/src/projects/desktop.md)

### 3D editor
- Inspector / hierarchy for Transform3D, Mesh3D (box|glTF), Light3D, Camera3D
- Play auto-switches to WebGPU; materializes handles; `world_draw3d` draw path
- Docs: [3D](docs/src/graphics/3d.md), `.jscene` 3D components

### AI
- Curated model picker defaults (Coder 1.5B default; legacy 0.5B upgraded)
- Expanded docs RAG chunks (3D, scripts, desktop, assets, intrinsics)
- Docs: [AI assistant](docs/src/projects/ai-assistant.md)

### Assets
- Sprite sheet cols/rows/fps in Inspector
- Richer glTF load (multi-primitive, NORMAL tint, scene node mesh pick)

### Tutorials
- **Desktop IDE**, **3D scene slice**, **AI assistant** lesson packs

## [8.1.0] — 2026-07-17

2D editor completion, physics polish, and live entity scripts.

### Editor
- Inspector: Collider2D (shape/size/solid/slope), Camera2D, Tilemap, Prefab path/offset, Script enable
- Component fields round-trip through `.jscene` save/load

### Runtime
- Entity `script` host ABI: dispatch handlers each `world_step` (JS registry or WASM export)
- Physics: clearer grounded normals, triggers, optional collider `slope` slide
- Docs: [Entity scripts](docs/src/engine/scripts.md)

### Tutorials
- Lesson pack **Physics and scripts** under `ide/public/tutorials/physics-scripts/`

## [8.0.0] — 2026-07-17

Ship a game + tutorials: self-contained web packaging and the in-IDE lesson player.

### Export
- `juni export-web` writes a self-contained `dist/web/` (HTML + WASM + runtime) for itch / Netlify
- IDE **Export Web** downloads a `*-web.zip` of the same layout

### Tutorials
- In-IDE visual tutorial player: screenshots, captions, optional TTS
- First lesson pack **Ship a game** under `ide/public/tutorials/ship-a-game/`

### Credits
- v8 models: Cursor Grok 4.5 High, Composer 2.5

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
