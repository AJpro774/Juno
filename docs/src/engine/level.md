# Making a level

Build a playable Juni level with `.jscene`, ECS physics, and a short `frame` loop.

## Pieces

1. **Scene** — `scenes/level1.jscene` with tagged entities (`player`, `camera`, platforms, triggers)
2. **Prefabs** — `prefabs/*.jscene` fragments spawned with `prefab_spawn(path, x, y)`
3. **Script** — `main` loads the scene; `frame` drives input, polls collisions, draws

## Intrinsics

| API | Role |
|-----|------|
| `scene_load(path)` | Replace world with a scene |
| `prefab_spawn(path, x, y)` | Merge a prefab (no reset) |
| `camera2d_follow(cam, target, smooth)` | Lerp camera toward target each `world_step` |
| `rigidbody2d_set_vel` / `rigidbody2d_get_grounded` | Control / query the player body |
| `collider2d_set` | Configure AABB (`kind=0`) or circle (`kind=1`) |
| `collision_count` / `collision_entity_a` / `collision_entity_b` | Poll contacts after `world_step` |
| `world_step` / `world_draw` | Physics + 2D draw |

Non-solid colliders act as **triggers** (overlap contacts, no resolution). Optional `slope` (degrees) on solid colliders adds a light slide when grounded. Entity **script** handlers run at the end of each `world_step` — see [Entity scripts](scripts.md).

## Example flow

See [`examples/projects/platformer`](../../examples/projects/platformer): goal / hazard triggers, coin prefab, Space to restart after death.

## Editor

Author entities in the IDE Hierarchy / Inspector, **Save Scene** to disk, then **Play**. See [Visual editor](../engine/editor.md).
