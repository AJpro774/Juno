# Host imports: `extern`

An `extern` block declares functions that live **outside** the WASM module —
in the engine, editor, or browser host that runs your program. Each entry
becomes one WASM import `(module, name)`; the host supplies the implementation
when it instantiates the module.

```juni
extern "kerabit":
    fn entity(name: str) -> i32
    fn set_pos(e: i32, x: f32, y: f32, z: f32)
    fn key_down(name: str) -> bool
    fn dt() -> f32

state:
    player: i32 = 0

fn main() -> i32:
    player = entity("player")
    set_pos(player, 0.0, 0.5, 0.0)
    return 0

fn frame(delta: f32) -> i32:
    if key_down("W"):
        set_pos(player, dt() * 4.0, 0.5, 0.0)
    return 0
```

## Rules

- The string after `extern` is the WASM **import module** (`"kerabit"` above).
  Builtins such as `print` and `sqrt` live in `"env"`; pick any other name for
  your host.
- Entries are signatures only: `fn name(params) -> ret`. A body is an error.
  Omit `-> ret` for a function that returns nothing.
- Only scalars cross the boundary: `i32`, `i64`, `f32`, `f64`, `bool`, and
  `str`. Structs, arrays, and refs are rejected at check time. Pass handles
  (`i32`) for host objects instead.
- `str` arrives in the host as an `i32` pointer into the exported `memory`:
  `[len: i32 little-endian][utf8 bytes]`. `bool` is an `i32` `0`/`1`.
- Integer literals and `i32` values passed to an `f32` parameter are widened
  automatically, matching the builtin math intrinsics.
- An extern **shadows** a builtin intrinsic of the same name, so a host can
  redefine e.g. `key_down(name: str) -> bool` with its own signature.
- Declaring the same name twice, or both an extern and a `fn` with one name,
  is an error. `main` and `frame` cannot be externs.

## Sharing externs between modules

Mark the block `export` and import it like any other symbol:

```juni
# src/host.juni
export extern "kerabit":
    fn quit()
```

```juni
# src/main.juni
import host
from host import quit as leave

fn main() -> i32:
    host.quit()
    leave()
    return 0
```

Identical declarations in several modules collapse into a single import.

## Preludes (engine embedding)

Engines that embed the compiler (`juni_driver::compile_single_with_prelude`)
pass one or more **prelude** modules. Every export of a prelude is visible
unqualified in the user's file, so a game script can call `set_pos(...)`
without any `import`. Local definitions and explicit imports always take
precedence over prelude names.

## Import layout

The emitted module imports **only the builtins it calls**, followed by the
`extern` declarations in source order. A host can enumerate
`WebAssembly.Module.imports(...)` (or read `CompileOutput::externs` from the
driver) to link exactly what a program needs.

In the browser runtime, `instantiateJuni(bytes, { extraImports })` supplies
host functions by module and name; any missing extern is stubbed to return `0`
so IDE previews of engine scripts still start (pass
`stubMissingExterns: false` to fail fast instead).
