# Engine overview

Juni games run as WebAssembly with a host-side **ECS world**. Entities live in the JavaScript runtime; Juni scripts drive them through handle-based intrinsics.

## Core loop

```juni
fn main() -> i32:
    canvas_init(640, 360)
    world_create()
    scene_load("scenes/level1.jscene")
    return 0

fn frame(dt: f32) -> i32:
    world_step(dt)
    world_draw(0)
    return 0
```

## Entities

| Intrinsic | Purpose |
|-----------|---------|
| `world_create()` | Reset / create the active world |
| `entity_create()` | Spawn entity; returns `i32` id |
| `entity_destroy(id)` | Remove entity |
| `entity_set_tag(id, tag)` | Name for lookup |
| `entity_find_by_tag(tag)` | Query by tag (`0` if missing) |
| `transform2d_set(id, x, y, rot, sx, sy)` | 2D pose |
| `transform3d_set(id, tx..sz)` | 3D pose (10 args) |
| `sprite_set(id, tex, w, h)` | Attach 2D sprite |
| `mesh3d_attach(id, mesh)` | Attach 3D mesh handle |
| `camera2d_set(id, x, y, zoom)` | Active 2D camera |
| `scene_load(path)` | Load a `.jscene` into the world |
| `tilemap_load` / `tilemap_attach` | Tilemap assets |
| `world_step(dt)` | Physics + animation + camera follow + entity script dispatch |
| `world_draw(cam)` | Draw all 2D sprites / tilemaps |

See [Entity scripts](scripts.md) for the host ABI (`module` / `handler` → WASM or JS).

## 2D systems

- **Camera2D** — pan/zoom via `camera2d_set`; `world_draw` transforms sprites into screen space
- **Sprites** — textured quads with optional sheet animation (`cols` / `rows` / `fps` on ECS components)
- **Tilemaps** — JSON grids via `tilemap_load` + `tilemap_attach`
- **Physics** — `world_step` integrates `rigidbody2d` + resolves `collider2d` (AABB / circle; triggers + optional slope)
- **Scripts** — entity `script` handlers dispatched each `world_step`

## 3D systems

- WebGPU scene graph (`scene3d_*`, `mesh3d_*`, `camera3d_*`)
- Flat and textured materials (`material3d_color`, `material3d_texture`)
- Directional / point lights (`light3d_directional`, `light3d_point`)
- Minimal glTF JSON load (`mesh_load_gltf`)
- Frustum culling on draw

## Input / audio

- Expanded keyboard map + `gamepad_axis` / `gamepad_button`
- `audio_load`, `audio_play`, `audio_play_loop`, `audio_set_volume`

## Docs map

- Full intrinsic table: [intrinsics](intrinsics.md)
- Scenes: [`.jscene`](jscene.md)
- Scripts: [entity scripts](scripts.md)
- Editor: [visual editor](editor.md)
- Optional IDE AI: [AI assistant](../projects/ai-assistant.md)
