/** WebGPU scene3d host imports. */
import type { MemoryRef } from "./types.js";
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
    nextCam: number;
    nextEntity: number;
    nextMaterial: number;
};
export declare let scene3d: Scene3dState | null;
export declare function initScene3d(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat, canvas: HTMLCanvasElement): void;
export declare function resetSceneTables(): void;
export declare function createScene3dHandlers(gcanvas: HTMLCanvasElement | null, memoryRef: MemoryRef): Scene3dHandlers;
export declare function ensureGpu(canvas: HTMLCanvasElement): Promise<boolean>;
export {};
//# sourceMappingURL=scene3d.d.ts.map