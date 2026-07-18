# Introduction

**Juni** is a systems language with Python-like ergonomics and C++-level control. It compiles to **WebAssembly**, with Canvas2D, a small WebGPU 3D API, frame loops, and input for games and simulations in the browser IDE.

**v4.0** adds `state:` blocks, memory-backed module statics, expanded stdlib, canvas stroke APIs, and a hosted IDE.

**[Try the IDE online](https://ajpro774.github.io/Juno/)** (GitHub Pages).

Author: **Alexander James Patton**. Credits: open **Credits** in the IDE or see `CREDITS.md`.

## Quick example

```juni
state:
    score: i32 = 0

fn main() -> i32:
    print("Hello, World!")
    return 0

fn frame(dt: f32) -> i32:
    score = score + 1
    return 0
```

### Browser IDE (local)

```bash
cd ide && npm run build:wasm && npm install && npm run dev
```

### CLI

```bash
cargo run -p juni-cli -- build examples/hello_world.juni -o hello.wasm
node runtime/host.js hello.wasm
```
