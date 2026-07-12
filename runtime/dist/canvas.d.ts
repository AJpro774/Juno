/** Canvas2D and simple WebGPU triangle drawing. */
import type { CanvasHandlers, GpuHandlers, MemoryRef } from "./types.js";
export type GpuTriState = {
    device: GPUDevice;
    context: GPUCanvasContext;
    format: GPUTextureFormat;
    pipeline: GPURenderPipeline;
};
export declare let gpuTri: GpuTriState | null;
export declare function initGpuTriangle(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat): void;
export declare function createCanvasHandlers(canvas: HTMLCanvasElement | null, memoryRef: MemoryRef): CanvasHandlers & {
    getCtx2d: () => CanvasRenderingContext2D | null;
};
export declare function createGpuHandlers(): GpuHandlers;
/** Fallback fillText that logs via onPrint when no canvas impl is wired. */
export declare function createCanvasFillTextFallback(memoryRef: MemoryRef, onPrint?: (text: string) => void): (ptr: number) => void;
//# sourceMappingURL=canvas.d.ts.map