# Modules and imports

Juni v5 adds **Python-style modules** for multi-file projects. Each `.juni` file under `src/` is a module; names default to the file stem (`src/math.juni` → module `math`).

## Import forms

```juni
import math
import utils as u

from math import clamp
from math import greet as hello
```

- `import math` brings the module into scope as `math` (or an alias).
- `from math import clamp` imports a single exported symbol for unqualified use.

## Exports

Mark items with `export` to make them visible to other modules:

```juni
export fn greet() -> i32:
    return 42

export fn clamp(x: f32, lo: f32, hi: f32) -> f32:
    if x < lo:
        return lo
    if x > hi:
        return hi
    return x
```

Entry module (`juni.toml` → `entry`) is the only place that may define `main` and `frame`.

## Cross-module calls

Qualified access uses the logical module name:

```juni
import math

fn main() -> i32:
    return math.greet()
```

`from` imports allow direct names:

```juni
from math import clamp

fn main() -> i32:
    let x = clamp(1.5, 0.0, 1.0)
    return as_i32(x)
```

## Cycle detection

Circular imports are rejected at project load time with a clear error.

## Tooling

- `juni check` / `juni build` read `juni.toml` when run in a project directory.
- `juni lsp` indexes the workspace for completion and go-to-definition across modules.

See [juni.toml projects](juni-toml.md) and the `examples/projects/hello_modules` sample.
