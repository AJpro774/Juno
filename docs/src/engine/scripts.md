# Entity scripts (host ABI)

Entities can declare a `script` component in `.jscene`:

```json
"script": { "module": "player", "handler": "on_update" }
```

During each `world_step`, after physics and camera follow, the host **dispatches** that handler for every entity that has a script.

## Call signature

```text
handler(entity_id: i32, dt: f32) -> i32
```

Return value is ignored today (reserved for future stop/error codes).

## Resolution order

For `module = "player"` and `handler = "on_update"`:

1. **JS registry** — `registerScriptHandler("player", "on_update", fn)` (key `player:on_update`, then bare `on_update`)
2. **WASM export** — `player_on_update`, then bare `on_update`

Missing handlers are skipped (no throw). Bind WASM after instantiate:

```ts
import { bindScriptWasm, registerScriptHandler } from "juni-runtime";

const instance = await instantiateJuni(bytes, options);
bindScriptWasm(instance.exports); // also done automatically by startFrameLoop / instantiateJuni

registerScriptHandler("coin", "on_update", (entityId, dt) => {
  // host-side behaviour for entities with script.module === "coin"
});
```

## Authoring in Juni (preferred)

In the **entry** module, declare an `export fn` whose name is `{module}_{handler}`:

```juni
export fn player_on_update(entity_id: i32, dt: f32) -> i32:
    # per-entity tick after physics
    return 0

fn main() -> i32:
    world_create()
    let _ = scene_load("scenes/level1.jscene")
    return 0

fn frame(dt: f32) -> i32:
    world_step(dt)
    world_draw(cam)
    return 0
```

The compiler exports entry-module `export fn` names to WASM (same as `main` / `frame`). Inspector **Module** `player` + **Handler** `on_update` therefore invokes Juni — no JS `registerScriptHandler` required.

Library modules may still use `export fn` for imports; those stay mangled and are **not** WASM script exports. Put script handlers in the entry file (or re-export a thin wrapper there).

## Authoring in the IDE

Inspector → **Script**: enable, set **Module** and **Handler**. Values round-trip through Save Scene / `.jscene`.

Game input can still live in entry `frame`. Use entity scripts for per-entity ticks that should run whenever `world_step` runs.

## Notes

- Scripts run **after** physics so `rigidbody2d_get_grounded` and collision polls reflect the current step.
- JS handlers remain useful for tests and host extensions; Juni WASM handlers are the in-engine path.
- See [`.jscene`](jscene.md), [Physics](../projects/physics.md), and [Visual editor](editor.md).
