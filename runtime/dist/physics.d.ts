/** AABB physics intrinsics: aabb_overlap, aabb_resolve_x. */
import type { MemoryRef } from "./types.js";
/** Axis-aligned bounding box: top-left (x, y) plus width and height. */
export type Aabb = {
    x: number;
    y: number;
    w: number;
    h: number;
};
export declare function readAabb(memory: WebAssembly.Memory, ptr: number): Aabb;
export declare function aabbOverlap(a: Aabb, b: Aabb): boolean;
export declare function aabbResolveX(moving: Aabb, other: Aabb, velX: number): number;
export declare function createPhysicsImports(memoryRef: MemoryRef): {
    aabb_overlap(aPtr: number, bPtr: number): number;
    aabb_resolve_x(mPtr: number, oPtr: number, velX: number): number;
};
//# sourceMappingURL=physics.d.ts.map