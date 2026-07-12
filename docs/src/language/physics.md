# Physics

Juni v5 includes axis-aligned bounding box (AABB) helpers for 2D game physics.

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

Example:

```juni
if aabb_overlap(ball_box, paddle_box):
    vel_x = aabb_resolve_x(ball_box, paddle_box, vel_x)
```

See `examples/projects/paddle_physics` for a full paddle-and-ball demo.
