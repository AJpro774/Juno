# Juno / Juni

**Juni** is a systems language that feels like Python and performs like C++: statically typed, no GC, explicit memory and refs, compiling natively to **WebAssembly** — with **Canvas2D**, a small **3D** API on WebGPU, frame loops, and input for games and simulations.

**Juno** is this repository. Author: **Alexander James Patton**. See [CREDITS.md](CREDITS.md).

## Try it online

**[Open the Juni IDE](https://junoengine.netlify.app)** — edit, compile, and run in your browser.

## Status (v11.0.0)

- **Language:** runtime array / `str_substr` bounds traps; named borrow diagnostics; `array_len`
- **IDE:** resizable panes; themes; Cat Coffee; trap console remapping for OOB
- **Authoring:** entity scripts + Open/Stub; tilemap paint; **3D Edit**; **Code Search**; **Anim** editor
- **Engine:** ECS / `.jscene`; 2D + **3D AABB physics** + hybrid 2D→3D; collision / trigger events; `world_draw3d`
- **Optional AI:** WebLLM — deeper RAG / project-aware chat — **off by default**
- **Projects:** flat `ide/` / `crates/` / `docs/` / `examples/` / `runtime/`; Netlify flat-only; `juni export-web`
- **Examples:** `platformer_3d`, platformer, scene3d_lit, paddle, audio, modules
- **CI:** tests + example checks; desktop multi-arch release with optional macOS notarization / Windows signing

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


## Docs

See [docs/src/intro.md](docs/src/intro.md), or open **Docs** in the IDE.

## License

- **Source code** is licensed under the [Apache License 2.0](LICENSE) only.
- **Distributed Juni IDE / runtime apps** (desktop installers, web IDE, PWA) are also subject to the [End User License Agreement](EULA.md).
