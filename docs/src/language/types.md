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

Arrays live in linear memory. Indexing with a **constant** out of range is a checker error. Dynamic indexes are checked at runtime and trap (`unreachable`) if out of bounds. Use `array_len(xs)` to get the compile-time length `N` of a `T[N]` value.

## Structs

User-defined product types with named fields. Values are laid out in linear memory; locals of struct type hold an address.

## References and borrow checking

```juni
ref T        # shared/borrowed reference (immutable)
mut ref T    # mutable reference
```

In WASM, refs are still represented as `i32` pointers. The checker enforces aliasing rules; there is no runtime borrow runtime.

### Rules

1. **No writes through `ref T`.** Field (or index) stores require `mut ref T`.
2. **Exclusive mutable aliases.** A place may have either one active `mut ref` **or** any number of shared `ref`s — not both, and not two `mut ref`s at once.
3. **`mut ref` moves.** Copying a `mut ref` into another local moves the exclusive alias (the source is invalidated). Shared `ref`s may be copied.
4. **Call arguments.** Passing the same place as both a `mut ref` and another ref (or two `mut ref`s) in one call is an error.
5. **Escape (conservative).** Storing a parameter `ref`/`mut ref` into module `state` / statics is rejected (would outlive the caller). Returning heap refs (`new`) or re-exporting parameter refs is allowed. Full non-lexical region inference (Rust NLL) is out of scope.

```juni
struct Node:
    v: i32

fn bump(p: mut ref Node) -> i32:
    p.v = p.v + 1
    return p.v

fn peek(p: ref Node) -> i32:
    return p.v
    # p.v = 0   # error: write through immutable ref

fn main() -> i32:
    let a = new Node(v=1)
    let b = a              # moves mut ref; `a` no longer aliases
    print(bump(b))
    # peek(b) and bump(b) in ways that alias mut+shared in one call → error
    return 0
```

See also [Memory](memory.md) for `new` / `delete` (heap returns `mut ref T`).

## Generics

Single-parameter generic functions with `T: Ord` are supported. See [Generics](generics.md).

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
