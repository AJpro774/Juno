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

## Weekly maintenance — 2026-07-15

- **Author:** Alexander J. Patton
- **Built with:** Cursor (Cloud Agent / weekly maintenance automation)
- **Models used:** Cursor Grok 4.5 (maintenance agent)
- **Base:** `main` @ `169692fa` (sitemap fix); work on `chore/weekly-maintenance-2026-07-15`
- **Bug fixes:** Restored flat repo layout after GitHub upload nesting (`1_root_crates` / `2_ide_runtime` / `3_docs_examples`); LSP unused assignment warning; root `.gitignore`; `check-projects.sh` trailing-slash paths; refreshed stale example `build.wasm` artifacts
- **Dependency / framework bumps:** Vite 6→8, Monaco →0.55, marked →18, TypeScript →7 (ide + runtime); `dompurify` override 3.4.12; `@tauri-apps/cli` →2.11; Cargo `wasm-encoder` 0.221→0.253, `toml` 0.8→1.x; lockfile refreshes (clap, syn, bitflags, desktop Tauri lock)
- **Software:** Rust 1.97, Cargo, wasm-pack, wasm-bindgen, Vite 8, Monaco Editor, marked, TypeScript 7, Node.js 22, Tauri 2

---

Thank you to the maintainers of Rust, WebAssembly, WebGPU, Vite, and Monaco.
