/** WASM linear-memory string helpers. */
import type { MemoryRef } from "./types.js";
export declare function readStr(memory: WebAssembly.Memory, ptr: number): string;
export declare function strLen(memoryRef: MemoryRef, ptr: number): number;
export declare function strEq(memoryRef: MemoryRef, a: number, b: number): number;
//# sourceMappingURL=memory.d.ts.map