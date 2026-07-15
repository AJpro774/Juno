# WebGPU runtime

## Imports

| Import | Role |
|--------|------|
| `env.gpu_clear` / `gpu_draw_triangle` | v2 colored triangle sample |
| `env.scene3d_*` / `camera3d_*` / `mesh3d_*` | v3 small 3D API |
| `env.sin_f32` … `now_f32` | Math helpers |
| `env.key_down` / `mouse_*` | Input polling |

## Frame loop

If the module exports `frame(dt: f32)`, the IDE runs it every animation frame after `main`. Return nonzero to stop.

## CLI

Node stubs GPU and input. Use the browser IDE for real draws and keys.
