# Juno / Juni

**Juni** is a systems language that feels like Python and performs like C++: statically typed, no GC, explicit memory and refs, compiling natively to **WebAssembly** — with **Canvas2D**, a small **3D** API on WebGPU, frame loops, and input for games and simulations.

**Juno** is this repository. Author: **Alexander J. Patton**. See [CREDITS.md](CREDITS.md).

## Try it online

**[Open the Juni IDE](https://ajpro774.github.io/Juno/)** — edit, compile, and run in your browser (GitHub Pages).

## Status (v5.0.0)

- **Projects:** `juni.toml` + `src/` modules, Python-style `import` / `export` / `from`, single merged WASM
- **IDE:** file tree, multi-tab editors, project open (folder + zip), completion-lite + go-to-def
- **LSP:** `juni lsp` (tower-lsp) with cross-module completion and definition
- **Desktop:** Tauri 2 shell wrapping the IDE with native folder open
- **Examples:** `examples/projects/*` — modules, sprites, 3D, paddle physics, audio demo
- **Docs:** modules, juni.toml, assets, physics, audio, desktop
- **CI:** `cargo test`, example + project checks, LSP smoke, IDE build

## Browser IDE (local)

```bash
cd ide && npm run build:wasm
cd ide && npm install && npm run dev
```

Open http://localhost:5173 — **Run** (⌘/Ctrl+Enter) compiles and executes; starts `frame` when exported.

## CLI quick start

```bash
cd examples/projects/hello_modules
cargo run -p juni-cli -- build
node ../../runtime/host.js hello_modules.wasm
```

Check all samples:

```bash
bash scripts/check-examples.sh
bash scripts/check-projects.sh
```

## Desktop IDE

```bash
cd ide && npm run build:wasm
cd desktop && npm install && npm run dev
```

## Layout

| Path | Role |
|------|------|
| `crates/*` | Compiler (syntax, check, codegen, driver, lsp, CLI, wasm) |
| `ide/` | Vite + Monaco browser IDE |
| `desktop/` | Tauri 2 native shell |
| `runtime/` | JS host + stubs |
| `examples/` | Single-file `.juni` programs |
| `examples/projects/` | Multi-module `juni.toml` projects |
| `docs/` | Language + project docs |
| `CHANGELOG.md` | Release notes |
| `CREDITS.md` | People, models, and software per version |

## Publish (GitHub Pages)

```bash
git remote add origin https://github.com/AJpro774/Juno.git
git push -u origin main
git push origin v5.0.0
```

Enable **Settings → Pages → Build and deployment → GitHub Actions**. The IDE will be live at:

**https://ajpro774.github.io/Juno/**

## Docs

See [docs/src/intro.md](docs/src/intro.md), or open **Docs** in the IDE.
