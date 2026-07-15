# Types

Juni is **statically typed**. There is no dynamic typing and no garbage collector.

## Built-ins

| Type | Meaning |
|------|---------|
| `i32` | 32-bit signed integer |
| `i64` | 64-bit signed integer |
| `f32` | 32-bit float |
| `f64` | 64-bit float |
| `bool` | boolean (`true` / `false`) |
| `str` | UTF-8 string (pointer to len-prefixed bytes in memory) |
| `void` | no value (e.g. `print`) |
| `T[N]` | Fixed-length array of `N` elements of type `T` |

## Fixed arrays

```juni
let xs = [1, 2, 3]          # inferred i32[3]
let ys: i32[8] = [0, 1, 2, 3, 4, 5, 6, 7]
let v = xs[0]               # index with i32
xs[1] = 9
```

Arrays live in linear memory. Indexing with a constant out of range is a checker error; runtime bounds traps are optional/future.

## Structs

User-defined product types with named fields. Values are laid out in linear memory; locals of struct type hold an address.

## References

```juni
ref T        # shared/borrowed reference (immutable)
mut ref T    # mutable reference
```

In v0, refs are represented as `i32` pointers in WASM. Full borrow checking is future work.

## Inference

`let x = 1` infers `i32`. `let y = 1.0` infers `f32`. Annotate when you need a different type.

## Standard library (v4)

See [Standard library](stdlib.md) for the full reference. Highlights:

| Function | Signature | Notes |
|----------|-----------|-------|
| `str_len` | `str -> i32` | Byte length of string |
| `str_eq` | `(str, str) -> bool` | Byte-wise compare |
| `str_concat` | `(str, str) -> str` | Heap-allocated concat |
| `clamp` / `lerp` | `(f32, f32, f32) -> f32` | Math helpers |
| `pow` / `sign` / `fmod` / `smoothstep` | various | Math helpers |
| `dist2` | `(f32, f32, f32, f32) -> f32` | 2D distance |
| `pi` | `() -> f32` | π constant |
| `imin` / `imax` / `iclamp` | various | Integer helpers |

Use `3.14159` inline if you prefer a literal over `pi()`.
