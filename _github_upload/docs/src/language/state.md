# Module state

Juni programs that use `main` + `frame` need **shared variables** visible in both functions. Use a module-level `let` or a `state:` block.

## `state:` block

Ergonomic syntax for games and simulations:

```juni
state:
    paddle_x: f32 = 280.0
    score: i32 = 0

fn main() -> i32:
    canvas_init(640, 360)
    return 0

fn frame(dt: f32) -> i32:
    paddle_x = paddle_x + 120.0 * dt
    score = score + 1
    return 0
```

Each field is a **mutable static** in linear memory, laid out at fixed offsets. All functions can read and assign them.

## Module-level `let`

Equivalent to a single field in `state:`:

```juni
let cam: i32 = 0

fn main() -> i32:
    cam = camera3d_perspective(60.0, 1.777, 0.1, 100.0)
    return 0

fn frame(dt: f32) -> i32:
    scene3d_draw(mesh, cam)
    return 0
```

## Initialization

Unlike earlier versions, module `let` / `state` fields may use **any expression** as the initializer — literals, function calls, intrinsics, and struct literals where types match.

Static initializers run at the start of `main` before your code.

## Locals in `main`

Variables declared with `let` **inside** `main` are local to `main` only. If `frame` needs the same name, move it to `state:` or module `let`:

```juni
# Wrong — cam is not visible in frame
fn main() -> i32:
    let cam = camera3d_perspective(60.0, 1.777, 0.1, 100.0)

# Right
state:
    cam: i32 = 0
fn main() -> i32:
    cam = camera3d_perspective(60.0, 1.777, 0.1, 100.0)
```
