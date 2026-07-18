# Introduction

**Juni** is a systems language with Python-like ergonomics and C++-level control. It compiles to **WebAssembly**, with Canvas2D, a small WebGPU 3D API, frame loops, and input for games and simulations.

**v8.3** adds a **Classic / Modern** UI appearance toggle in Settings (Classic default): original warm layout vs rearranged modern chrome.

**v8.2** ships first-class **desktop** FS + richer LSP (hover/diagnostics), a **3D editor slice** (mesh/light/camera + Play via `world_draw3d`), stronger **AI** model defaults / docs RAG, and final desktop/3D/AI tutorials.

**v8.1** completes the 2D editor (collider / camera / tilemap / prefab / script inspector), polishes 2D physics (grounded, triggers, slopes), and dispatches entity scripts each `world_step`.

**v8.0** focuses on shipping games: self-contained web/itch export and in-IDE visual tutorials (screenshots + captions + TTS), on top of the v7 engine.

**v7.1** adds an optional **local AI assistant** in the IDE (WebLLM + Qwen2.5-Coder-1.5B on WebGPU): autocorrect suggestions, diagnostic explanations, and a small chat panel — off by default.

**v7.0** is the game-engine release: host-side **ECS**, **`.jscene` scenes**, 2D cameras/sprites/tilemaps, 3D lights/glTF, physics step, and a **visual editor** (hierarchy, inspector, asset browser, Edit/Play) on top of the v6 language toolchain.

**v6.0** added Python-style **modules**, **`juni.toml` projects**, multi-tab IDE, asset manifest, richer 3D samples, physics/audio foundations, **`juni lsp`**, and a **Tauri desktop** shell.

**[Try the IDE online](https://ajpro774.github.io/Juno/)** (GitHub Pages).

Author: **Alexander J. Patton**. Credits: open **Credits** in the IDE or see `CREDITS.md`.

## Quick example (multi-module)

`juni.toml`:

```toml
[project]
name = "hello"
entry = "src/main.juni"
```

`src/math.juni`:

```juni
export fn greet() -> i32:
    return 42
```

`src/main.juni`:

```juni
import math

fn main() -> i32:
    return math.greet()
```

### Browser IDE (local)

```bash
cd ide && npm run build:wasm && npm install && npm run dev
```

### CLI

```bash
cd examples/projects/hello_modules
juni build
```

### Desktop

```bash
cd desktop && npm install && npm run dev
```
