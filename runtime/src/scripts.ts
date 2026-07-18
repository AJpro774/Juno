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
import {
  collisionCount,
  collisionEntityA,
  collisionEntityB,
  collisionIsTrigger,
} from "./physics.js";

export type ScriptHandlerFn = (entityId: number, dt: number) => number | void;

export type CollisionScriptHandlerFn = (
  entityId: number,
  otherId: number,
  dt: number
) => number | void;

export type WasmScriptExport = (entityId: number, dt: number) => number;

export type WasmCollisionScriptExport = (
  entityId: number,
  otherId: number,
  dt: number
) => number;

const jsHandlers = new Map<string, ScriptHandlerFn | CollisionScriptHandlerFn>();
let wasmExports: WebAssembly.Exports | null = null;
let dispatchEnabled = true;

/** Previous-frame contact pairs (`minId:maxId`) for trigger-enter detection. */
let prevContactPairs = new Set<string>();

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

function pairKey(a: number, b: number): string {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return `${lo}:${hi}`;
}

/** Register a JavaScript handler (tests, IDE helpers, or host extensions). */
export function registerScriptHandler(
  module: string,
  handler: string,
  fn: ScriptHandlerFn | CollisionScriptHandlerFn
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
  if (js) return js as ScriptHandlerFn;

  if (!wasmExports) return null;
  for (const name of wasmNames(module, handler)) {
    const exp = wasmExports[name];
    if (typeof exp === "function") {
      return (entityId, dt) => (exp as WasmScriptExport)(entityId, dt);
    }
  }
  return null;
}

function resolveCollisionHandler(
  module: string,
  handler: string
): CollisionScriptHandlerFn | null {
  const primary = key(module, handler);
  const js = jsHandlers.get(primary) ?? jsHandlers.get(handler);
  if (js) return js as CollisionScriptHandlerFn;

  if (!wasmExports) return null;
  for (const name of wasmNames(module, handler)) {
    const exp = wasmExports[name];
    if (typeof exp === "function") {
      return (entityId, otherId, dt) =>
        (exp as WasmCollisionScriptExport)(entityId, otherId, dt);
    }
  }
  return null;
}

function invokeCollisionEvent(
  world: World,
  entityId: number,
  otherId: number,
  dt: number,
  event: "on_collision" | "on_trigger_enter"
): void {
  const e = world.entities.get(entityId);
  const script = e?.script;
  if (!script) return;
  const module = script.module ?? "";
  if (!module && !script.handler) return;
  const fn = resolveCollisionHandler(module, event);
  if (!fn) return;
  try {
    fn(entityId, otherId, dt);
  } catch (err) {
    console.warn(
      `[juni] script ${module}:${event} on entity ${entityId} failed`,
      err
    );
  }
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

/**
 * After physics: fire `on_collision` for solid contacts each frame, and
 * `on_trigger_enter` when a trigger pair first appears. Both entities with a
 * `script` component are called when the matching export/JS handler exists.
 */
export function dispatchCollisionScripts(world: World, dt: number): void {
  if (!dispatchEnabled) return;
  const clamped = Math.min(0.05, Math.max(0, dt));
  const n = collisionCount();
  const currentPairs = new Set<string>();

  for (let i = 0; i < n; i++) {
    const a = collisionEntityA(i);
    const b = collisionEntityB(i);
    if (!a || !b) continue;
    const pk = pairKey(a, b);
    currentPairs.add(pk);
    const isTrigger = collisionIsTrigger(i) !== 0;

    if (isTrigger) {
      if (!prevContactPairs.has(pk)) {
        invokeCollisionEvent(world, a, b, clamped, "on_trigger_enter");
        invokeCollisionEvent(world, b, a, clamped, "on_trigger_enter");
      }
    } else {
      invokeCollisionEvent(world, a, b, clamped, "on_collision");
      invokeCollisionEvent(world, b, a, clamped, "on_collision");
    }
  }

  prevContactPairs = currentPairs;
}

/** Reset host script state (new run / world reset). */
export function resetScriptHost(): void {
  // Keep JS registrations across runs (host may re-register); clear WASM bind.
  unbindScriptWasm();
  prevContactPairs = new Set();
}
