# Graphics overview

Juni ships usable graphics in the browser IDE:

| Path | Status |
|------|--------|
| [Canvas2D](2d.md) | Implemented — `canvas_*` fill + stroke |
| [3D](3d.md) | WebGPU API + ECS editor slice — `world_draw3d`, Mesh3D / Light3D / Camera3D |
| [WebGPU runtime](../webgpu/runtime.md) | Triangle sample + 3D host |

## Games & simulation

- Use `state:` or module `let` for shared game state across `main` and `frame`
- Export `fn frame(dt: f32) -> i32` for a host `requestAnimationFrame` loop
- Poll `key_down`, `mouse_x` / `mouse_y` / `mouse_down`
- Math/stdlib: see [Standard library](../language/stdlib.md) (`clamp`, `lerp`, `len2`, `dist2`, …)

## Hosted IDE

Open the [Juni IDE](https://ajpro774.github.io/Juno/) to run examples without installing locally.
