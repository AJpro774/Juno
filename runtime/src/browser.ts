/** Browser-facing Juni runtime: wires canvas, input, and WebGPU hosts. */

import { createCanvasHandlers, createGpuHandlers } from "./canvas.js";
import { createEnvImports } from "./env.js";
import { createAssetHandlers } from "./assets.js";
import { attachInputListeners, bindMouse, createInputHandlers } from "./input.js";
import { createScene3dHandlers, ensureGpu, resetSceneTables } from "./scene3d.js";
import type { FrameController, RunOptions } from "./types.js";

export type { FrameController, RunOptions } from "./types.js";

export function startFrameLoop(
  instance: WebAssembly.Instance,
  options: RunOptions = {}
): FrameController | null {
  const frame = instance.exports.frame as ((dt: number) => number) | undefined;
  if (typeof frame !== "function") return null;
  let alive = true;
  let last = performance.now();
  const tick = (t: number) => {
    if (!alive || options.getShouldStop?.()) {
      alive = false;
      return;
    }
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    const ret = frame(dt);
    if (typeof ret === "number" && ret !== 0) {
      alive = false;
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return {
    stop() {
      alive = false;
    },
  };
}

export async function instantiateJuni(
  wasmBytes: BufferSource | Uint8Array,
  options: RunOptions = {}
): Promise<WebAssembly.Instance> {
  const memoryRef = { current: null as WebAssembly.Memory | null };
  const write = (text: string) => {
    if (options.onPrint) options.onPrint(String(text));
    else console.log(String(text));
  };

  attachInputListeners();

  const canvas = options.canvasEl ?? null;
  const gcanvas = options.gpuCanvasEl ?? null;
  if (canvas) bindMouse(canvas);
  if (gcanvas) bindMouse(gcanvas);

  const canvasHandlers = createCanvasHandlers(canvas, memoryRef);
  const assetHandlers = createAssetHandlers({
    memoryRef,
    assetPack: options.assetPack ?? null,
    assetBaseUrl: options.assetBaseUrl ?? "",
    getCtx2d: canvasHandlers.getCtx2d,
  });

  const { env, memoryRef: envMemoryRef } = createEnvImports({
    memoryRef,
    onPrint: options.onPrint,
    canvas: canvasHandlers,
    gpu: createGpuHandlers(),
    input: createInputHandlers(),
    scene3d: createScene3dHandlers(gcanvas, memoryRef),
    assets: assetHandlers,
    verbose: options.verbose,
  });

  if (options.mode === "webgpu" && gcanvas) {
    gcanvas.style.display = "block";
    if (canvas) canvas.style.display = "none";
    const ok = await ensureGpu(gcanvas);
    if (!ok) write("WebGPU not available in this browser.");
  } else if (canvas) {
    canvas.style.display = "block";
    if (gcanvas) gcanvas.style.display = "none";
  }

  resetSceneTables();

  await assetHandlers.preloadAll();

  const result = await WebAssembly.instantiate(wasmBytes as BufferSource, { env });
  const instance =
    "instance" in result
      ? (result as WebAssembly.WebAssemblyInstantiatedSource).instance
      : (result as WebAssembly.Instance);
  envMemoryRef.current = instance.exports.memory as WebAssembly.Memory;
  return instance;
}
