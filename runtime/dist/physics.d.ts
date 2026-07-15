/** AABB / circle 2D physics with velocity integration, contacts, and axis separation. */
import type { MemoryRef } from "./types.js";
import { type EntityRecord, type World } from "./world.js";
/** Axis-aligned bounding box: top-left (x, y) plus width and height. */
export type Aabb = {
    x: number;
    y: number;
    w: number;
    h: number;
};
export type Contact = {
    a: number;
    b: number;
    nx: number;
    ny: number;
};
export declare function clearContacts(): void;
export declare function pushContact(a: number, b: number, nx: number, ny: number): void;
export declare function collisionCount(): number;
export declare function collisionEntityA(i: number): number;
export declare function collisionEntityB(i: number): number;
export declare function readAabb(memory: WebAssembly.Memory, ptr: number): Aabb;
export declare function aabbOverlap(a: Aabb, b: Aabb): boolean;
export declare function aabbResolveX(moving: Aabb, other: Aabb, velX: number): number;
export declare function aabbResolveY(moving: Aabb, other: Aabb, velY: number): number;
export declare function stepWorldPhysics(world: World, dt: number): void;
export declare function installPhysicsHooks(): void;
export declare function createPhysicsImports(memoryRef: MemoryRef): {
    aabb_overlap(aPtr: number, bPtr: number): number;
    aabb_resolve_x(mPtr: number, oPtr: number, velX: number): number;
    aabb_resolve_y(mPtr: number, oPtr: number, velY: number): number;
};
/** Expose collider helper for editor gizmos. */
export declare function getColliderBounds(e: EntityRecord): Aabb | null;
/** Ensure world gravity is used even when hooks already installed. */
export declare function ensurePhysicsInstalled(): void;
//# sourceMappingURL=physics.d.ts.map