/** WASM linear-memory string helpers. */
export function readStr(memory, ptr) {
    const view = new DataView(memory.buffer);
    const len = view.getInt32(ptr, true);
    return new TextDecoder("utf-8").decode(new Uint8Array(memory.buffer, ptr + 4, len));
}
export function strLen(memoryRef, ptr) {
    const memory = memoryRef.current;
    if (!memory)
        return 0;
    return new DataView(memory.buffer).getInt32(ptr, true);
}
export function strEq(memoryRef, a, b) {
    const memory = memoryRef.current;
    if (!memory)
        return 0;
    const view = new DataView(memory.buffer);
    const la = view.getInt32(a, true);
    const lb = view.getInt32(b, true);
    if (la !== lb)
        return 0;
    const ba = new Uint8Array(memory.buffer, a + 4, la);
    const bb = new Uint8Array(memory.buffer, b + 4, lb);
    for (let i = 0; i < la; i++) {
        if (ba[i] !== bb[i])
            return 0;
    }
    return 1;
}
//# sourceMappingURL=memory.js.map