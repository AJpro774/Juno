/** Canvas2D and simple WebGPU triangle drawing. */

import { readStr } from "./memory.js";
import { rgba } from "./math.js";
import type { CanvasHandlers, GpuHandlers, MemoryRef } from "./types.js";

export type GpuTriState = {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  pipeline: GPURenderPipeline;
};

export let gpuTri: GpuTriState | null = null;

export function initGpuTriangle(
  device: GPUDevice,
  context: GPUCanvasContext,
  format: GPUTextureFormat
): void {
  const triShader = device.createShaderModule({
    code: `
struct VOut { @builtin(position) pos: vec4f, @location(0) col: vec4f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var p = array<vec2f, 3>(vec2f(0.0, 0.6), vec2f(-0.6, -0.5), vec2f(0.6, -0.5));
  var c = array<vec3f, 3>(vec3f(0.2, 0.9, 0.6), vec3f(0.95, 0.55, 0.2), vec3f(0.3, 0.55, 1.0));
  var o: VOut;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.col = vec4f(c[i], 1.0);
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4f { return v.col; }
`,
  });
  gpuTri = {
    device,
    context,
    format,
    pipeline: device.createRenderPipeline({
      layout: "auto",
      vertex: { module: triShader, entryPoint: "vs" },
      fragment: { module: triShader, entryPoint: "fs", targets: [{ format }] },
    }),
  };
}

export function createCanvasHandlers(
  canvas: HTMLCanvasElement | null,
  memoryRef: MemoryRef
): CanvasHandlers & { getCtx2d: () => CanvasRenderingContext2D | null } {
  let ctx2d: CanvasRenderingContext2D | null = null;

  return {
    getCtx2d: () => ctx2d,
    init(w: number, h: number) {
      if (!canvas) return;
      canvas.width = w | 0;
      canvas.height = h | 0;
      canvas.style.display = "block";
      ctx2d = canvas.getContext("2d");
      canvas.focus();
    },
    clear(r: number, g: number, b: number, a: number) {
      if (!ctx2d || !canvas) return;
      ctx2d.fillStyle = rgba(r, g, b, a);
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    },
    fillRect(
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
      g: number,
      b: number,
      a: number
    ) {
      if (!ctx2d) return;
      ctx2d.fillStyle = rgba(r, g, b, a);
      ctx2d.fillRect(x, y, w, h);
    },
    fillCircle(
      x: number,
      y: number,
      radius: number,
      r: number,
      g: number,
      b: number,
      a: number
    ) {
      if (!ctx2d) return;
      ctx2d.beginPath();
      ctx2d.arc(x, y, radius, 0, Math.PI * 2);
      ctx2d.fillStyle = rgba(r, g, b, a);
      ctx2d.fill();
    },
    fillText(ptr: number, x: number, y: number, r: number, g: number, b: number, a: number) {
      if (!ctx2d || !memoryRef.current) return;
      ctx2d.fillStyle = rgba(r, g, b, a);
      ctx2d.font = "600 18px 'JetBrains Mono', monospace";
      ctx2d.fillText(readStr(memoryRef.current, ptr), x, y);
    },
    drawLine(
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      width: number,
      r: number,
      g: number,
      b: number,
      a: number
    ) {
      if (!ctx2d) return;
      ctx2d.beginPath();
      ctx2d.moveTo(x1, y1);
      ctx2d.lineTo(x2, y2);
      ctx2d.strokeStyle = rgba(r, g, b, a);
      ctx2d.lineWidth = width;
      ctx2d.stroke();
    },
    strokeRect(
      x: number,
      y: number,
      w: number,
      h: number,
      width: number,
      r: number,
      g: number,
      b: number,
      a: number
    ) {
      if (!ctx2d) return;
      ctx2d.strokeStyle = rgba(r, g, b, a);
      ctx2d.lineWidth = width;
      ctx2d.strokeRect(x, y, w, h);
    },
  };
}

export function createGpuHandlers(): GpuHandlers {
  return {
    clear(r: number, g: number, b: number, a: number) {
      if (!gpuTri) return;
      const { device, context } = gpuTri;
      const view = context.getCurrentTexture().createView();
      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [
          { view, clearValue: { r, g, b, a }, loadOp: "clear", storeOp: "store" },
        ],
      });
      pass.end();
      device.queue.submit([enc.finish()]);
    },
    drawTriangle() {
      if (!gpuTri) return;
      const { device, context, pipeline } = gpuTri;
      const view = context.getCurrentTexture().createView();
      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view, loadOp: "load", storeOp: "store" }],
      });
      pass.setPipeline(pipeline);
      pass.draw(3);
      pass.end();
      device.queue.submit([enc.finish()]);
    },
  };
}

/** Fallback fillText that logs via onPrint when no canvas impl is wired. */
export function createCanvasFillTextFallback(
  memoryRef: MemoryRef,
  onPrint?: (text: string) => void
): (ptr: number) => void {
  return (ptr: number) => {
    if (onPrint && memoryRef.current) {
      onPrint("[canvas_fill_text] " + readStr(memoryRef.current, ptr));
    }
  };
}
