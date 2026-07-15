/** AABB / circle 2D physics with velocity integration, contacts, and axis separation. */

import type { MemoryRef } from "./types.js";
import {
  getWorld,
  setPhysicsHooks,
  type EntityRecord,
  type World,
} from "./world.js";

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

const MAX_CONTACTS = 64;
let contacts: Contact[] = [];

export function clearContacts(): void {
  contacts = [];
}

export function pushContact(a: number, b: number, nx: number, ny: number): void {
  if (contacts.length >= MAX_CONTACTS) return;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  for (const c of contacts) {
    if (c.a === lo && c.b === hi) return;
  }
  contacts.push({ a: lo, b: hi, nx, ny });
}

export function collisionCount(): number {
  return contacts.length;
}

export function collisionEntityA(i: number): number {
  return contacts[i | 0]?.a ?? 0;
}

export function collisionEntityB(i: number): number {
  return contacts[i | 0]?.b ?? 0;
}

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

export function aabbResolveY(moving: Aabb, other: Aabb, velY: number): number {
  if (!aabbOverlap(moving, other)) return velY;
  if (velY > 0 && moving.y + moving.h > other.y && moving.y < other.y) return 0;
  if (velY < 0 && moving.y < other.y + other.h && moving.y + moving.h > other.y + other.h) return 0;
  return velY;
}

function colliderAabb(e: EntityRecord): Aabb | null {
  const t = e.transform2d;
  const c = e.collider2d;
  if (!t || !c) return null;
  if (c.kind === "circle") {
    const r = c.radius;
    return { x: t.x - r, y: t.y - r, w: r * 2, h: r * 2 };
  }
  return { x: t.x - c.w / 2, y: t.y - c.h / 2, w: c.w, h: c.h };
}

function circleOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const rr = ar + br;
  return dx * dx + dy * dy < rr * rr;
}

function recordTriggerOverlaps(moving: EntityRecord, other: EntityRecord): void {
  const mt = moving.transform2d;
  const ot = other.transform2d;
  const mc = moving.collider2d;
  const oc = other.collider2d;
  if (!mt || !ot || !mc || !oc) return;
  if (mc.solid && oc.solid) return; // solids handled in resolvePair

  if (mc.kind === "circle" && oc.kind === "circle") {
    if (circleOverlap(mt.x, mt.y, mc.radius, ot.x, ot.y, oc.radius)) {
      pushContact(moving.id, other.id, 0, 0);
    }
    return;
  }
  const a = colliderAabb(moving);
  const b = colliderAabb(other);
  if (a && b && aabbOverlap(a, b)) pushContact(moving.id, other.id, 0, 0);
}

function resolvePair(moving: EntityRecord, other: EntityRecord): void {
  const body = moving.rigidbody2d;
  const mt = moving.transform2d;
  const ot = other.transform2d;
  const mc = moving.collider2d;
  const oc = other.collider2d;
  if (!body || !mt || !ot || !mc || !oc) return;

  // Triggers: overlap only
  if (!oc.solid || !mc.solid) {
    recordTriggerOverlaps(moving, other);
    return;
  }

  if (mc.kind === "circle" && oc.kind === "circle") {
    if (!circleOverlap(mt.x, mt.y, mc.radius, ot.x, ot.y, oc.radius)) return;
    const dx = mt.x - ot.x;
    const dy = mt.y - ot.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    const overlap = mc.radius + oc.radius - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    mt.x += nx * overlap;
    mt.y += ny * overlap;
    const vn = body.vx * nx + body.vy * ny;
    if (vn < 0) {
      body.vx -= vn * nx;
      body.vy -= vn * ny;
    }
    if (ny < -0.5) body.grounded = true;
    pushContact(moving.id, other.id, nx, ny);
    return;
  }

  const a = colliderAabb(moving);
  const b = colliderAabb(other);
  if (!a || !b || !aabbOverlap(a, b)) return;

  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  let nx = 0;
  let ny = 0;

  if (overlapX < overlapY) {
    if (a.x + a.w / 2 < b.x + b.w / 2) {
      mt.x -= overlapX;
      nx = -1;
    } else {
      mt.x += overlapX;
      nx = 1;
    }
    body.vx = 0;
  } else {
    if (a.y + a.h / 2 < b.y + b.h / 2) {
      mt.y -= overlapY;
      body.grounded = true;
      ny = -1;
    } else {
      mt.y += overlapY;
      ny = 1;
    }
    body.vy = 0;
  }
  pushContact(moving.id, other.id, nx, ny);
}

export function stepWorldPhysics(world: World, dt: number): void {
  clearContacts();
  const bodies: EntityRecord[] = [];
  const colliders: EntityRecord[] = [];

  for (const e of world.entities.values()) {
    if (e.rigidbody2d && e.transform2d) bodies.push(e);
    if (e.collider2d && e.transform2d) colliders.push(e);
  }

  for (const e of bodies) {
    const body = e.rigidbody2d!;
    const t = e.transform2d!;
    body.grounded = false;
    const g = body.gravity !== 0 ? body.gravity : world.gravity;
    body.vy += (body.ay + g) * dt;
    body.vx += body.ax * dt;

    t.x += body.vx * dt;
    for (const other of colliders) {
      if (other.id === e.id) continue;
      resolvePair(e, other);
    }

    t.y += body.vy * dt;
    for (const other of colliders) {
      if (other.id === e.id) continue;
      resolvePair(e, other);
    }
  }

  // Static trigger pairs (no rigidbody) — e.g. player already resolved; also scan body vs all triggers
  for (const e of bodies) {
    for (const other of colliders) {
      if (other.id === e.id) continue;
      if (other.collider2d?.solid && e.collider2d?.solid) continue;
      recordTriggerOverlaps(e, other);
    }
  }
}

export function installPhysicsHooks(): void {
  setPhysicsHooks({ stepPhysics: stepWorldPhysics });
}

export function createPhysicsImports(memoryRef: MemoryRef) {
  installPhysicsHooks();
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
    aabb_resolve_y(mPtr: number, oPtr: number, velY: number): number {
      const memory = memoryRef.current;
      if (!memory) return velY;
      return aabbResolveY(readAabb(memory, mPtr), readAabb(memory, oPtr), velY);
    },
  };
}

/** Expose collider helper for editor gizmos. */
export function getColliderBounds(e: EntityRecord): Aabb | null {
  return colliderAabb(e);
}

/** Ensure world gravity is used even when hooks already installed. */
export function ensurePhysicsInstalled(): void {
  installPhysicsHooks();
  getWorld();
}
