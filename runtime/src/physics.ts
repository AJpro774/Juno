/** AABB / circle 2D + AABB 3D physics with shared contacts and hybrid 2D→3D sync. */

import type { MemoryRef } from "./types.js";
import {
  defaultTransform3D,
  getWorld,
  setPhysicsHooks,
  type Collider2D,
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

const MAX_CONTACTS = 64;
let contacts: Contact[] = [];

export function clearContacts(): void {
  contacts = [];
}

export function pushContact(
  a: number,
  b: number,
  nx: number,
  ny: number,
  trigger = false,
  nz = 0
): void {
  if (contacts.length >= MAX_CONTACTS) return;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  for (const c of contacts) {
    if (c.a === lo && c.b === hi) {
      // Upgrade solid contact normals if a later resolve has better info.
      if (!trigger && c.trigger) {
        c.trigger = false;
        c.nx = nx;
        c.ny = ny;
        c.nz = nz;
      }
      return;
    }
  }
  contacts.push({ a: lo, b: hi, nx, ny, nz, trigger });
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

export function collisionIsTrigger(i: number): number {
  return contacts[i | 0]?.trigger ? 1 : 0;
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

export function aabb3Overlap(a: Aabb3, b: Aabb3): boolean {
  return (
    a.x - a.w / 2 < b.x + b.w / 2 &&
    a.x + a.w / 2 > b.x - b.w / 2 &&
    a.y - a.h / 2 < b.y + b.h / 2 &&
    a.y + a.h / 2 > b.y - b.h / 2 &&
    a.z - a.d / 2 < b.z + b.d / 2 &&
    a.z + a.d / 2 > b.z - b.d / 2
  );
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

function colliderAabb3(e: EntityRecord): Aabb3 | null {
  const t = e.transform3d;
  const c = e.collider3d;
  if (!t || !c) return null;
  return { x: t.tx, y: t.ty, z: t.tz, w: c.w, h: c.h, d: c.d };
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

/** Walkable surface in 2D (Y-down): normal points upward enough (ny < -0.35). */
function isGroundNormal2d(_nx: number, ny: number): boolean {
  return ny < -0.35;
}

/** Walkable surface in 3D (Y-up): normal points upward enough (ny > 0.35). */
function isGroundNormal3d(_nx: number, ny: number, _nz: number): boolean {
  return ny > 0.35;
}

function applySlopeSlide(body: NonNullable<EntityRecord["rigidbody2d"]>, slopeDeg: number): void {
  if (!slopeDeg || !body.grounded) return;
  const rad = (slopeDeg * Math.PI) / 180;
  // Slide along the slope (positive slope = rises to the right).
  const alongX = Math.cos(rad);
  const alongY = Math.sin(rad);
  const g = 900 * 0.35;
  body.vx += alongX * g * (1 / 60);
  body.vy += alongY * g * (1 / 60);
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
      pushContact(moving.id, other.id, 0, 0, true);
    }
    return;
  }
  const a = colliderAabb(moving);
  const b = colliderAabb(other);
  if (a && b && aabbOverlap(a, b)) pushContact(moving.id, other.id, 0, 0, true);
}

function markGrounded(
  body: NonNullable<EntityRecord["rigidbody2d"]>,
  nx: number,
  ny: number,
  surface: Collider2D | undefined
): void {
  if (!isGroundNormal2d(nx, ny)) return;
  body.grounded = true;
  if (surface?.slope) applySlopeSlide(body, surface.slope);
}

function resolvePair(moving: EntityRecord, other: EntityRecord): void {
  const body = moving.rigidbody2d;
  const mt = moving.transform2d;
  const ot = other.transform2d;
  const mc = moving.collider2d;
  const oc = other.collider2d;
  if (!body || !mt || !ot || !mc || !oc) return;

  // Triggers: overlap only (never set grounded, never push)
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
    markGrounded(body, nx, ny, oc);
    pushContact(moving.id, other.id, nx, ny, false);
    return;
  }

  const a = colliderAabb(moving);
  const b = colliderAabb(other);
  if (!a || !b || !aabbOverlap(a, b)) return;

  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  let nx = 0;
  let ny = 0;

  // Prefer Y separation when nearly equal (platformer feel / gentle slopes as stacked AABBs).
  const preferY = overlapY <= overlapX * 1.05;

  if (!preferY) {
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
      ny = -1;
      // Soften horizontal cancel when landing on a sloped surface.
      if (oc.slope) {
        const rad = (oc.slope * Math.PI) / 180;
        nx = Math.sin(rad);
        ny = -Math.cos(rad);
      }
    } else {
      mt.y += overlapY;
      ny = 1;
    }
    body.vy = 0;
  }
  markGrounded(body, nx, ny, oc);
  pushContact(moving.id, other.id, nx, ny, false);
}

function recordTriggerOverlaps3d(moving: EntityRecord, other: EntityRecord): void {
  const mc = moving.collider3d;
  const oc = other.collider3d;
  if (!mc || !oc) return;
  if (mc.solid && oc.solid) return;
  const a = colliderAabb3(moving);
  const b = colliderAabb3(other);
  if (a && b && aabb3Overlap(a, b)) pushContact(moving.id, other.id, 0, 0, true, 0);
}

function resolvePair3d(moving: EntityRecord, other: EntityRecord): void {
  const body = moving.rigidbody3d;
  const mt = moving.transform3d;
  const ot = other.transform3d;
  const mc = moving.collider3d;
  const oc = other.collider3d;
  if (!body || !mt || !ot || !mc || !oc) return;

  if (!oc.solid || !mc.solid) {
    recordTriggerOverlaps3d(moving, other);
    return;
  }

  const a = colliderAabb3(moving);
  const b = colliderAabb3(other);
  if (!a || !b || !aabb3Overlap(a, b)) return;

  const aMinX = a.x - a.w / 2;
  const aMaxX = a.x + a.w / 2;
  const aMinY = a.y - a.h / 2;
  const aMaxY = a.y + a.h / 2;
  const aMinZ = a.z - a.d / 2;
  const aMaxZ = a.z + a.d / 2;
  const bMinX = b.x - b.w / 2;
  const bMaxX = b.x + b.w / 2;
  const bMinY = b.y - b.h / 2;
  const bMaxY = b.y + b.h / 2;
  const bMinZ = b.z - b.d / 2;
  const bMaxZ = b.z + b.d / 2;

  const overlapX = Math.min(aMaxX, bMaxX) - Math.max(aMinX, bMinX);
  const overlapY = Math.min(aMaxY, bMaxY) - Math.max(aMinY, bMinY);
  const overlapZ = Math.min(aMaxZ, bMaxZ) - Math.max(aMinZ, bMinZ);

  let nx = 0;
  let ny = 0;
  let nz = 0;

  // Prefer Y separation for platformer-style landings when nearly tied.
  const minOverlap = Math.min(overlapX, overlapY, overlapZ);
  const preferY = overlapY <= overlapX * 1.05 && overlapY <= overlapZ * 1.05;

  if (preferY || minOverlap === overlapY) {
    if (a.y < b.y) {
      mt.ty -= overlapY;
      ny = -1;
    } else {
      mt.ty += overlapY;
      ny = 1;
    }
    body.vy = 0;
  } else if (minOverlap === overlapX) {
    if (a.x < b.x) {
      mt.tx -= overlapX;
      nx = -1;
    } else {
      mt.tx += overlapX;
      nx = 1;
    }
    body.vx = 0;
  } else {
    if (a.z < b.z) {
      mt.tz -= overlapZ;
      nz = -1;
    } else {
      mt.tz += overlapZ;
      nz = 1;
    }
    body.vz = 0;
  }

  if (isGroundNormal3d(nx, ny, nz)) body.grounded = true;
  pushContact(moving.id, other.id, nx, ny, false, nz);
}

/** 2D solver only — does not clear the shared contact buffer. */
export function stepWorldPhysics2d(world: World, dt: number): void {
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

  // Static trigger pairs (no rigidbody) — body vs all triggers
  for (const e of bodies) {
    for (const other of colliders) {
      if (other.id === e.id) continue;
      if (other.collider2d?.solid && e.collider2d?.solid) continue;
      recordTriggerOverlaps(e, other);
    }
  }
}

/**
 * Sync transform2d → transform3d for hybrid entities (2D physics, 3D render).
 * Maps x→tx, y→ty; keeps authored tz. Skips entities that own a rigidbody3d.
 */
export function syncHybrid2dTo3d(world: World): void {
  for (const e of world.entities.values()) {
    if (!e.transform2d) continue;
    if (e.rigidbody3d) continue;
    if (!e.transform3d && !e.mesh3d) continue;
    const t3 = e.transform3d ?? defaultTransform3D();
    t3.tx = e.transform2d.x;
    t3.ty = e.transform2d.y;
    e.transform3d = t3;
  }
}

/** 3D AABB solver — appends to the shared contact buffer (does not clear). */
export function stepWorldPhysics3d(world: World, dt: number): void {
  const bodies: EntityRecord[] = [];
  const colliders: EntityRecord[] = [];

  for (const e of world.entities.values()) {
    // Hybrid: 2D body already drives motion; skip 3D integration for those.
    if (e.rigidbody3d && e.transform3d && !e.rigidbody2d) bodies.push(e);
    if (e.collider3d && e.transform3d) colliders.push(e);
  }

  for (const e of bodies) {
    const body = e.rigidbody3d!;
    const t = e.transform3d!;
    body.grounded = false;
    const g = body.gravity !== 0 ? body.gravity : world.gravity;
    // Y-up: gravity pulls down (−Y).
    body.vy -= g * dt;

    t.tx += body.vx * dt;
    for (const other of colliders) {
      if (other.id === e.id) continue;
      resolvePair3d(e, other);
    }

    t.ty += body.vy * dt;
    for (const other of colliders) {
      if (other.id === e.id) continue;
      resolvePair3d(e, other);
    }

    t.tz += body.vz * dt;
    for (const other of colliders) {
      if (other.id === e.id) continue;
      resolvePair3d(e, other);
    }
  }

  for (const e of bodies) {
    for (const other of colliders) {
      if (other.id === e.id) continue;
      if (other.collider3d?.solid && e.collider3d?.solid) continue;
      recordTriggerOverlaps3d(e, other);
    }
  }
}

/** Full world physics: 2D then hybrid sync then 3D; shared contact buffer. */
export function stepWorldPhysics(world: World, dt: number): void {
  clearContacts();
  stepWorldPhysics2d(world, dt);
  syncHybrid2dTo3d(world);
  stepWorldPhysics3d(world, dt);
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

/** Expose 3D collider helper for editor gizmos. */
export function getColliderBounds3d(e: EntityRecord): Aabb3 | null {
  return colliderAabb3(e);
}

/** Ensure world gravity is used even when hooks already installed. */
export function ensurePhysicsInstalled(): void {
  installPhysicsHooks();
  getWorld();
}
