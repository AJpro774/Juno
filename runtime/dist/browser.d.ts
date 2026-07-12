/** Browser-facing Juni runtime: wires canvas, input, and WebGPU hosts. */
import type { FrameController, RunOptions } from "./types.js";
export type { FrameController, RunOptions } from "./types.js";
export declare function startFrameLoop(instance: WebAssembly.Instance, options?: RunOptions): FrameController | null;
export declare function instantiateJuni(wasmBytes: BufferSource | Uint8Array, options?: RunOptions): Promise<WebAssembly.Instance>;
//# sourceMappingURL=browser.d.ts.map