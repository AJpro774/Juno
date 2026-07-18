# Juno / Juni

**Juni** is a systems language that feels like Python and performs like C++: statically typed, no GC, explicit memory and refs, compiling natively to **WebAssembly** — with **Canvas2D**, a small **3D** API on WebGPU, frame loops, and input for games and simulations.

**Juno** is this repository. Author: **Alexander James Patton**. See [CREDITS.md](CREDITS.md).

## Try it online

**[Open the Juni IDE](https://ajpro774.github.io/Juno/)** — edit, compile, and run in your browser (GitHub Pages).

## Status (v4.0.0)

- **Module state:** `state:` blocks and module `let` as **memory-backed statics** (any-expression init; shared across `main` / `frame`)
- Language → WASM: structs, refs, control flow, strings, arrays, **`for` ranges**, **`break` / `continue`**
- Stdlib: strings, math (`clamp`/`lerp`/`pow`/…), vec2 (`len2`/`dot2`/`dist2`), integer helpers
- **Canvas2D** fill + **stroke** (`canvas_draw_line`, `canvas_stroke_rect`) + **frame(`dt`)** loop
- **scene3d_*** / **mesh3d_*** / **camera3d_*** (rotating cube sample)
- **Docs** and **Credits** panels in the IDE; **CI** + GitHub Pages deploy
- CLI: `juni check` / `juni build`; Node stubs graphics/input safely

Out of v4: modules/imports, generics, LSP, full physics, asset pipeline, desktop shell.

## Browser IDE (local)

```bash
cd ide && npm run build:wasm
cd ide && npm install && npm run dev
```

Open http://localhost:5173 — **Run** (⌘/Ctrl+Enter) compiles and executes; starts `frame` when exported.

## CLI quick start

```bash
cargo run -p juni-cli -- build examples/hello_world.juni -o hello.wasm
node runtime/host.js hello.wasm
```

Check all samples:

```bash
bash scripts/check-examples.sh
```

## Layout

| Path | Role |
|------|------|
| `crates/*` | Compiler (syntax, check, codegen, CLI, wasm) |
| `ide/` | Vite + Monaco browser IDE |
| `runtime/` | JS host + stubs |
| `examples/` | Sample `.juni` programs |
| `docs/` | Language + graphics docs |
| `CHANGELOG.md` | Release notes |
| `CREDITS.md` | People, models, and software per version |

## Publish (GitHub Pages)

```bash
git remote add origin https://github.com/AJpro774/Juno.git
git push -u origin main
git push origin v4.0.0
```

Enable **Settings → Pages → Build and deployment → GitHub Actions**. The IDE will be live at:

**https://ajpro774.github.io/Juno/**

## Docs

See [docs/src/intro.md](docs/src/intro.md), or open **Docs** in the IDE.

## License

- **Source code** is licensed under the [Apache License 2.0](LICENSE) only.
- **Distributed Juni IDE / runtime apps** are also subject to the [End User License Agreement](EULA.md).
