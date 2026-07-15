/** WebGPU scene3d host imports. */

import { gpuTri, initGpuTriangle } from "./canvas.js";
import type { MemoryRef } from "./types.js";
import {
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
  mat4RotateXYZ,
  mat4Scale,
  mat4Translate,
} from "./math.js";
import type { Scene3dHandlers } from "./types.js";

type Cam = {
  fov: number;
  aspect: number;
  near: number;
  far: number;
  mode: "perspective" | "look_at" | "orbit";
  eye: [number, number, number];
  target: [number, number, number];
  orbitYaw: number;
  orbitPitch: number;
  orbitDist: number;
};

type Material = {
  r: number;
  g: number;
  b: number;
  a: number;
  textureHandle: number;
};

type Light = {
  kind: "directional" | "point";
  dx: number;
  dy: number;
  dz: number;
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  range: number;
};

type Entity = {
  kind: "node" | "mesh";
  parent: number;
  tx: number;
  ty: number;
  tz: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
  geom: "box" | "custom";
  vertexBuffer: GPUBuffer | null;
  indexBuffer: GPUBuffer | null;
  indexCount: number;
  material: number;
  radius: number;
};

export type Scene3dState = {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  pipeline: GPURenderPipeline;
  depthView: GPUTextureView;
  unitVertexBuffer: GPUBuffer;
  unitIndexBuffer: GPUBuffer;
  unitIndexCount: number;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  cameras: Map<number, Cam>;
  entities: Map<number, Entity>;
  materials: Map<number, Material>;
  lights: Map<number, Light>;
  nextCam: number;
  nextEntity: number;
  nextMaterial: number;
  nextLight: number;
};

export let scene3d: Scene3dState | null = null;

const UNIFORM_SIZE = 128;
let ambientColor: [number, number, number] = [0.25, 0.25, 0.28];
let fogDensity = 0;

export function scene3dSetAmbient(r: number, g: number, b: number): void {
  ambientColor = [r, g, b];
}

export function scene3dSetFog(density: number): void {
  fogDensity = Math.max(0, density);
}

function newEntity(kind: "node" | "mesh", geom: "box" | "custom" = "box"): Entity {
  return {
    kind,
    parent: 0,
    tx: 0,
    ty: 0,
    tz: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    sx: 1,
    sy: 1,
    sz: 1,
    geom,
    vertexBuffer: null,
    indexBuffer: null,
    indexCount: 0,
    material: 0,
    radius: 1.75,
  };
}

function getEntity(id: number): Entity | undefined {
  return scene3d?.entities.get(id | 0);
}

function localMatrix(entity: Entity): Float32Array {
  const t = mat4Translate(entity.tx, entity.ty, entity.tz);
  const r = mat4RotateXYZ(entity.rx, entity.ry, entity.rz);
  const tr = mat4Multiply(t, r);
  if (entity.kind === "mesh" && entity.geom === "box") {
    return mat4Multiply(tr, mat4Scale(entity.sx, entity.sy, entity.sz));
  }
  return tr;
}

function worldMatrix(id: number): Float32Array {
  const entity = getEntity(id);
  if (!entity) return mat4Translate(0, 0, 0);
  const local = localMatrix(entity);
  if (entity.parent !== 0) {
    return mat4Multiply(worldMatrix(entity.parent), local);
  }
  return local;
}

function cameraView(cam: Cam): Float32Array {
  if (cam.mode === "look_at" || cam.mode === "orbit") {
    const [ex, ey, ez] = cam.eye;
    const [tx, ty, tz] = cam.target;
    return mat4LookAt(ex, ey, ez, tx, ty, tz);
  }
  return mat4Translate(0, 0, 0);
}

function updateOrbitEye(cam: Cam): void {
  const [tx, ty, tz] = cam.target;
  const cp = Math.cos(cam.orbitPitch);
  const sp = Math.sin(cam.orbitPitch);
  const cy = Math.cos(cam.orbitYaw);
  const sy = Math.sin(cam.orbitYaw);
  cam.eye = [tx + cam.orbitDist * cp * sy, ty + cam.orbitDist * sp, tz + cam.orbitDist * cp * cy];
}

function primaryLight(): Light {
  for (const light of scene3d?.lights.values() ?? []) {
    if (light.kind === "directional") return light;
  }
  return {
    kind: "directional",
    dx: 0.3,
    dy: -1,
    dz: -0.4,
    x: 0,
    y: 0,
    z: 0,
    r: 1,
    g: 1,
    b: 1,
    range: 10,
  };
}

function shadeMaterial(material: Material | null): { r: number; g: number; b: number; a: number } {
  const base = material ?? { r: 1, g: 1, b: 1, a: 1, textureHandle: 0 };
  const light = primaryLight();
  // Approximate Lambert using fixed normal facing camera-up light.
  const nx = 0.2;
  const ny = 0.8;
  const nz = 0.4;
  const invLen = 1 / Math.sqrt(light.dx * light.dx + light.dy * light.dy + light.dz * light.dz || 1);
  const lx = -light.dx * invLen;
  const ly = -light.dy * invLen;
  const lz = -light.dz * invLen;
  const ndotl = Math.max(0, nx * lx + ny * ly + nz * lz);
  const ambient =
    ambientColor[0] * 0.333 + ambientColor[1] * 0.333 + ambientColor[2] * 0.334 || 0.25;
  const intensity = Math.max(ambient, ambient) + ndotl * (1 - Math.min(0.9, ambient));
  const fog = Math.max(0, Math.min(1, 1 - fogDensity * 0.15));
  // Textured materials get a slight tint boost so they read differently from flat color.
  const texBoost = base.textureHandle ? 1.08 : 1;
  return {
    r: Math.min(1, base.r * light.r * intensity * texBoost * fog * (0.7 + ambientColor[0] * 0.3)),
    g: Math.min(1, base.g * light.g * intensity * texBoost * fog * (0.7 + ambientColor[1] * 0.3)),
    b: Math.min(1, base.b * light.b * intensity * texBoost * fog * (0.7 + ambientColor[2] * 0.3)),
    a: base.a,
  };
}

function writeUniforms(mvp: Float32Array, material: Material | null): void {
  if (!scene3d) return;
  const buf = new Float32Array(UNIFORM_SIZE / 4);
  buf.set(mvp, 0);
  const shaded = shadeMaterial(material);
  if (material) {
    buf[16] = shaded.r;
    buf[17] = shaded.g;
    buf[18] = shaded.b;
    buf[19] = shaded.a;
    buf[20] = 1;
  } else {
    buf[16] = shaded.r;
    buf[17] = shaded.g;
    buf[18] = shaded.b;
    buf[19] = 1;
    buf[20] = 0;
  }
  const light = primaryLight();
  buf[24] = light.dx;
  buf[25] = light.dy;
  buf[26] = light.dz;
  buf[27] = 1;
  scene3d.device.queue.writeBuffer(scene3d.uniformBuffer, 0, buf.buffer);
}

function inFrustum(mesh: Entity, cam: Cam): boolean {
  const [ex, ey, ez] = cam.eye;
  const dx = mesh.tx - ex;
  const dy = mesh.ty - ey;
  const dz = mesh.tz - ez;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const radius = mesh.radius * Math.max(mesh.sx, mesh.sy, mesh.sz);
  if (dist - radius > cam.far) return false;
  if (dist + radius < cam.near * 0.5) return false;
  return true;
}

/** Upload a custom mesh from host-side typed arrays (used by glTF loader). */
export function createCustomMeshFromData(
  positions: Float32Array,
  indices: Uint16Array
): number {
  if (!scene3d) return 0;
  const vertexBuffer = scene3d.device.createBuffer({
    size: positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  scene3d.device.queue.writeBuffer(vertexBuffer, 0, positions as Float32Array<ArrayBuffer>);
  const indexBuffer = scene3d.device.createBuffer({
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  scene3d.device.queue.writeBuffer(indexBuffer, 0, indices as Uint16Array<ArrayBuffer>);
  const id = scene3d.nextEntity++;
  const e = newEntity("mesh", "custom");
  e.vertexBuffer = vertexBuffer;
  e.indexBuffer = indexBuffer;
  e.indexCount = indices.length;
  e.radius = 2;
  scene3d.entities.set(id, e);
  return id;
}

export function syncMeshPose(
  mesh: number,
  tx: number,
  ty: number,
  tz: number,
  rx: number,
  ry: number,
  rz: number
): void {
  const entity = getEntity(mesh);
  if (!entity) return;
  entity.tx = tx;
  entity.ty = ty;
  entity.tz = tz;
  entity.rx = rx;
  entity.ry = ry;
  entity.rz = rz;
}

export function material3dTexture(assetHandle: number): number {
  if (!scene3d) return 0;
  const id = scene3d.nextMaterial++;
  scene3d.materials.set(id, {
    r: 0.85,
    g: 0.85,
    b: 0.9,
    a: 1,
    textureHandle: assetHandle | 0,
  });
  return id;
}

export function light3dDirectional(
  dx: number,
  dy: number,
  dz: number,
  r: number,
  g: number,
  b: number
): number {
  if (!scene3d) return 0;
  const id = scene3d.nextLight++;
  scene3d.lights.set(id, {
    kind: "directional",
    dx,
    dy,
    dz,
    x: 0,
    y: 0,
    z: 0,
    r,
    g,
    b,
    range: 0,
  });
  return id;
}

export function light3dPoint(
  x: number,
  y: number,
  z: number,
  r: number,
  g: number,
  b: number,
  range: number
): number {
  if (!scene3d) return 0;
  const id = scene3d.nextLight++;
  scene3d.lights.set(id, {
    kind: "point",
    dx: 0,
    dy: -1,
    dz: 0,
    x,
    y,
    z,
    r,
    g,
    b,
    range,
  });
  return id;
}

function readF32Verts(memory: WebAssembly.Memory, ptr: number, vertCount: number): Float32Array {
  const floats = vertCount * 6;
  const out = new Float32Array(floats);
  const view = new DataView(memory.buffer);
  for (let i = 0; i < floats; i++) {
    out[i] = view.getFloat32(ptr + i * 4, true);
  }
  return out;
}

function readI32Indices(memory: WebAssembly.Memory, ptr: number, indexCount: number): Uint16Array {
  const out = new Uint16Array(indexCount);
  const view = new DataView(memory.buffer);
  for (let i = 0; i < indexCount; i++) {
    const v = view.getInt32(ptr + i * 4, true);
    out[i] = v & 0xffff;
  }
  return out;
}

export function initScene3d(
  device: GPUDevice,
  context: GPUCanvasContext,
  format: GPUTextureFormat,
  canvas: HTMLCanvasElement
): void {
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
  const unitVertexBuffer = device.createBuffer({
    size: verts.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(unitVertexBuffer, 0, verts);
  const unitIndexBuffer = device.createBuffer({
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(unitIndexBuffer, 0, indices);
  const uniformBuffer = device.createBuffer({
    size: UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const shader = device.createShaderModule({
    code: `
struct Uniforms {
  mvp: mat4x4f,
  color: vec4f,
  useMaterial: f32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
struct VIn { @location(0) pos: vec3f, @location(1) col: vec3f }
struct VOut { @builtin(position) pos: vec4f, @location(0) col: vec3f }
@vertex fn vs(v: VIn) -> VOut {
  var o: VOut;
  o.pos = u.mvp * vec4f(v.pos, 1.0);
  o.col = v.col;
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4f {
  if (u.useMaterial > 0.5) {
    return u.color;
  }
  return vec4f(v.col, 1.0);
}
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
    unitVertexBuffer,
    unitIndexBuffer,
    unitIndexCount: indices.length,
    uniformBuffer,
    bindGroup,
    cameras: new Map(),
    entities: new Map(),
    materials: new Map(),
    lights: new Map(),
    nextCam: 1,
    nextEntity: 1,
    nextMaterial: 1,
    nextLight: 1,
  };
}

export function resetSceneTables(): void {
  if (!scene3d) return;
  scene3d.cameras.clear();
  scene3d.entities.clear();
  scene3d.materials.clear();
  scene3d.lights.clear();
  scene3d.nextCam = 1;
  scene3d.nextEntity = 1;
  scene3d.nextMaterial = 1;
  scene3d.nextLight = 1;
}

export function createScene3dHandlers(
  gcanvas: HTMLCanvasElement | null,
  memoryRef: MemoryRef
): Scene3dHandlers {
  return {
    init(w: number, h: number) {
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
    cameraPerspective(fov: number, aspect: number, near: number, far: number) {
      if (!scene3d) return 0;
      const id = scene3d.nextCam++;
      scene3d.cameras.set(id, {
        fov,
        aspect,
        near,
        far,
        mode: "perspective",
        eye: [0, 0, 0],
        target: [0, 0, -1],
        orbitYaw: 0,
        orbitPitch: 0,
        orbitDist: 5,
      });
      return id;
    },
    cameraLookAt(cam, ex, ey, ez, tx, ty, tz) {
      const c = scene3d?.cameras.get(cam | 0);
      if (!c) return;
      c.mode = "look_at";
      c.eye = [ex, ey, ez];
      c.target = [tx, ty, tz];
    },
    cameraOrbit(cam, tx, ty, tz, yaw, pitch, distance) {
      const c = scene3d?.cameras.get(cam | 0);
      if (!c) return;
      c.mode = "orbit";
      c.target = [tx, ty, tz];
      c.orbitYaw = yaw;
      c.orbitPitch = pitch;
      c.orbitDist = distance;
      updateOrbitEye(c);
    },
    createNode() {
      if (!scene3d) return 0;
      const id = scene3d.nextEntity++;
      scene3d.entities.set(id, newEntity("node"));
      return id;
    },
    setParent(child, parent) {
      const entity = getEntity(child);
      if (!entity) return;
      entity.parent = parent | 0;
    },
    meshBox(sx: number, sy: number, sz: number) {
      if (!scene3d) return 0;
      const id = scene3d.nextEntity++;
      const e = newEntity("mesh", "box");
      e.sx = sx;
      e.sy = sy;
      e.sz = sz;
      scene3d.entities.set(id, e);
      return id;
    },
    meshCustom(vertsPtr, vertCount, indicesPtr, indexCount) {
      if (!scene3d || !memoryRef.current) return 0;
      const memory = memoryRef.current;
      const vc = vertCount | 0;
      const ic = indexCount | 0;
      if (vc <= 0 || ic <= 0) return 0;
      const verts = readF32Verts(memory, vertsPtr | 0, vc);
      const indices = readI32Indices(memory, indicesPtr | 0, ic);
      const vertexBuffer = scene3d.device.createBuffer({
        size: verts.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      scene3d.device.queue.writeBuffer(vertexBuffer, 0, verts as Float32Array<ArrayBuffer>);
      const indexBuffer = scene3d.device.createBuffer({
        size: indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
      scene3d.device.queue.writeBuffer(indexBuffer, 0, indices as Uint16Array<ArrayBuffer>);
      const id = scene3d.nextEntity++;
      const e = newEntity("mesh", "custom");
      e.vertexBuffer = vertexBuffer;
      e.indexBuffer = indexBuffer;
      e.indexCount = ic;
      scene3d.entities.set(id, e);
      return id;
    },
    materialColor(r, g, b, a) {
      if (!scene3d) return 0;
      const id = scene3d.nextMaterial++;
      scene3d.materials.set(id, { r, g, b, a, textureHandle: 0 });
      return id;
    },
    meshSetMaterial(mesh, material) {
      const entity = getEntity(mesh);
      if (!entity || entity.kind !== "mesh") return;
      entity.material = material | 0;
    },
    meshSetPose(mesh, tx, ty, tz, rx, ry, rz) {
      const entity = getEntity(mesh);
      if (!entity) return;
      entity.tx = tx;
      entity.ty = ty;
      entity.tz = tz;
      entity.rx = rx;
      entity.ry = ry;
      entity.rz = rz;
    },
    meshRotate(mesh, drx, dry, drz) {
      const entity = getEntity(mesh);
      if (!entity) return;
      entity.rx += drx;
      entity.ry += dry;
      entity.rz += drz;
    },
    clear(r, g, b, a) {
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
    draw(meshId, camId) {
      if (!scene3d) return;
      const mesh = getEntity(meshId);
      const cam = scene3d.cameras.get(camId | 0);
      if (!mesh || mesh.kind !== "mesh" || !cam) return;
      if (cam.mode === "orbit") {
        updateOrbitEye(cam);
      }
      if (!inFrustum(mesh, cam)) return;
      const model = worldMatrix(meshId | 0);
      const view = cameraView(cam);
      const proj = mat4Perspective(cam.fov, cam.aspect, cam.near, cam.far);
      const mvp = mat4Multiply(mat4Multiply(proj, view), model);
      const mat =
        mesh.material !== 0 ? scene3d.materials.get(mesh.material) ?? null : null;
      writeUniforms(mvp, mat);

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
      if (mesh.geom === "custom" && mesh.vertexBuffer && mesh.indexBuffer) {
        pass.setVertexBuffer(0, mesh.vertexBuffer);
        pass.setIndexBuffer(mesh.indexBuffer, "uint16");
        pass.drawIndexed(mesh.indexCount);
      } else {
        pass.setVertexBuffer(0, scene3d.unitVertexBuffer);
        pass.setIndexBuffer(scene3d.unitIndexBuffer, "uint16");
        pass.drawIndexed(scene3d.unitIndexCount);
      }
      pass.end();
      scene3d.device.queue.submit([enc.finish()]);
    },
  };
}

export async function ensureGpu(canvas: HTMLCanvasElement): Promise<boolean> {
  if (gpuTri && scene3d) return true;
  if (!navigator.gpu) return false;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return false;
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
  if (!context) return false;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });

  initGpuTriangle(device, context, format);
  initScene3d(device, context, format, canvas);
  return true;
}
