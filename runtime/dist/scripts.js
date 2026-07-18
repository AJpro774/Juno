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
 *   {module}_on_trigger_exit(entity_id, other_id, dt) -> i32  — once when a prior trigger pair disappears
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
import { collisionCount, collisionEntityA, collisionEntityB, collisionIsTrigger, } from "./physics.js";
const jsHandlers = new Map();
let wasmExports = null;
let dispatchEnabled = true;
/** Previous-frame trigger pairs (`minId:maxId`) for enter/exit detection. */
let prevTriggerPairs = new Set();
function key(module, handler) {
    const m = (module || "").trim();
    const h = (handler || "on_update").trim() || "on_update";
    return m ? `${m}:${h}` : h;
}
function wasmNames(module, handler) {
    const m = (module || "").trim();
    const h = (handler || "on_update").trim() || "on_update";
    const names = [];
    if (m)
        names.push(`${m}_${h}`);
    names.push(h);
    return names;
}
function pairKey(a, b) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return `${lo}:${hi}`;
}
function parsePairKey(pk) {
    const [lo, hi] = pk.split(":").map((s) => Number(s));
    return [lo | 0, hi | 0];
}
/** Register a JavaScript handler (tests, IDE helpers, or host extensions). */
export function registerScriptHandler(module, handler, fn) {
    jsHandlers.set(key(module, handler), fn);
}
export function unregisterScriptHandler(module, handler) {
    jsHandlers.delete(key(module, handler));
}
export function clearScriptHandlers() {
    jsHandlers.clear();
}
/** Bind WASM exports so entity scripts can call exported Juni functions. */
export function bindScriptWasm(exports) {
    wasmExports = exports;
}
export function unbindScriptWasm() {
    wasmExports = null;
}
export function setScriptDispatchEnabled(enabled) {
    dispatchEnabled = enabled;
}
function resolveHandler(module, handler) {
    const primary = key(module, handler);
    const js = jsHandlers.get(primary) ?? jsHandlers.get(handler || "on_update");
    if (js)
        return js;
    if (!wasmExports)
        return null;
    for (const name of wasmNames(module, handler)) {
        const exp = wasmExports[name];
        if (typeof exp === "function") {
            return (entityId, dt) => exp(entityId, dt);
        }
    }
    return null;
}
function resolveCollisionHandler(module, handler) {
    const primary = key(module, handler);
    const js = jsHandlers.get(primary) ?? jsHandlers.get(handler);
    if (js)
        return js;
    if (!wasmExports)
        return null;
    for (const name of wasmNames(module, handler)) {
        const exp = wasmExports[name];
        if (typeof exp === "function") {
            return (entityId, otherId, dt) => exp(entityId, otherId, dt);
        }
    }
    return null;
}
function invokeCollisionEvent(world, entityId, otherId, dt, event) {
    const e = world.entities.get(entityId);
    const script = e?.script;
    if (!script)
        return;
    const module = script.module ?? "";
    if (!module && !script.handler)
        return;
    const fn = resolveCollisionHandler(module, event);
    if (!fn)
        return;
    try {
        fn(entityId, otherId, dt);
    }
    catch (err) {
        console.warn(`[juni] script ${module}:${event} on entity ${entityId} failed`, err);
    }
}
/**
 * Invoke every entity script once. Called from `world_step` after physics so
 * handlers can read grounded / contacts for the current frame.
 */
export function dispatchEntityScripts(world, dt) {
    if (!dispatchEnabled)
        return;
    const clamped = Math.min(0.05, Math.max(0, dt));
    for (const e of world.entities.values()) {
        const script = e.script;
        if (!script)
            continue;
        const module = script.module ?? "";
        const handler = script.handler || "on_update";
        if (!module && !handler)
            continue;
        const fn = resolveHandler(module, handler);
        if (!fn)
            continue;
        try {
            fn(e.id, clamped);
        }
        catch (err) {
            console.warn(`[juni] script ${module}:${handler} on entity ${e.id} failed`, err);
        }
    }
}
/**
 * After physics: fire `on_collision` for solid contacts each frame,
 * `on_trigger_enter` when a trigger pair first appears, and
 * `on_trigger_exit` when a prior trigger pair is gone. Both entities with a
 * `script` component are called when the matching export/JS handler exists.
 */
export function dispatchCollisionScripts(world, dt) {
    if (!dispatchEnabled)
        return;
    const clamped = Math.min(0.05, Math.max(0, dt));
    const n = collisionCount();
    const currentTriggerPairs = new Set();
    for (let i = 0; i < n; i++) {
        const a = collisionEntityA(i);
        const b = collisionEntityB(i);
        if (!a || !b)
            continue;
        const pk = pairKey(a, b);
        const isTrigger = collisionIsTrigger(i) !== 0;
        if (isTrigger) {
            currentTriggerPairs.add(pk);
            if (!prevTriggerPairs.has(pk)) {
                invokeCollisionEvent(world, a, b, clamped, "on_trigger_enter");
                invokeCollisionEvent(world, b, a, clamped, "on_trigger_enter");
            }
        }
        else {
            invokeCollisionEvent(world, a, b, clamped, "on_collision");
            invokeCollisionEvent(world, b, a, clamped, "on_collision");
        }
    }
    for (const pk of prevTriggerPairs) {
        if (currentTriggerPairs.has(pk))
            continue;
        const [a, b] = parsePairKey(pk);
        if (!a || !b)
            continue;
        invokeCollisionEvent(world, a, b, clamped, "on_trigger_exit");
        invokeCollisionEvent(world, b, a, clamped, "on_trigger_exit");
    }
    prevTriggerPairs = currentTriggerPairs;
}
/** Reset host script state (new run / world reset). */
export function resetScriptHost() {
    // Keep JS registrations across runs (host may re-register); clear WASM bind.
    unbindScriptWasm();
    prevTriggerPairs = new Set();
}
//# sourceMappingURL=scripts.js.map