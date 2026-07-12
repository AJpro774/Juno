# Physics

Juni v5 adds lightweight **axis-aligned bounding box (AABB)** helpers for 2D games and simulations.

## Aabb struct (planned)

```juni
struct Aabb:
    x: f32
    y: f32
    w: f32
    h: f32
```

## Intrinsics (planned)

| Function | Description |
|----------|-------------|
| `aabb_overlap(a, b)` | Returns `true` when two boxes intersect |
| `aabb_resolve(a, b)` | Separates `a` from `b` along the smallest axis |

Until those intrinsics land, projects can implement simple rectangle collision with comparisons and `clamp`, as in `examples/projects/paddle_physics`.

## Example pattern

```juni
state:
    paddle_x: f32 = 272.0
    ball_x: f32 = 320.0
    ball_y: f32 = 180.0

fn frame(dt: f32) -> i32:
    ball_x = ball_x + ball_vx * dt
    ball_y = ball_y + ball_vy * dt
    if ball_y > 300.0 and ball_x >= paddle_x and ball_x <= paddle_x + 96.0:
        ball_vy = -abs(ball_vy)
    return 0
```

Run `juni build` in `examples/projects/paddle_physics` to produce a playable paddle + ball demo.
