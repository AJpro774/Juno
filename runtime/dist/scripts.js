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
const jsHandlers = new Map();
let wasmExports = null;
let dispatchEnabled = true;
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
/** Reset host script state (new run / world reset). */
export function resetScriptHost() {
    // Keep JS registrations across runs (host may re-register); clear WASM bind.
    unbindScriptWasm();
}
//# sourceMappingURL=scripts.js.map