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
 * Missing handlers are skipped (no throw). Bind the WASM instance after instantiate
 * via `bindScriptWasm(instance.exports)`.
 */

import type { World } from "./world.js";

export type ScriptHandlerFn = (entityId: number, dt: number) => number | void;

export type WasmScriptExport = (entityId: number, dt: number) => number;

const jsHandlers = new Map<string, ScriptHandlerFn>();
let wasmExports: WebAssembly.Exports | null = null;
let dispatchEnabled = true;

function key(module: string, handler: string): string {
  const m = (module || "").trim();
  const h = (handler || "on_update").trim() || "on_update";
  return m ? `${m}:${h}` : h;
}

function wasmNames(module: string, handler: string): string[] {
  const m = (module || "").trim();
  const h = (handler || "on_update").trim() || "on_update";
  const names: string[] = [];
  if (m) names.push(`${m}_${h}`);
  names.push(h);
  return names;
}

/** Register a JavaScript handler (tests, IDE helpers, or host extensions). */
export function registerScriptHandler(
  module: string,
  handler: string,
  fn: ScriptHandlerFn
): void {
  jsHandlers.set(key(module, handler), fn);
}

export function unregisterScriptHandler(module: string, handler: string): void {
  jsHandlers.delete(key(module, handler));
}

export function clearScriptHandlers(): void {
  jsHandlers.clear();
}

/** Bind WASM exports so entity scripts can call exported Juni functions. */
export function bindScriptWasm(exports: WebAssembly.Exports | null): void {
  wasmExports = exports;
}

export function unbindScriptWasm(): void {
  wasmExports = null;
}

export function setScriptDispatchEnabled(enabled: boolean): void {
  dispatchEnabled = enabled;
}

function resolveHandler(module: string, handler: string): ScriptHandlerFn | null {
  const primary = key(module, handler);
  const js = jsHandlers.get(primary) ?? jsHandlers.get(handler || "on_update");
  if (js) return js;

  if (!wasmExports) return null;
  for (const name of wasmNames(module, handler)) {
    const exp = wasmExports[name];
    if (typeof exp === "function") {
      return (entityId, dt) => (exp as WasmScriptExport)(entityId, dt);
    }
  }
  return null;
}

/**
 * Invoke every entity script once. Called from `world_step` after physics so
 * handlers can read grounded / contacts for the current frame.
 */
export function dispatchEntityScripts(world: World, dt: number): void {
  if (!dispatchEnabled) return;
  const clamped = Math.min(0.05, Math.max(0, dt));
  for (const e of world.entities.values()) {
    const script = e.script;
    if (!script) continue;
    const module = script.module ?? "";
    const handler = script.handler || "on_update";
    if (!module && !handler) continue;
    const fn = resolveHandler(module, handler);
    if (!fn) continue;
    try {
      fn(e.id, clamped);
    } catch (err) {
      console.warn(`[juni] script ${module}:${handler} on entity ${e.id} failed`, err);
    }
  }
}

/** Reset host script state (new run / world reset). */
export function resetScriptHost(): void {
  // Keep JS registrations across runs (host may re-register); clear WASM bind.
  unbindScriptWasm();
}
