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
| `world_step(dt)` | Integrates ECS rigidbodies (velocity, gravity, AABB/circle resolve) |

ECS entities with `rigidbody2d` + `collider2d` components are stepped automatically inside `world_step`.

## Example

See `examples/projects/paddle_physics` (legacy AABB calls) and `examples/projects/platformer` (ECS + `world_step`).
