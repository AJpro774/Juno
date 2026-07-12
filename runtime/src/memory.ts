/** WASM linear-memory string helpers. */

import type { MemoryRef } from "./types.js";

export function readStr(memory: WebAssembly.Memory, ptr: number): string {
  const view = new DataView(memory.buffer);
  const len = view.getInt32(ptr, true);
  return new TextDecoder("utf-8").decode(new Uint8Array(memory.buffer, ptr + 4, len));
}

export function strLen(memoryRef: MemoryRef, ptr: number): number {
  const memory = memoryRef.current;
  if (!memory) return 0;
  return new DataView(memory.buffer).getInt32(ptr, true);
}

export function strEq(memoryRef: MemoryRef, a: number, b: number): number {
  const memory = memoryRef.current;
  if (!memory) return 0;
  const view = new DataView(memory.buffer);
  const la = view.getInt32(a, true);
  const lb = view.getInt32(b, true);
  if (la !== lb) return 0;
  const ba = new Uint8Array(memory.buffer, a + 4, la);
  const bb = new Uint8Array(memory.buffer, b + 4, lb);
  for (let i = 0; i < la; i++) {
    if (ba[i] !== bb[i]) return 0;
  }
  return 1;
}
