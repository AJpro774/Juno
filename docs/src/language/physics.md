# Physics

Juni includes 2D AABB/circle helpers and ECS physics (`rigidbody2d` / `collider2d`), plus 3D AABB physics (`rigidbody3d` / `collider3d`). See [Projects → Physics](../projects/physics.md) for pure 2D, pure 3D, and hybrid 2D-phys → 3D-render.

## `Aabb` struct

An `Aabb` is a rectangle stored as top-left position plus size:

```juni
struct Aabb:
    x: f32
    y: f32
    w: f32
    h: f32
```

- `x`, `y` — top-left corner in pixels
- `w`, `h` — width and height

Create a value with a struct literal or `new`:

```juni
let box = Aabb(x=10.0, y=20.0, w=32.0, h=32.0)
```

## Intrinsics

| Function | Description |
|----------|-------------|
| `aabb_overlap(a, b)` | Returns `true` when two `Aabb` values overlap |
| `aabb_resolve_x(moving, other, vel_x)` | Zeroes horizontal velocity when `moving` penetrates `other` on the X axis |
| `rigidbody3d_set_vel` / `collider3d_set` | 3D ECS body / AABB collider |
| `transform3d_sync_from_2d(id)` | Hybrid: copy 2D pose into 3D |

Example:

```juni
if aabb_overlap(ball_box, paddle_box):
    vel_x = aabb_resolve_x(ball_box, paddle_box, vel_x)
```

See `examples/projects/paddle_physics` for a paddle-and-ball demo, and [Projects → Physics](../projects/physics.md) for ECS modes.
