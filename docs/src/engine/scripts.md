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

## Authoring in the IDE

Inspector → **Script**: enable, set **Module** and **Handler**. Values round-trip through Save Scene / `.jscene`.

Game logic can still live in the entry `frame` (input, win/lose). Use entity scripts for per-entity ticks that should run whenever `world_step` runs.

## Notes

- Only entry `main` / `frame` are exported by the Juni compiler today. Prefer `registerScriptHandler` from the host, or export a matching WASM function from a custom build if you need Juni-side handlers by name.
- Scripts run **after** physics so `rigidbody2d_get_grounded` and collision polls reflect the current step.
- See [`.jscene`](jscene.md), [Physics](../projects/physics.md), and [Visual editor](editor.md).
