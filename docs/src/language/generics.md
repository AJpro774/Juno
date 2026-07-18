# Generics

Juni supports **single-parameter** generic functions with an `Ord` constraint. Multi-parameter generics and traits are not available yet.

## Syntax

```juni
fn gmin[T: Ord](a: T, b: T) -> T:
    if a < b:
        return a
    return b

fn main() -> i32:
    let x = gmin(3, 7)       # T = i32
    let y = gmin(2.5, 1.0)   # T = f32
    return x
```

The type parameter is written in `[...]` after the function name. Today the only supported constraint is `Ord`.

## What `Ord` allows

`T: Ord` means `T` must support `<` / comparisons used in the body. Concrete types that satisfy `Ord`:

| Type | Ord |
|------|-----|
| `i32` | yes |
| `f32` | yes |
| other builtins / structs | no |

The checker infers `T` from the call arguments and monomorphizes a specialized copy of the function (for example `gmin$i32`, `gmin$f32`).

## Inference rules

- Exactly **one** type parameter is allowed per function.
- `T` is inferred by unifying parameter types with argument types at each call site.
- All uses of `T` in that call must agree (no conflicting instantiations).
- If inference fails or `T` is not `Ord`, the checker reports an error.

## Limits

- No multi-parameter generics (`fn f[T, U](...)`).
- No trait bounds beyond `Ord`.
- No generic structs or generic methods on structs.
- Explicit turbofish / call-site type arguments are not required (and not supported); rely on argument inference.
