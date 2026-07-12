/** WebGPU scene3d host imports. */
import { gpuTri, initGpuTriangle } from "./canvas.js";
import { mat4LookAt, mat4Multiply, mat4Perspective, mat4RotateXYZ, mat4Scale, mat4Translate, } from "./math.js";
export let scene3d = null;
const UNIFORM_SIZE = 96;
function newEntity(kind, geom = "box") {
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
    };
}
function getEntity(id) {
    return scene3d?.entities.get(id | 0);
}
function localMatrix(entity) {
    const t = mat4Translate(entity.tx, entity.ty, entity.tz);
    const r = mat4RotateXYZ(entity.rx, entity.ry, entity.rz);
    const tr = mat4Multiply(t, r);
    if (entity.kind === "mesh" && entity.geom === "box") {
        return mat4Multiply(tr, mat4Scale(entity.sx, entity.sy, entity.sz));
    }
    return tr;
}
function worldMatrix(id) {
    const entity = getEntity(id);
    if (!entity)
        return mat4Translate(0, 0, 0);
    const local = localMatrix(entity);
    if (entity.parent !== 0) {
        return mat4Multiply(worldMatrix(entity.parent), local);
    }
    return local;
}
function cameraView(cam) {
    if (cam.mode === "look_at" || cam.mode === "orbit") {
        const [ex, ey, ez] = cam.eye;
        const [tx, ty, tz] = cam.target;
        return mat4LookAt(ex, ey, ez, tx, ty, tz);
    }
    return mat4Translate(0, 0, 0);
}
function updateOrbitEye(cam) {
    const [tx, ty, tz] = cam.target;
    const cp = Math.cos(cam.orbitPitch);
    const sp = Math.sin(cam.orbitPitch);
    const cy = Math.cos(cam.orbitYaw);
    const sy = Math.sin(cam.orbitYaw);
    cam.eye = [tx + cam.orbitDist * cp * sy, ty + cam.orbitDist * sp, tz + cam.orbitDist * cp * cy];
}
function writeUniforms(mvp, material) {
    if (!scene3d)
        return;
    const buf = new Float32Array(UNIFORM_SIZE / 4);
    buf.set(mvp, 0);
    if (material) {
        buf[16] = material.r;
        buf[17] = material.g;
        buf[18] = material.b;
        buf[19] = material.a;
        buf[20] = 1;
    }
    else {
        buf[20] = 0;
    }
    scene3d.device.queue.writeBuffer(scene3d.uniformBuffer, 0, buf.buffer);
}
function readF32Verts(memory, ptr, vertCount) {
    const floats = vertCount * 6;
    const out = new Float32Array(floats);
    const view = new DataView(memory.buffer);
    for (let i = 0; i < floats; i++) {
        out[i] = view.getFloat32(ptr + i * 4, true);
    }
    return out;
}
function readI32Indices(memory, ptr, indexCount) {
    const out = new Uint16Array(indexCount);
    const view = new DataView(memory.buffer);
    for (let i = 0; i < indexCount; i++) {
        const v = view.getInt32(ptr + i * 4, true);
        out[i] = v & 0xffff;
    }
    return out;
}
export function initScene3d(device, context, format, canvas) {
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
        nextCam: 1,
        nextEntity: 1,
        nextMaterial: 1,
    };
}
export function resetSceneTables() {
    if (!scene3d)
        return;
    scene3d.cameras.clear();
    scene3d.entities.clear();
    scene3d.materials.clear();
    scene3d.nextCam = 1;
    scene3d.nextEntity = 1;
    scene3d.nextMaterial = 1;
}
export function createScene3dHandlers(gcanvas, memoryRef) {
    return {
        init(w, h) {
            if (!gcanvas || !scene3d)
                return;
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
        cameraPerspective(fov, aspect, near, far) {
            if (!scene3d)
                return 0;
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
            if (!c)
                return;
            c.mode = "look_at";
            c.eye = [ex, ey, ez];
            c.target = [tx, ty, tz];
        },
        cameraOrbit(cam, tx, ty, tz, yaw, pitch, distance) {
            const c = scene3d?.cameras.get(cam | 0);
            if (!c)
                return;
            c.mode = "orbit";
            c.target = [tx, ty, tz];
            c.orbitYaw = yaw;
            c.orbitPitch = pitch;
            c.orbitDist = distance;
            updateOrbitEye(c);
        },
        createNode() {
            if (!scene3d)
                return 0;
            const id = scene3d.nextEntity++;
            scene3d.entities.set(id, newEntity("node"));
            return id;
        },
        setParent(child, parent) {
            const entity = getEntity(child);
            if (!entity)
                return;
            entity.parent = parent | 0;
        },
        meshBox(sx, sy, sz) {
            if (!scene3d)
                return 0;
            const id = scene3d.nextEntity++;
            const e = newEntity("mesh", "box");
            e.sx = sx;
            e.sy = sy;
            e.sz = sz;
            scene3d.entities.set(id, e);
            return id;
        },
        meshCustom(vertsPtr, vertCount, indicesPtr, indexCount) {
            if (!scene3d || !memoryRef.current)
                return 0;
            const memory = memoryRef.current;
            const vc = vertCount | 0;
            const ic = indexCount | 0;
            if (vc <= 0 || ic <= 0)
                return 0;
            const verts = readF32Verts(memory, vertsPtr | 0, vc);
            const indices = readI32Indices(memory, indicesPtr | 0, ic);
            const vertexBuffer = scene3d.device.createBuffer({
                size: verts.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            scene3d.device.queue.writeBuffer(vertexBuffer, 0, verts);
            const indexBuffer = scene3d.device.createBuffer({
                size: indices.byteLength,
                usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            });
            scene3d.device.queue.writeBuffer(indexBuffer, 0, indices);
            const id = scene3d.nextEntity++;
            const e = newEntity("mesh", "custom");
            e.vertexBuffer = vertexBuffer;
            e.indexBuffer = indexBuffer;
            e.indexCount = ic;
            scene3d.entities.set(id, e);
            return id;
        },
        materialColor(r, g, b, a) {
            if (!scene3d)
                return 0;
            const id = scene3d.nextMaterial++;
            scene3d.materials.set(id, { r, g, b, a });
            return id;
        },
        meshSetMaterial(mesh, material) {
            const entity = getEntity(mesh);
            if (!entity || entity.kind !== "mesh")
                return;
            entity.material = material | 0;
        },
        meshSetPose(mesh, tx, ty, tz, rx, ry, rz) {
            const entity = getEntity(mesh);
            if (!entity)
                return;
            entity.tx = tx;
            entity.ty = ty;
            entity.tz = tz;
            entity.rx = rx;
            entity.ry = ry;
            entity.rz = rz;
        },
        meshRotate(mesh, drx, dry, drz) {
            const entity = getEntity(mesh);
            if (!entity)
                return;
            entity.rx += drx;
            entity.ry += dry;
            entity.rz += drz;
        },
        clear(r, g, b, a) {
            if (!scene3d)
                return;
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
            if (!scene3d)
                return;
            const mesh = getEntity(meshId);
            const cam = scene3d.cameras.get(camId | 0);
            if (!mesh || mesh.kind !== "mesh" || !cam)
                return;
            if (cam.mode === "orbit") {
                updateOrbitEye(cam);
            }
            const model = worldMatrix(meshId | 0);
            const view = cameraView(cam);
            const proj = mat4Perspective(cam.fov, cam.aspect, cam.near, cam.far);
            const mvp = mat4Multiply(mat4Multiply(proj, view), model);
            const mat = mesh.material !== 0 ? scene3d.materials.get(mesh.material) ?? null : null;
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
            }
            else {
                pass.setVertexBuffer(0, scene3d.unitVertexBuffer);
                pass.setIndexBuffer(scene3d.unitIndexBuffer, "uint16");
                pass.drawIndexed(scene3d.unitIndexCount);
            }
            pass.end();
            scene3d.device.queue.submit([enc.finish()]);
        },
    };
}
export async function ensureGpu(canvas) {
    if (gpuTri && scene3d)
        return true;
    if (!navigator.gpu)
        return false;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter)
        return false;
    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    if (!context)
        return false;
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });
    initGpuTriangle(device, context, format);
    initScene3d(device, context, format, canvas);
    return true;
}
//# sourceMappingURL=scene3d.js.map