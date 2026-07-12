/** Browser Juni runtime: print, Canvas2D, input, math, WebGPU triangle + scene3d. */

export type RunOptions = {
  onPrint?: (text: string) => void;
  canvasEl?: HTMLCanvasElement | null;
  gpuCanvasEl?: HTMLCanvasElement | null;
  mode?: "canvas2d" | "webgpu";
  verbose?: boolean;
  getShouldStop?: () => boolean;
};

export type FrameController = { stop: () => void };

type GpuTriState = {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  pipeline: GPURenderPipeline;
};

type Cam = { fov: number; aspect: number; near: number; far: number };
type Mesh = {
  sx: number;
  sy: number;
  sz: number;
  tx: number;
  ty: number;
  tz: number;
  rx: number;
  ry: number;
  rz: number;
};

type Scene3dState = {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  pipeline: GPURenderPipeline;
  depthView: GPUTextureView;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  cameras: Map<number, Cam>;
  meshes: Map<number, Mesh>;
  nextCam: number;
  nextMesh: number;
};

let gpuTri: GpuTriState | null = null;
let scene3d: Scene3dState | null = null;

const keys = new Set<string>();
let mouseX = 0;
let mouseY = 0;
const mouseButtons = new Set<number>();

const KEY_MAP: Record<number, string[]> = {
  0: ["ArrowLeft"],
  1: ["ArrowRight"],
  2: ["ArrowUp"],
  3: ["ArrowDown"],
  4: ["KeyA", "a", "A"],
  5: ["KeyD", "d", "D"],
  6: ["KeyW", "w", "W"],
  7: ["KeyS", "s", "S"],
  8: ["Space", " "],
};

function rgba(r: number, g: number, b: number, a: number): string {
  const R = Math.round(Math.min(1, Math.max(0, r)) * 255);
  const G = Math.round(Math.min(1, Math.max(0, g)) * 255);
  const B = Math.round(Math.min(1, Math.max(0, b)) * 255);
  return `rgba(${R},${G},${B},${Math.min(1, Math.max(0, a))})`;
}

function readStr(memory: WebAssembly.Memory, ptr: number): string {
  const view = new DataView(memory.buffer);
  const len = view.getInt32(ptr, true);
  return new TextDecoder("utf-8").decode(new Uint8Array(memory.buffer, ptr + 4, len));
}

function fr(x: number): number {
  return Math.fround(x);
}

function mat4Identity(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function mat4Perspective(fovDeg: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 180 / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

function mat4Translate(x: number, y: number, z: number): Float32Array {
  const m = mat4Identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

function mat4RotateXYZ(rx: number, ry: number, rz: number): Float32Array {
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const rxM = new Float32Array([1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1]);
  const ryM = new Float32Array([cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1]);
  const rzM = new Float32Array([cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return mat4Multiply(mat4Multiply(rzM, ryM), rxM);
}

function mat4Scale(sx: number, sy: number, sz: number): Float32Array {
  const m = mat4Identity();
  m[0] = sx;
  m[5] = sy;
  m[10] = sz;
  return m;
}

function onKeyDown(e: KeyboardEvent) {
  keys.add(e.code);
  keys.add(e.key);
}
function onKeyUp(e: KeyboardEvent) {
  keys.delete(e.code);
  keys.delete(e.key);
}

function bindMouse(canvas: HTMLCanvasElement) {
  canvas.tabIndex = 0;
  canvas.addEventListener("mousemove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouseX = ((e.clientX - r.left) / r.width) * canvas.width;
    mouseY = ((e.clientY - r.top) / r.height) * canvas.height;
  });
  canvas.addEventListener("mousedown", (e) => {
    mouseButtons.add(e.button);
    canvas.focus();
  });
  canvas.addEventListener("mouseup", (e) => mouseButtons.delete(e.button));
}

async function ensureGpu(canvas: HTMLCanvasElement): Promise<boolean> {
  if (gpuTri && scene3d) return true;
  if (!navigator.gpu) return false;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return false;
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
  if (!context) return false;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });

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

  const depthTex = device.createTexture({
    size: [Math.max(1, canvas.width), Math.max(1, canvas.height)],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const verts = new Float32Array([
    -1, -1, 1, 0.2, 0.9, 0.6, 1, -1, 1, 0.2, 0.9, 0.6, 1, 1, 1, 0.95, 0.55, 0.2, -1, 1, 1, 0.95, 0.55, 0.2,
    -1, -1, -1, 0.3, 0.55, 1, 1, -1, -1, 0.3, 0.55, 1, 1, 1, -1, 0.9, 0.3, 0.5, -1, 1, -1, 0.9, 0.3, 0.5,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 1, 5, 6, 1, 6, 2, 5, 4, 7, 5, 7, 6, 4, 0, 3, 4, 3, 7, 3, 2, 6, 3, 6, 7, 4, 5, 1, 4, 1, 0,
  ]);
  const vertexBuffer = device.createBuffer({
    size: verts.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, verts);
  const indexBuffer = device.createBuffer({
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indices);
  const uniformBuffer = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const shader = device.createShaderModule({
    code: `
struct Uniforms { mvp: mat4x4f }
@group(0) @binding(0) var<uniform> u: Uniforms;
struct VIn { @location(0) pos: vec3f, @location(1) col: vec3f }
struct VOut { @builtin(position) pos: vec4f, @location(0) col: vec3f }
@vertex fn vs(v: VIn) -> VOut {
  var o: VOut;
  o.pos = u.mvp * vec4f(v.pos, 1.0);
  o.col = v.col;
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4f { return vec4f(v.col, 1.0); }
`,
  });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shader,
      entryPoint: "vs",
      buffers: [
        {
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x3" },
            { shaderLocation: 1, offset: 12, format: "float32x3" },
          ],
        },
      ],
    },
    fragment: { module: shader, entryPoint: "fs", targets: [{ format }] },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
    primitive: { topology: "triangle-list", cullMode: "none" },
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  scene3d = {
    device,
    context,
    format,
    pipeline,
    depthView: depthTex.createView(),
    vertexBuffer,
    indexBuffer,
    indexCount: indices.length,
    uniformBuffer,
    bindGroup,
    cameras: new Map(),
    meshes: new Map(),
    nextCam: 1,
    nextMesh: 1,
  };
  return true;
}

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
  const memoryRef: { current: WebAssembly.Memory | null } = { current: null };
  const t0 = performance.now();
  const write = (text: string) => {
    if (options.onPrint) options.onPrint(String(text));
    else console.log(String(text));
  };

  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  const canvas = options.canvasEl ?? null;
  const gcanvas = options.gpuCanvasEl ?? null;
  if (canvas) bindMouse(canvas);
  if (gcanvas) bindMouse(gcanvas);

  let ctx2d: CanvasRenderingContext2D | null = null;

  const env = {
    sqrt_f32: (x: number) => fr(Math.sqrt(x)),
    webgpu_stub: (_c: number) => {},
    print_str(ptr: number) {
      if (memoryRef.current) write(readStr(memoryRef.current, ptr));
    },
    print_i32(v: number) {
      write(String(v | 0));
    },
    print_f32(v: number) {
      write(String(v));
    },
    canvas_init(w: number, h: number) {
      if (!canvas) return;
      canvas.width = w | 0;
      canvas.height = h | 0;
      canvas.style.display = "block";
      ctx2d = canvas.getContext("2d");
      canvas.focus();
    },
    canvas_clear(r: number, g: number, b: number, a: number) {
      if (!ctx2d || !canvas) return;
      ctx2d.fillStyle = rgba(r, g, b, a);
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    },
    canvas_fill_rect(
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
    canvas_fill_circle(
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
    canvas_fill_text(
      ptr: number,
      x: number,
      y: number,
      r: number,
      g: number,
      b: number,
      a: number
    ) {
      if (!ctx2d || !memoryRef.current) return;
      ctx2d.fillStyle = rgba(r, g, b, a);
      ctx2d.font = "600 18px 'JetBrains Mono', monospace";
      ctx2d.fillText(readStr(memoryRef.current, ptr), x, y);
    },
    canvas_draw_line(
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
    canvas_stroke_rect(
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
    gpu_clear(r: number, g: number, b: number, a: number) {
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
    gpu_draw_triangle() {
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
    sin_f32: (x: number) => fr(Math.sin(x)),
    cos_f32: (x: number) => fr(Math.cos(x)),
    tan_f32: (x: number) => fr(Math.tan(x)),
    abs_f32: (x: number) => fr(Math.abs(x)),
    floor_f32: (x: number) => fr(Math.floor(x)),
    ceil_f32: (x: number) => fr(Math.ceil(x)),
    min_f32: (a: number, b: number) => fr(Math.min(a, b)),
    max_f32: (a: number, b: number) => fr(Math.max(a, b)),
    rand_f32: () => fr(Math.random()),
    now_f32: () => fr((performance.now() - t0) / 1000),
    key_down(code: number) {
      const names = KEY_MAP[code | 0] ?? [];
      for (const n of names) if (keys.has(n)) return 1;
      return 0;
    },
    mouse_x: () => fr(mouseX),
    mouse_y: () => fr(mouseY),
    mouse_down(button: number) {
      return mouseButtons.has(button | 0) ? 1 : 0;
    },
    scene3d_init(w: number, h: number) {
      if (!gcanvas || !scene3d) return;
      gcanvas.width = w | 0;
      gcanvas.height = h | 0;
      gcanvas.style.display = "block";
      const depthTex = scene3d.device.createTexture({
        size: [gcanvas.width, gcanvas.height],
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      scene3d.depthView = depthTex.createView();
      gcanvas.focus();
    },
    camera3d_perspective(fov: number, aspect: number, near: number, far: number) {
      if (!scene3d) return 0;
      const id = scene3d.nextCam++;
      scene3d.cameras.set(id, { fov, aspect, near, far });
      return id;
    },
    mesh3d_box(sx: number, sy: number, sz: number) {
      if (!scene3d) return 0;
      const id = scene3d.nextMesh++;
      scene3d.meshes.set(id, {
        sx,
        sy,
        sz,
        tx: 0,
        ty: 0,
        tz: 0,
        rx: 0,
        ry: 0,
        rz: 0,
      });
      return id;
    },
    mesh3d_set_pose(
      mesh: number,
      tx: number,
      ty: number,
      tz: number,
      rx: number,
      ry: number,
      rz: number
    ) {
      const m = scene3d?.meshes.get(mesh | 0);
      if (!m) return;
      m.tx = tx;
      m.ty = ty;
      m.tz = tz;
      m.rx = rx;
      m.ry = ry;
      m.rz = rz;
    },
    mesh3d_rotate(mesh: number, drx: number, dry: number, drz: number) {
      const m = scene3d?.meshes.get(mesh | 0);
      if (!m) return;
      m.rx += drx;
      m.ry += dry;
      m.rz += drz;
    },
    scene3d_clear(r: number, g: number, b: number, a: number) {
      if (!scene3d) return;
      const { device, context, depthView } = scene3d;
      const view = context.getCurrentTexture().createView();
      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [
          { view, clearValue: { r, g, b, a }, loadOp: "clear", storeOp: "store" },
        ],
        depthStencilAttachment: {
          view: depthView,
          depthClearValue: 1,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });
      pass.end();
      device.queue.submit([enc.finish()]);
    },
    scene3d_draw(meshId: number, camId: number) {
      if (!scene3d) return;
      const mesh = scene3d.meshes.get(meshId | 0);
      const cam = scene3d.cameras.get(camId | 0);
      if (!mesh || !cam) return;
      const model = mat4Multiply(
        mat4Multiply(
          mat4Translate(mesh.tx, mesh.ty, mesh.tz),
          mat4RotateXYZ(mesh.rx, mesh.ry, mesh.rz)
        ),
        mat4Scale(mesh.sx, mesh.sy, mesh.sz)
      );
      const view = mat4Translate(0, 0, 0);
      const proj = mat4Perspective(cam.fov, cam.aspect, cam.near, cam.far);
      const mvp = mat4Multiply(mat4Multiply(proj, view), model);
      scene3d.device.queue.writeBuffer(scene3d.uniformBuffer, 0, mvp.buffer as ArrayBuffer);

      const colorView = scene3d.context.getCurrentTexture().createView();
      const enc = scene3d.device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: colorView, loadOp: "load", storeOp: "store" }],
        depthStencilAttachment: {
          view: scene3d.depthView,
          depthLoadOp: "load",
          depthStoreOp: "store",
        },
      });
      pass.setPipeline(scene3d.pipeline);
      pass.setBindGroup(0, scene3d.bindGroup);
      pass.setVertexBuffer(0, scene3d.vertexBuffer);
      pass.setIndexBuffer(scene3d.indexBuffer, "uint16");
      pass.drawIndexed(scene3d.indexCount);
      pass.end();
      scene3d.device.queue.submit([enc.finish()]);
    },
    str_len(ptr: number) {
      if (!memoryRef.current) return 0;
      return new DataView(memoryRef.current.buffer).getInt32(ptr, true);
    },
    str_eq(a: number, b: number) {
      if (!memoryRef.current) return 0;
      const view = new DataView(memoryRef.current.buffer);
      const la = view.getInt32(a, true);
      const lb = view.getInt32(b, true);
      if (la !== lb) return 0;
      const ba = new Uint8Array(memoryRef.current.buffer, a + 4, la);
      const bb = new Uint8Array(memoryRef.current.buffer, b + 4, lb);
      for (let i = 0; i < la; i++) {
        if (ba[i] !== bb[i]) return 0;
      }
      return 1;
    },
    clamp_f32(x: number, lo: number, hi: number) {
      return fr(Math.min(hi, Math.max(lo, x)));
    },
    lerp_f32(a: number, b: number, t: number) {
      return fr(a + (b - a) * t);
    },
    pow_f32(x: number, y: number) {
      return fr(Math.pow(x, y));
    },
    sign_f32(x: number) {
      return fr(x > 0 ? 1 : x < 0 ? -1 : 0);
    },
    fmod_f32(x: number, y: number) {
      return fr(x % y);
    },
    smoothstep_f32(e0: number, e1: number, x: number) {
      const t = fr(Math.min(1, Math.max(0, (x - e0) / (e1 - e0))));
      return fr(t * t * (3 - 2 * t));
    },
    deg_to_rad_f32(d: number) {
      return fr((d * Math.PI) / 180);
    },
    rad_to_deg_f32(r: number) {
      return fr((r * 180) / Math.PI);
    },
    dist2_f32(x1: number, y1: number, x2: number, y2: number) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      return fr(Math.sqrt(dx * dx + dy * dy));
    },
    pi_f32: () => fr(Math.PI),
    abs_i32(x: number) {
      return Math.abs(x | 0) | 0;
    },
    min_i32(a: number, b: number) {
      return Math.min(a | 0, b | 0) | 0;
    },
    max_i32(a: number, b: number) {
      return Math.max(a | 0, b | 0) | 0;
    },
    clamp_i32(x: number, lo: number, hi: number) {
      return Math.min(hi | 0, Math.max(lo | 0, x | 0)) | 0;
    },
    len2_f32(x: number, y: number) {
      return fr(Math.sqrt(x * x + y * y));
    },
    dot2_f32(x1: number, y1: number, x2: number, y2: number) {
      return fr(x1 * x2 + y1 * y2);
    },
  };

  if (options.mode === "webgpu" && gcanvas) {
    gcanvas.style.display = "block";
    if (canvas) canvas.style.display = "none";
    const ok = await ensureGpu(gcanvas);
    if (!ok) write("WebGPU not available in this browser.");
  } else if (canvas) {
    canvas.style.display = "block";
    if (gcanvas) gcanvas.style.display = "none";
  }

  // Reset scene tables each run (keep device)
  if (scene3d) {
    scene3d.cameras.clear();
    scene3d.meshes.clear();
    scene3d.nextCam = 1;
    scene3d.nextMesh = 1;
  }

  const result = await WebAssembly.instantiate(wasmBytes as BufferSource, { env });
  const instance =
    "instance" in result
      ? (result as WebAssembly.WebAssemblyInstantiatedSource).instance
      : (result as WebAssembly.Instance);
  memoryRef.current = instance.exports.memory as WebAssembly.Memory;
  return instance;
}
