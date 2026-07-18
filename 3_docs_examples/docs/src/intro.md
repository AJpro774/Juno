# Introduction

**Juni** is a systems language with Python-like ergonomics and C++-level control. It compiles to **WebAssembly**, with Canvas2D, a small WebGPU 3D API, frame loops, and input for games and simulations.

**v7.1** adds an optional **local AI assistant** in the IDE (WebLLM + Qwen2.5-Coder-1.5B on WebGPU): autocorrect suggestions, diagnostic explanations, and a small chat panel — off by default.

**v7.0** is the game-engine release: host-side **ECS**, **`.jscene` scenes**, 2D cameras/sprites/tilemaps, 3D lights/glTF, physics step, and a **visual editor** (hierarchy, inspector, asset browser, Edit/Play) on top of the v6 language toolchain.

**v6.0** added Python-style **modules**, **`juni.toml` projects**, multi-tab IDE, asset manifest, richer 3D samples, physics/audio foundations, **`juni lsp`**, and a **Tauri desktop** shell.

**[Try the IDE online](https://ajpro774.github.io/Juno/)** (GitHub Pages).

Author: **Alexander James Patton**. Credits: open **Credits** in the IDE or see `CREDITS.md`.

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
