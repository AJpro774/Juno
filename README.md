# Juno / Juni

**Juni** is a systems language that feels like Python and performs like C++: statically typed, no GC, explicit memory and refs, compiling natively to **WebAssembly** — with **Canvas2D**, a small **3D** API on WebGPU, frame loops, and input for games and simulations.

**Juno** is this repository. Author: **Alexander James Patton**. See [CREDITS.md](CREDITS.md).

## Try it online

**[Open the Juni IDE](https://ajpro774.github.io/Juno/)** — edit, compile, and run in your browser (GitHub Pages).

Or deploy the same IDE to **Netlify** via root [`netlify.toml`](netlify.toml) (build base `/`, publish `ide/dist`). See [docs/src/projects/netlify.md](docs/src/projects/netlify.md).

## Status (v9.3.0)

- **Authoring:** Juni entity scripts via WASM `export fn {module}_{handler}`; inspector **Open/Stub**; 2D tilemap brush/erase; **3D Edit** WebGPU viewport
- **Engine:** host ECS, `.jscene`, prefabs, `on_collision` / `on_trigger_enter`, collision poll, camera follow, `world_draw3d`
- **Editor:** hierarchy/inspector, **Show colliders** overlays, Save to disk, undo/redo, play snapshot, hot reload, Export Web
- **Optional AI:** WebLLM (model picker) — chat, autocorrect, explain — **off by default**
- **Projects:** `juni.toml` modules, `juni export-web`, Netlify-ready static export
- **Examples:** platformer (coin `on_trigger_enter`), scene3d_lit, paddle, audio, modules
- **Docs:** engine, levels, Netlify, export-web, AI assistant, entity scripts, 3D edit
- **CI:** `cargo test`, example checks, LSP smoke, IDE / Pages build; desktop multi-arch release

## Browser IDE (local)

Double-click [`RunJuniEditor.command`](RunJuniEditor.command), or:

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
git push origin v6.0.0
```

Enable **Settings → Pages → Build and deployment → GitHub Actions**. The IDE will be live at:

**https://ajpro774.github.io/Juno/**

## Docs

See [docs/src/intro.md](docs/src/intro.md), or open **Docs** in the IDE.

## License

- **Source code** is licensed under the [Apache License 2.0](LICENSE) only.
- **Distributed Juni IDE / runtime apps** (desktop installers, web IDE, PWA) are also subject to the [End User License Agreement](EULA.md).
