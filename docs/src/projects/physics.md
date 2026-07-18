# Physics

Juni ships 2D and 3D physics that **coexist** in the same `world_step`. The 2D solver always runs first; the 3D AABB solver runs after. Contacts from both share one `collision_*` buffer and the same script events.

## Modes

| Mode | Components | Notes |
|------|------------|--------|
| **Pure 2D** | `transform2d` + `rigidbody2d` + `collider2d` | Existing platformer / paddle path — unchanged |
| **Pure 3D** | `transform3d` + `rigidbody3d` + `collider3d` | AABB only (`kind` / `type`: `aabb`); gravity pulls −Y |
| **Hybrid** | 2D phys + `transform3d` / `mesh3d` | After 2D step, host syncs `x,y` → `tx,ty` (keeps `tz`) for entities with 2D transform and 3D pose/mesh but **no** `rigidbody3d` |

Do not put both `rigidbody2d` and `rigidbody3d` on the same entity — hybrid means **2D physics driving 3D render**.

## Pure 3D

Author `transform3d` + `rigidbody3d` + `collider3d` (and usually `mesh3d`) in a `.jscene`, then:

```juni
fn main() -> i32:
    scene3d_init(640, 360)
    world_create()
    let _ = scene_load("scenes/level1.jscene")
    # find player / cam; attach any prefab meshes
    return 0

fn frame(dt: f32) -> i32:
    rigidbody3d_set_vel(player, vx, jump_or_sentinel, vz)
    world_step(dt)
    world_draw3d(cam)
    return 0
```

See `examples/projects/platformer_3d` for a full vertical slice (move on XZ, jump on Y, coin enter/exit, hazard/goal).

## Hybrid 2D-phys / 3D-draw

Keep gameplay on the familiar 2D solver, but draw with `world_draw3d`:

1. Entity has `transform2d` + `rigidbody2d` + `collider2d` for physics.
2. Add `transform3d` + `mesh3d` for rendering (author a `tz` depth if you want).
3. Do **not** add `rigidbody3d` on that entity.
4. Each `world_step`: 2D solve → auto hybrid sync (`x,y` → `tx,ty`) → 3D solve (other bodies) → scripts.
5. Optionally call `transform3d_sync_from_2d(id)` yourself after moving an entity outside the step.

```juni
# Authoring sketch — 2D body, 3D mesh
# transform2d + rigidbody2d + collider2d + transform3d + mesh3d
fn frame(dt: f32) -> i32:
    rigidbody2d_set_vel(player, vx, jump_or_sentinel)
    world_step(dt)
    world_draw3d(cam)
    return 0
```

## Aabb struct (legacy 2D helpers)

```juni
struct Aabb:
    x: f32
    y: f32
    w: f32
    h: f32
```

## Intrinsics

| Function | Description |
|----------|-------------|
| `aabb_overlap` / `aabb_resolve_x` / `aabb_resolve_y` | Legacy AABB helpers |
| `world_step(dt)` | 2D phys → hybrid sync → 3D phys → scripts |
| `rigidbody2d_set_vel` / `rigidbody2d_get_grounded` | 2D body |
| `collider2d_set(id, kind, w, h, radius, solid)` | kind `0`=aabb, `1`=circle |
| `rigidbody3d_set_vel(id, vx, vy, vz)` | 3D body (`1e6` sentinel keeps current `vy`/`vz`) |
| `rigidbody3d_get_grounded(id)` | 3D grounded (upward contact) |
| `collider3d_set(id, kind, w, h, d, solid)` | kind `0`=aabb only today |
| `transform3d_sync_from_2d(id)` | Explicit hybrid sync for one entity |
| `collision_count` / `collision_entity_a` / `collision_entity_b` / `collision_is_trigger` | Shared 2D+3D contacts |

## Colliders (2D)

| Field | Notes |
|-------|--------|
| `type` | `aabb` or `circle` |
| `w` / `h` / `radius` | Size |
| `solid` | `false` → **trigger** |
| `slope` | Degrees; light slide when grounded |

## Colliders (3D)

| Field | Notes |
|-------|--------|
| `type` / `kind` | `aabb` only |
| `w` / `h` / `d` | Full extents centered on `transform3d` |
| `solid` | `false` → **trigger** |

After `world_step`, use `on_collision` / `on_trigger_enter` / `on_trigger_exit` (see [Entity scripts](../engine/scripts.md)).

## Examples

- Pure 2D: `examples/projects/platformer`, `examples/projects/paddle_physics`
- Pure 3D: `examples/projects/platformer_3d`
- Hybrid: same `world_step` path — add `transform3d`/`mesh3d` beside 2D phys components (see above)
