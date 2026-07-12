/** AABB physics intrinsics: aabb_overlap, aabb_resolve_x. */

import type { MemoryRef } from "./types.js";

/** Axis-aligned bounding box: top-left (x, y) plus width and height. */
export type Aabb = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function readAabb(memory: WebAssembly.Memory, ptr: number): Aabb {
  const view = new DataView(memory.buffer);
  return {
    x: view.getFloat32(ptr, true),
    y: view.getFloat32(ptr + 4, true),
    w: view.getFloat32(ptr + 8, true),
    h: view.getFloat32(ptr + 12, true),
  };
}

export function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function aabbResolveX(moving: Aabb, other: Aabb, velX: number): number {
  if (!aabbOverlap(moving, other)) return velX;
  const movingRight = velX > 0;
  const movingLeft = velX < 0;
  if (movingRight && moving.x + moving.w > other.x && moving.x < other.x) {
    return 0;
  }
  if (movingLeft && moving.x < other.x + other.w && moving.x + moving.w > other.x + other.w) {
    return 0;
  }
  return velX;
}

export function createPhysicsImports(memoryRef: MemoryRef) {
  return {
    aabb_overlap(aPtr: number, bPtr: number): number {
      const memory = memoryRef.current;
      if (!memory) return 0;
      return aabbOverlap(readAabb(memory, aPtr), readAabb(memory, bPtr)) ? 1 : 0;
    },
    aabb_resolve_x(mPtr: number, oPtr: number, velX: number): number {
      const memory = memoryRef.current;
      if (!memory) return velX;
      return aabbResolveX(readAabb(memory, mPtr), readAabb(memory, oPtr), velX);
    },
  };
}
