/** Browser-facing Juni runtime: wires canvas, input, and WebGPU hosts.
 *
 * Required Notice: Copyright © 2026 Alexander James Patton (AJpro774) — Juni / Juno under the Juni Software License and Commercial Contract 1.0
 * Built with Juni
 */
import type { FrameController, RunOptions } from "./types.js";
export type { FrameController, RunOptions } from "./types.js";
export declare function startFrameLoop(instance: WebAssembly.Instance, options?: RunOptions): FrameController | null;
export declare function instantiateJuni(wasmBytes: BufferSource | Uint8Array, options?: RunOptions): Promise<WebAssembly.Instance>;
//# sourceMappingURL=browser.d.ts.map