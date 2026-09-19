# Credits

Author: **Alexander James Patton**

Built with **Cursor** and the open-source toolchain listed per version.

---

## v0 — Language core

- **Author:** Alexander James Patton
- **Built with:** Cursor
- **Software:** Rust, Cargo, `wasm-encoder`, thiserror, Node.js

## v1 — IDE + strings / print

- **Author:** Alexander James Patton
- **Built with:** Cursor
- **Software:** Rust, wasm-bindgen, wasm-pack, Vite, Monaco Editor, TypeScript, Node.js

## v2 — Canvas2D, WebGPU sample, Docs panel

- **Author:** Alexander James Patton
- **Built with:** Cursor
- **Software:** Rust, wasm-bindgen, wasm-pack, Vite, Monaco Editor, TypeScript, marked, HTML Canvas 2D, WebGPU / WGSL, Node.js

## v3 — Games, sim, 3D, Credits

- **Author:** Alexander James Patton
- **Built with:** Cursor
- **Software:** Rust, wasm-bindgen, wasm-pack, Vite, Monaco Editor, TypeScript, marked, HTML Canvas 2D, WebGPU / WGSL, Node.js

## v4 — Language-first upgrade

- **Author:** Alexander James Patton
- **Built with:** Cursor
- **Software:** Rust, wasm-encoder, wasm-bindgen, wasm-pack, Vite, Monaco Editor, TypeScript, marked, HTML Canvas 2D, WebGPU / WGSL, GitHub Actions, Node.js

## v4.0 — Initial release

- **Author:** Alexander James Patton
- **Deliverable:** Hosted browser IDE (GitHub Pages at release; now Netlify), `v4.0.0` tag
- **Built with:** Cursor
- **Software:** Rust, wasm-bindgen, Vite, Monaco, GitHub Pages, GitHub Actions

## v6 — Full software engine

- **Author:** Alexander James Patton
- **Deliverable:** Modules/imports, project IDE, LSP, Tauri desktop, assets, 3D, physics, audio, generics; `v6.0.0` tag
- **Built with:** Cursor
- **Software:** Rust, juni-driver, juni-lsp, Tauri 2, wasm-bindgen, Vite, Monaco, GitHub Actions

## v7 — Game engine

- **Author:** Alexander James Patton
- **Deliverable:** Host ECS, `.jscene` scenes, 2D/3D systems (cameras, tilemaps, lights, glTF), physics step, visual editor (hierarchy / inspector / assets / Edit·Play); `v7.0.0`
- **Built with:** Cursor
- **Software:** Rust, TypeScript, WebGPU, Canvas2D, Web Audio, Vite, Monaco, Tauri 2

## v8 — Ship a game + tutorials

- **Author:** Alexander James Patton
- **Deliverable:** Self-contained export-web / itch·Netlify packaging, in-IDE visual tutorial player (screenshots + captions + TTS); phased `v8.0.0` / `v8.1.0` / `v8.2.0` / `v8.3.0`
- **v8.1:** Inspector completeness (collider/camera/tilemap/prefab/script), 2D physics polish (grounded/triggers/slopes), entity script dispatch host ABI, physics+scripts tutorial
- **v8.2:** Tauri project FS + LSP hover/diagnostics, 3D editor slice (mesh/light/camera + `world_draw3d` Play), spritesheet + richer glTF, desktop/3D tutorials
- **v8.3:** Modern / Classic UI appearance toggle (Classic default), rearranged modern workspace chrome, Settings panel
- **Built with:** Cursor
- **Software:** Rust, TypeScript, WebGPU, Canvas2D, Web Audio, Vite, Monaco, Tauri 2

## v9 — Author in Juni

- **Author:** Alexander James Patton
- **Deliverable:** Juni entity scripts via WASM exports, 2D tilemap paint, expanded appearance themes (Classic default + Modern, Cosmic, Froggy, Berryland, Basic, Hacker), **Cat Coffee** playful Cat Coins + dancing cat; phased `v9.0.0` onward
- **v9.0:** Entry `export fn {module}_{handler}` WASM script ABI; scene-view tilemap brush/erase; docs + **Scripts and tile paint** tutorial; themes pack + Cat Coffee; release hygiene (README/CHANGELOG)
- **v9.1:** WebGPU 3D Edit viewport (mesh/light/camera gizmo-lite; Play keeps `world_draw3d`); multi-arch Tauri CI → GitHub Releases; web `/download/` hub; Android as installable PWA (no APK)
- **v9.2:** Browser LSP hover/diagnostics via WASM; `.glb` mesh load path; `audio_stop` + master bus volume; tutorial sample audio + `9.2.0` brand bump
- **v9.3:** Script Open/Stub UX; `on_collision` / `on_trigger_enter`; `collision_is_trigger`; Edit-mode Show colliders; platformer coin trigger demo; `9.3.0` brand bump
- **Built with:** Cursor
- **Software:** Rust, TypeScript, WebGPU, Canvas2D, Web Audio, Vite, Monaco, Tauri 2
- **License:** Juni Software License and Commercial Contract 1.0 (modified PolyForm Small Business) + EULA; Commercial License USD $200/mo above Small Business — see `LICENSE` and `EULA.md`

## v10 — Expand

- **Author:** Alexander James Patton
- **Deliverable:** Borrow checking, categorical Code Search, 3D/hybrid physics + `on_trigger_exit`, `platformer_3d`, Anim editor, deeper optional AI, flat repo, signed desktop hooks — `v10.0.0`
- **v10.1:** Resizable IDE panes; 10 new themes; Cat Coffee multi-badges, local leaderboard, shareable SVG badge — `v10.1.0`

## v11 — Harden

- **Author:** Alexander James Patton
- **Deliverable:** Runtime array / `str_substr` bounds traps (`unreachable`), named borrow diagnostics, `array_len`, docs + IDE trap console mapping — `v11.0.0`
- **Built with:** Cursor
- **Software:** Rust, TypeScript, WebGPU, Canvas2D, Web Audio, Vite, Monaco, Tauri 2

## v12 — License, provenance & ship

- **Author:** Alexander James Patton
- **Deliverable:** Juni Software License and Commercial Contract 1.0; WASM `juni.notice` / export notices; Android APK (Bubblewrap TWA) CI; Kuni nested chat app; IDE app switcher + promo rail — `v12.0.0`
- **Built with:** Cursor
- **Software:** Rust, TypeScript, WebGPU, Canvas2D, Web Audio, Vite, Monaco, Tauri 2, Bubblewrap/TWA

## v13 — Host imports & engine embedding

- **Author:** Alexander James Patton
- **Deliverable:** `extern "module":` host imports; pruned import tables; allocator operand-stack fix; `juni_driver::compile_single_with_prelude` for native engines (Kerabit 3.0); runtime `extraImports` — `v13.0.0`
- **Built with:** Cursor
- **Software:** Rust, TypeScript, WebAssembly, wasm-encoder / wasmparser, Vite, Monaco, Tauri 2

## Weekly maintenance — 2026-09-19

- **Author:** Alexander James Patton
- **Built with:** Cursor Automation (weekly maintenance agent); Cursor Grok 4.5
- **Work:** Against `main` @ `c16741f0221a083b3d0006b41ffd399aeae65eac` (v13.0.0). Re-applied still-unmerged weekly fixes (LSP `unused_assignments`, `check-projects.sh` trailing-slash paths, desktop/Tauri `.gitignore` + Linux schema, portable README paths, docs relative links, GitHub Pages nested `KUNI_BASE`/`LUNI_BASE` + relative app-switcher hrefs, sitemap → `junoengine.vercel.app`). New: docs download-page link in `desktop.md`; wasmparser **0.259** import-section test helpers (`into_imports`). Dependency bumps — Vite **8.3.0**, Monaco **0.55.1**, TypeScript **7.0.2**, marked **18.0.13**, `@webgpu/types` **0.1.74**, `@mlc-ai/web-llm` **0.2.85**, Capacitor **7.6.9**, `@tauri-apps/cli` **2.11.4**, `wasm-encoder`/`wasmparser` **0.259**, `wasm-bindgen` **0.2.128**, `toml` **1.x**; rebuilt `ide/public/pkg`
- **Software:** Rust 1.98.1, Cargo, wasm-pack, Vite 8.3, Monaco 0.55.1, TypeScript 7.0.2, marked, Tauri 2, Capacitor 7, Node.js

---

Thank you to the maintainers of Rust, WebAssembly, WebGPU, Vite, and Monaco.
