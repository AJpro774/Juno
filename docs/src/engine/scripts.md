# Entity scripts (host ABI)

Entities can declare a `script` component in `.jscene`:

```json
"script": { "module": "player", "handler": "on_update" }
```

During each `world_step`, after physics and camera follow, the host **dispatches** script events for every entity that has a script.

## Events

| Event | When | Signature |
|-------|------|-----------|
| `{handler}` (usually `on_update`) | Every `world_step`, after collision events | `(entity_id: i32, dt: f32) -> i32` |
| `on_collision` | Each frame while a **solid** contact involves the entity | `(entity_id: i32, other_id: i32, dt: f32) -> i32` |
| `on_trigger_enter` | Once when a **trigger** contact pair first appears | `(entity_id: i32, other_id: i32, dt: f32) -> i32` |

`on_collision` / `on_trigger_enter` are **fixed additive names** — they do not replace the inspector `handler` field. Both entities in a contact are called when they have a `script` component and a matching WASM export or JS handler exists.

Return values are ignored today (reserved for future stop/error codes).

## Resolution order

For `module = "player"` and `handler = "on_update"`:

1. **JS registry** — `registerScriptHandler("player", "on_update", fn)` (key `player:on_update`, then bare `on_update`)
2. **WASM export** — `player_on_update`, then bare `on_update`

Same order for `player_on_collision` / `player_on_trigger_enter` (and bare `on_collision` / `on_trigger_enter`).

Missing handlers are skipped (no throw). Bind WASM after instantiate:

```ts
import { bindScriptWasm, registerScriptHandler } from "juni-runtime";

const instance = await instantiateJuni(bytes, options);
bindScriptWasm(instance.exports); // also done automatically by startFrameLoop / instantiateJuni

registerScriptHandler("coin", "on_trigger_enter", (entityId, otherId, dt) => {
  // host-side behaviour when a trigger pair involving this entity appears
});
```

## Authoring in Juni (preferred)

In the **entry** module, declare `export fn` names `{module}_{event}`:

```juni
export fn player_on_update(entity_id: i32, dt: f32) -> i32:
    # per-entity tick after physics + collision events
    return 0

export fn player_on_collision(entity_id: i32, other_id: i32, dt: f32) -> i32:
    # solid contact this frame
    return 0

export fn coin_on_trigger_enter(entity_id: i32, other_id: i32, dt: f32) -> i32:
    # first frame of a trigger overlap
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

The compiler exports entry-module `export fn` names to WASM (same as `main` / `frame`). Inspector **Module** `player` + **Handler** `on_update` therefore invokes Juni — no JS `registerScriptHandler` required. Collision/trigger exports use the same module prefix.

Library modules may still use `export fn` for imports; those stay mangled and are **not** WASM script exports. Put script handlers in the entry file (or re-export a thin wrapper there).

## Polling contacts

After `world_step`, scripts and `frame` can also poll:

| Call | Notes |
|------|--------|
| `collision_count()` | Number of contacts this step |
| `collision_entity_a(i)` / `collision_entity_b(i)` | Entity ids for contact `i` |
| `collision_is_trigger(i)` | `1` if the contact is a trigger overlap, else `0` |

## Authoring in the IDE

Inspector → **Script**: enable, set **Module** and **Handler**. Use **Stub** to append a missing `export fn {module}_{handler}` in the project entry `.juni`, then **Open** to jump to it. Values round-trip through Save Scene / `.jscene`.

**Authoring loop:** Stub the export → set a trigger/solid collider → **Show colliders** in Edit to confirm the shape → Play / Export Web. Collision and trigger events (`on_collision` / `on_trigger_enter`) use the same Stub/Open path with those fixed names.

Game input can still live in entry `frame`. Use entity scripts for per-entity ticks and collision/trigger reactions that should run whenever `world_step` runs. The [platformer](../../examples/projects/platformer) sample collects the coin via `coin_on_trigger_enter`; goal and hazard still poll contacts after `world_step`.

## Notes

- Scripts run **after** physics so `rigidbody2d_get_grounded` and collision polls reflect the current step.
- Dispatch order inside `world_step`: physics → `on_collision` / `on_trigger_enter` → inspector `handler` (`on_update`).
- JS handlers remain useful for tests and host extensions; Juni WASM handlers are the in-engine path.
- See [`.jscene`](jscene.md), [Physics](../projects/physics.md), and [Visual editor](editor.md).
