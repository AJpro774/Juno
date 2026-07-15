# Control flow

## `if` / `else`

```juni
if x > 0:
    return 1
else:
    return 0
```

Conditions must be `bool`. Use comparisons (`==`, `!=`, `<`, `<=`, `>`, `>=`) or `and` / `or` / `not`.

## `while`

```juni
let i = 0
while i < 10:
    i = i + 1
```

## `for` ranges

Half-open range `lo..hi` (includes `lo`, excludes `hi`). Desugars to a `while` loop:

```juni
let s = 0
for i in 0..10:
    s = s + i
```

The loop variable is `i32`.

## `break` / `continue`

Use inside `while` or `for` loops:

```juni
let i = 0
while i < 10:
    i = i + 1
    if i == 5:
        continue
    if i == 8:
        break
```

## Frame loop

Export a second function for interactive programs:

```juni
fn frame(dt: f32) -> i32:
    # dt is seconds since last frame
    return 0
```

The IDE calls `frame` via `requestAnimationFrame` after `main`. Return nonzero to stop.

## Input (IDE)

| Call | Meaning |
|------|---------|
| `key_down(code)` | 1 if held — 0 left, 1 right, 2 up, 3 down, 4 A, 5 D, 6 W, 7 S, 8 space |
| `mouse_x()` / `mouse_y()` | Canvas coordinates |
| `mouse_down(button)` | Left button is `0` |

## Math helpers

`sin` / `cos` / `tan` / `abs` / `floor` / `ceil` / `min` / `max` / `sqrt` / `rand` / `now` / `as_i32` / `as_f32` / `clamp` / `lerp` / `pow` / `sign` / `fmod` / `smoothstep` / `deg_to_rad` / `rad_to_deg` / `dist2` / `pi`.

See [Standard library](stdlib.md) for the full list.

## Strings

`str_len(s)` returns byte length. `str_eq(a, b)` compares two `str` values. `str_concat(a, b)` allocates a new string on the heap.

## Module state

Use a `state:` block or module-level `let` for variables shared across `main` and `frame`. See [Module state](state.md).

```juni
state:
    score: i32 = 0

fn frame(dt: f32) -> i32:
    score = score + 1
    return 0
```

Initializers may be any expression; static setup runs at the start of `main`.

## `return`

```juni
return 42
return
```

The value must match the function’s return type.

## Assignment

```juni
x = x + 1
p.x = 1.0
```
