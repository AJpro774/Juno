/**
 * Host ABI for entity `script` components.
 *
 * Each entity may declare `{ module, handler }` in `.jscene`. During `world_step`,
 * the host looks up a callable and invokes:
 *
 *   handler(entity_id: i32, dt: f32) -> i32
 *
 * Fixed collision/trigger events (not the inspector `handler` field):
 *
 *   {module}_on_collision(entity_id, other_id, dt) -> i32   — each frame, solid contacts
 *   {module}_on_trigger_enter(entity_id, other_id, dt) -> i32 — once when a trigger pair appears
 *
 * Resolution order for `module="player"`, `handler="on_update"`:
 * 1. JS registry key `player:on_update` (then bare `on_update`)
 * 2. WASM export `player_on_update` (then bare `on_update`)
 *
 * Prefer Juni: in the entry module, `export fn player_on_update(entity_id: i32, dt: f32) -> i32`
 * — the compiler emits that WASM export so Inspector script bindings invoke Juni without
 * `registerScriptHandler`. Missing handlers are skipped (no throw). Bind the WASM instance
 * after instantiate via `bindScriptWasm(instance.exports)`.
 */
import type { World } from "./world.js";
export type ScriptHandlerFn = (entityId: number, dt: number) => number | void;
export type CollisionScriptHandlerFn = (entityId: number, otherId: number, dt: number) => number | void;
export type WasmScriptExport = (entityId: number, dt: number) => number;
export type WasmCollisionScriptExport = (entityId: number, otherId: number, dt: number) => number;
/** Register a JavaScript handler (tests, IDE helpers, or host extensions). */
export declare function registerScriptHandler(module: string, handler: string, fn: ScriptHandlerFn | CollisionScriptHandlerFn): void;
export declare function unregisterScriptHandler(module: string, handler: string): void;
export declare function clearScriptHandlers(): void;
/** Bind WASM exports so entity scripts can call exported Juni functions. */
export declare function bindScriptWasm(exports: WebAssembly.Exports | null): void;
export declare function unbindScriptWasm(): void;
export declare function setScriptDispatchEnabled(enabled: boolean): void;
/**
 * Invoke every entity script once. Called from `world_step` after physics so
 * handlers can read grounded / contacts for the current frame.
 */
export declare function dispatchEntityScripts(world: World, dt: number): void;
/**
 * After physics: fire `on_collision` for solid contacts each frame, and
 * `on_trigger_enter` when a trigger pair first appears. Both entities with a
 * `script` component are called when the matching export/JS handler exists.
 */
export declare function dispatchCollisionScripts(world: World, dt: number): void;
/** Reset host script state (new run / world reset). */
export declare function resetScriptHost(): void;
//# sourceMappingURL=scripts.d.ts.map