# Engine host intrinsics

Juni games call these as language builtins (no `import`). They map to WASM `env.*` imports implemented by the TypeScript runtime.

## Frame / IO

| Call | Notes |
|------|--------|
| `print` / `print` overloads | Console output |
| `key_down(code)` | Keyboard poll |
| `mouse_x` / `mouse_y` / `mouse_down` | Mouse |
| `gamepad_axis` / `gamepad_button` | Gamepad |

## Canvas2D

| Call | Notes |
|------|--------|
| `canvas_init(w,h)` | Size preview |
| `canvas_clear` / `canvas_fill_rect` / `canvas_fill_circle` | Fill |
| `canvas_fill_text` / `canvas_draw_line` / `canvas_stroke_rect` | Text / stroke |
| `asset_load_str(path)` | Asset handle |
| `sprite_draw(handle,x,y,w,h)` | Immediate sprite blit |

## ECS / 2D world

| Call | Notes |
|------|--------|
| `world_create()` | Init/reset world |
| `entity_create` / `entity_destroy` | Lifecycle |
| `entity_set_tag` / `entity_find_by_tag` | Named lookup |
| `transform2d_set` / `transform3d_set` | Pose |
| `sprite_set` / `mesh3d_attach` | Render attachments |
| `camera2d_set` | 2D camera |
| `camera2d_follow(cam, target, smooth)` | Follow target each step |
| `scene_load(path)` | Load `.jscene` |
| `prefab_spawn(path, x, y)` | Spawn prefab fragment |
| `tilemap_load` / `tilemap_attach` | Tilemaps |
| `world_step(dt)` | Physics + animation + camera follow + entity script dispatch |
| `world_draw(cam)` | Draw 2D world |
| `rigidbody2d_set_vel` / `rigidbody2d_get_grounded` | Body control |
| `collider2d_set(id, kind, w, h, radius, solid)` | kind 0=aabb, 1=circle |
| `collision_count` / `collision_entity_a` / `collision_entity_b` | Contact poll |

Entity `script` components are dispatched inside `world_step` — see [Entity scripts](scripts.md).

## 3D (WebGPU)

| Call | Notes |
|------|--------|
| `scene3d_init` / `scene3d_clear` / `scene3d_draw` | Scene |
| `camera3d_perspective` / `look_at` / `orbit` | Camera |
| `mesh3d_box` / `mesh3d_custom` / `set_pose` / `rotate` | Meshes |
| `material3d_color` / `material3d_texture` / `mesh3d_set_material` | Materials |
| `light3d_directional` / `light3d_point` | Lights |
| `mesh_load_gltf(path)` | glTF mesh (multi-primitive, external buffers) |
| `world_draw3d(cam)` | Draw all ECS `mesh3d` entities |
| `scene3d_set_ambient` / `scene3d_set_fog` | Atmosphere |

## Physics / audio

| Call | Notes |
|------|--------|
| `aabb_overlap` / `aabb_resolve_x` / `aabb_resolve_y` | Legacy AABB |
| `audio_load` / `audio_play` / `audio_play_loop` / `audio_set_volume` | Web Audio |

See [Engine overview](overview.md), [`.jscene`](jscene.md), and [Physics](../projects/physics.md).
