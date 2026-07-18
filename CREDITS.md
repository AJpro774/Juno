# Credits

Author: **Alexander J. Patton**

Built with **Cursor** (AI-assisted development) and the open-source toolchain listed per version.

---

## v0 — Language core

- **Author:** Alexander J. Patton
- **Built with:** Cursor
- **Models used:** Early scaffolding with Cursor agent assistance (exact model names not recorded)
- **Software:** Rust, Cargo, `wasm-encoder`, thiserror, Node.js

## v1 — IDE + strings / print

- **Author:** Alexander J. Patton
- **Built with:** Cursor
- **Models used:** Cursor agent assistance (not fully recorded)
- **Software:** Rust, wasm-bindgen, wasm-pack, Vite, Monaco Editor, TypeScript, Node.js

## v2 — Canvas2D, WebGPU sample, Docs panel

- **Author:** Alexander J. Patton
- **Built with:** Cursor
- **Models used:** Cursor Composer / Auto agent routing for implementation
- **Software:** Rust, wasm-bindgen, wasm-pack, Vite, Monaco Editor, TypeScript, marked, HTML Canvas 2D, WebGPU / WGSL, Node.js

## v3 — Games, sim, 3D, Credits

- **Author:** Alexander J. Patton
- **Built with:** Cursor
- **Models used:** Cursor Composer (implementation agents for compiler, IDE runtime, docs)
- **Software:** Rust, wasm-bindgen, wasm-pack, Vite, Monaco Editor, TypeScript, marked, HTML Canvas 2D, WebGPU / WGSL, Node.js

## v4 — Language-first upgrade

- **Author:** Alexander J. Patton
- **Built with:** Cursor
- **Models used:** Cursor Composer / agent routing for compiler, IDE, docs, and CI
- **Software:** Rust, wasm-encoder, wasm-bindgen, wasm-pack, Vite, Monaco Editor, TypeScript, marked, HTML Canvas 2D, WebGPU / WGSL, GitHub Actions, Node.js

## v4.0 — Initial release

- **Author:** Alexander J. Patton
- **Deliverable:** Hosted browser IDE (GitHub Pages), `v4.0.0` tag
- **Built with:** Cursor
- **Software:** Rust, wasm-bindgen, Vite, Monaco, GitHub Pages, GitHub Actions

## v6 — Full software engine

- **Author:** Alexander J. Patton
- **Deliverable:** Modules/imports, project IDE, LSP, Tauri desktop, assets, 3D, physics, audio, generics; `v6.0.0` tag
- **Built with:** Cursor
- **Software:** Rust, juni-driver, juni-lsp, Tauri 2, wasm-bindgen, Vite, Monaco, GitHub Actions

## v7 — Game engine

- **Author:** Alexander J. Patton
- **Deliverable:** Host ECS, `.jscene` scenes, 2D/3D systems (cameras, tilemaps, lights, glTF), physics step, visual editor (hierarchy / inspector / assets / Edit·Play); `v7.0.0`
- **Built with:** Cursor
- **Software:** Rust, TypeScript, WebGPU, Canvas2D, Web Audio, Vite, Monaco, Tauri 2

## v8 — Ship a game + tutorials

- **Author:** Alexander J. Patton
- **Deliverable:** Self-contained export-web / itch·Netlify packaging, in-IDE visual tutorial player (screenshots + captions + TTS); phased `v8.0.0` / `v8.1.0` / `v8.2.0` / `v8.3.0`
- **v8.1:** Inspector completeness (collider/camera/tilemap/prefab/script), 2D physics polish (grounded/triggers/slopes), entity script dispatch host ABI, physics+scripts tutorial
- **v8.2:** Tauri project FS + LSP hover/diagnostics, 3D editor slice (mesh/light/camera + `world_draw3d` Play), AI model defaults / docs RAG, spritesheet + richer glTF, desktop/3D/AI tutorials
- **v8.3:** Modern / Classic UI appearance toggle (Classic default), rearranged modern workspace chrome, Settings panel
- **Built with:** Cursor
- **Models used:** Cursor Grok 4.5 High, Composer 2.5
- **Software:** Rust, TypeScript, WebGPU, Canvas2D, Web Audio, Vite, Monaco, Tauri 2, WebLLM

---

Thank you to the maintainers of Rust, WebAssembly, WebGPU, Vite, and Monaco.
