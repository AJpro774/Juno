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
- **Deliverable:** Hosted browser IDE (GitHub Pages), `v4.0.0` tag
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
- **License:** Apache License 2.0 (source); EULA for distributed IDE/apps — see `LICENSE` and `EULA.md`

---

Thank you to the maintainers of Rust, WebAssembly, WebGPU, Vite, and Monaco.
