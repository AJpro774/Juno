# Assets

Juni projects keep media under `assets/` and optionally an `assets.pack.json` manifest the IDE/runtime resolve at play/export time.

## Layout

```
project/
  assets/
    sprites/hero.png
    sprites/hero_sheet.png
    audio/beep.wav
    meshes/ship.gltf
  assets.pack.json   # optional / generated
```

## Sprite sheets

On a Sprite component (Inspector or `.jscene`):

| Field | Role |
|-------|------|
| `asset` | Path under `assets/` |
| `w` / `h` | Draw size |
| `cols` / `rows` | Sheet grid (default `1`) |
| `fps` | Animate through frames when `> 0` |

The 2D renderer samples `frame = floor(time * fps)` across `cols * rows` cells.

## glTF / GLB

`mesh_load_gltf(path)` and Mesh3D authoring (`primitive: "gltf"`) accept:

- **`.gltf` JSON** — multi-primitive meshes, embedded base64 buffers, optional external URI resolver
- **`.glb` binary** — glTF 2.0 container (JSON + BIN chunks); same mesh path as JSON

Also:

- `COLOR_0` when present; otherwise a soft tint from `NORMAL`
- Scene node → first mesh selection when `scenes` / `nodes` are present

Prefer `.gltf` (+ embedded buffers) for hand-authored samples; ship `.glb` when you have a packed binary asset.

## Runtime APIs

| API | Purpose |
|-----|---------|
| `asset_load_str(path)` | Load a text asset (JSON, shader source) |
| `sprite_draw(id, x, y, w, h)` | Draw a packed sprite region |
| `mesh_load_obj(path)` | Load a Wavefront OBJ mesh handle |
| `mesh_load_gltf(path)` | Load a glTF / GLB mesh handle |

Browser runtime resolves packed assets from the project; Node stubs return safe defaults.

## Example

See `examples/projects/canvas_sprite` and `examples/projects/scene3d_lit` (`assets/triangle.gltf`).
