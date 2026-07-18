# Physics

Juni ships 2D physics helpers for games and simulations.

## Aabb struct

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
| `aabb_overlap(a, b)` | Returns `true` when two boxes intersect |
| `aabb_resolve_x(moving, other, vel_x)` | Zeroes horizontal velocity on X overlap |
| `aabb_resolve_y(moving, other, vel_y)` | Zeroes vertical velocity on Y overlap |
| `world_step(dt)` | Integrates ECS rigidbodies (velocity, gravity, AABB/circle resolve) + entity scripts |

ECS entities with `rigidbody2d` + `collider2d` components are stepped automatically inside `world_step`.

## Colliders

| Field | Notes |
|-------|--------|
| `type` | `aabb` or `circle` |
| `w` / `h` / `radius` | Size (AABB vs circle) |
| `solid` | `false` → **trigger** (overlap contact, no push / no grounded) |
| `slope` | Degrees from horizontal; when grounded on this surface, applies a light slide |

`rigidbody2d_get_grounded` is set when the contact normal points upward (landing / standing). Prefer Y separation when overlaps are nearly square so platformer landings feel stable.

After `world_step`, prefer entity `on_collision` / `on_trigger_enter` exports for reactions (see [Entity scripts](../engine/scripts.md)); `collision_count` polling remains valid for simple checks.

## Example

See `examples/projects/paddle_physics` (legacy AABB calls) and `examples/projects/platformer` (ECS + `world_step`; coin uses `on_trigger_enter`).
