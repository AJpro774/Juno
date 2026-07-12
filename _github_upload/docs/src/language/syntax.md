# Syntax

Juni uses **indentation** (spaces) for blocks, similar to Python.

## Functions

```juni
fn add(a: i32, b: i32) -> i32:
    return a + b
```

## Structs

```juni
struct Vec2:
    x: f32
    y: f32
```

Struct literals use named fields:

```juni
let p = Vec2(x=1.0, y=2.0)
```

## Locals

```juni
let n = 10
let m: i32 = 20
```

Types on locals are optional when they can be inferred from the initializer.

## Strings and print

```juni
fn main() -> i32:
    print("Hello, World!")
    print(42)
    return 0
```

String literals use double quotes. Escapes: `\n`, `\t`, `\"`, `\\`.
`print` accepts `str`, `i32`, `bool`, or `f32`.

## Arrays and `for`

```juni
let xs = [1, 2, 3]
for i in 0..3:
    print(xs[i])
```

See [Types](types.md) for `T[N]` and [Control flow](control-flow.md) for range loops. Graphics helpers (`canvas_*`, `gpu_*`) are documented under Graphics.

## Comments

```juni
# this is a comment
```

## Keywords

`fn`, `struct`, `let`, `if`, `else`, `while`, `return`, `new`, `delete`, `ref`, `mut`, `true`, `false`, `and`, `or`, `not`
