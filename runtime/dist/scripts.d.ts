/**
 * Host ABI for entity `script` components.
 *
 * Each entity may declare `{ module, handler }` in `.jscene`. During `world_step`,
 * the host looks up a callable and invokes:
 *
 *   handler(entity_id: i32, dt: f32) -> i32
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
export type WasmScriptExport = (entityId: number, dt: number) => number;
/** Register a JavaScript handler (tests, IDE helpers, or host extensions). */
export declare function registerScriptHandler(module: string, handler: string, fn: ScriptHandlerFn): void;
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
/** Reset host script state (new run / world reset). */
export declare function resetScriptHost(): void;
//# sourceMappingURL=scripts.d.ts.map