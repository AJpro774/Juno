# Standard library

Juni ships a **builtin stdlib** of host intrinsics wired in the compiler and runtime. Modules (`import` / `export`) have been available since v6; these builtins need no import.

Graphics, input, ECS, audio, and 3D APIs are documented under [Graphics overview](../graphics/overview.md) and related engine pages. This page covers the core math / string / array helpers.

## Math (`f32`)

| Function | Signature | Notes |
|----------|-----------|-------|
| `sqrt` | `f32 -> f32` | |
| `sin` / `cos` / `tan` | `f32 -> f32` | |
| `abs` | `f32 -> f32` | |
| `floor` / `ceil` | `f32 -> f32` | |
| `min` / `max` | `(f32, f32) -> f32` | |
| `pow` | `(f32, f32) -> f32` | |
| `sign` | `f32 -> f32` | Returns `-1`, `0`, or `1` |
| `fmod` | `(f32, f32) -> f32` | Floating remainder |
| `clamp` | `(f32, f32, f32) -> f32` | Clamp `x` to `[lo, hi]` |
| `lerp` | `(f32, f32, f32) -> f32` | Linear interpolate |
| `smoothstep` | `(f32, f32, f32) -> f32` | Hermite edge blend |
| `deg_to_rad` / `rad_to_deg` | `f32 -> f32` | Angle conversion |
| `len2` | `(f32, f32) -> f32` | Length of vector `(x, y)` |
| `dot2` | `(f32, f32, f32, f32) -> f32` | Dot product of two 2D vectors |
| `dist2` | `(f32, f32, f32, f32) -> f32` | 2D Euclidean distance |
| `pi` | `() -> f32` | π constant |
| `rand` | `() -> f32` | Random in `[0, 1)` |
| `now` | `() -> f32` | Seconds since program start |

## Integer (`i32`)

| Function | Signature |
|----------|-----------|
| `abs_i32` | `i32 -> i32` |
| `imin` / `imax` | `(i32, i32) -> i32` |
| `iclamp` | `(i32, i32, i32) -> i32` |
| `as_i32` | `f32 -> i32` |
| `as_f32` | `i32 -> f32` |

## Strings

| Function | Signature | Notes |
|----------|-----------|-------|
| `str_len` | `str -> i32` | Byte length |
| `str_eq` | `(str, str) -> bool` | Byte-wise compare |
| `str_concat` | `(str, str) -> str` | Allocates on the WASM heap |
| `str_substr` | `(str, i32, i32) -> str` | Substring by byte offset and length. Out-of-bounds `start`/`len` (or overflow) traps at runtime. |

## Arrays

| Function | Signature | Notes |
|----------|-----------|-------|
| `array_len` | `T[N] -> i32` | Compile-time length `N` of a fixed array (lowered to a constant) |

## Example

```juni
fn main() -> i32:
    print(pow(2.0, 10.0))
    print(dist2(0.0, 0.0, 3.0, 4.0))
    print(str_concat("Juni ", "v11"))
    print(iclamp(99, 0, 10))
    let xs = [1, 2, 3]
    print(array_len(xs))
    return 0
```

See also [Types](types.md) for `T[N]` indexing and runtime bounds traps.
