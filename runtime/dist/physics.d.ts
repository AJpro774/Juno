/** AABB / circle 2D + AABB 3D physics with shared contacts and hybrid 2D→3D sync. */
import type { MemoryRef } from "./types.js";
import { type EntityRecord, type World } from "./world.js";
/** Axis-aligned bounding box: top-left (x, y) plus width and height. */
export type Aabb = {
    x: number;
    y: number;
    w: number;
    h: number;
};
/** Axis-aligned 3D box: center (x,y,z) plus full extents. */
export type Aabb3 = {
    x: number;
    y: number;
    z: number;
    w: number;
    h: number;
    d: number;
};
export type Contact = {
    a: number;
    b: number;
    nx: number;
    ny: number;
    /** Z normal for 3D contacts; 0 for 2D. */
    nz: number;
    /** True when at least one collider is non-solid (trigger overlap). */
    trigger: boolean;
};
export declare function clearContacts(): void;
export declare function pushContact(a: number, b: number, nx: number, ny: number, trigger?: boolean, nz?: number): void;
export declare function collisionCount(): number;
export declare function collisionEntityA(i: number): number;
export declare function collisionEntityB(i: number): number;
export declare function collisionIsTrigger(i: number): number;
export declare function readAabb(memory: WebAssembly.Memory, ptr: number): Aabb;
export declare function aabbOverlap(a: Aabb, b: Aabb): boolean;
export declare function aabb3Overlap(a: Aabb3, b: Aabb3): boolean;
export declare function aabbResolveX(moving: Aabb, other: Aabb, velX: number): number;
export declare function aabbResolveY(moving: Aabb, other: Aabb, velY: number): number;
/** 2D solver only — does not clear the shared contact buffer. */
export declare function stepWorldPhysics2d(world: World, dt: number): void;
/**
 * Sync transform2d → transform3d for hybrid entities (2D physics, 3D render).
 * Maps x→tx, y→ty; keeps authored tz. Skips entities that own a rigidbody3d.
 */
export declare function syncHybrid2dTo3d(world: World): void;
/** 3D AABB solver — appends to the shared contact buffer (does not clear). */
export declare function stepWorldPhysics3d(world: World, dt: number): void;
/** Full world physics: 2D then hybrid sync then 3D; shared contact buffer. */
export declare function stepWorldPhysics(world: World, dt: number): void;
export declare function installPhysicsHooks(): void;
export declare function createPhysicsImports(memoryRef: MemoryRef): {
    aabb_overlap(aPtr: number, bPtr: number): number;
    aabb_resolve_x(mPtr: number, oPtr: number, velX: number): number;
    aabb_resolve_y(mPtr: number, oPtr: number, velY: number): number;
};
/** Expose collider helper for editor gizmos. */
export declare function getColliderBounds(e: EntityRecord): Aabb | null;
/** Expose 3D collider helper for editor gizmos. */
export declare function getColliderBounds3d(e: EntityRecord): Aabb3 | null;
/** Ensure world gravity is used even when hooks already installed. */
export declare function ensurePhysicsInstalled(): void;
//# sourceMappingURL=physics.d.ts.map