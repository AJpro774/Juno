/** AABB / circle 2D physics with velocity integration, contacts, and axis separation. */
import { getWorld, setPhysicsHooks, } from "./world.js";
const MAX_CONTACTS = 64;
let contacts = [];
export function clearContacts() {
    contacts = [];
}
export function pushContact(a, b, nx, ny, trigger = false) {
    if (contacts.length >= MAX_CONTACTS)
        return;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (const c of contacts) {
        if (c.a === lo && c.b === hi) {
            // Upgrade solid contact normals if a later resolve has better info.
            if (!trigger && c.trigger) {
                c.trigger = false;
                c.nx = nx;
                c.ny = ny;
            }
            return;
        }
    }
    contacts.push({ a: lo, b: hi, nx, ny, trigger });
}
export function collisionCount() {
    return contacts.length;
}
export function collisionEntityA(i) {
    return contacts[i | 0]?.a ?? 0;
}
export function collisionEntityB(i) {
    return contacts[i | 0]?.b ?? 0;
}
export function collisionIsTrigger(i) {
    return contacts[i | 0]?.trigger ? 1 : 0;
}
export function readAabb(memory, ptr) {
    const view = new DataView(memory.buffer);
    return {
        x: view.getFloat32(ptr, true),
        y: view.getFloat32(ptr + 4, true),
        w: view.getFloat32(ptr + 8, true),
        h: view.getFloat32(ptr + 12, true),
    };
}
export function aabbOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export function aabbResolveX(moving, other, velX) {
    if (!aabbOverlap(moving, other))
        return velX;
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
export function aabbResolveY(moving, other, velY) {
    if (!aabbOverlap(moving, other))
        return velY;
    if (velY > 0 && moving.y + moving.h > other.y && moving.y < other.y)
        return 0;
    if (velY < 0 && moving.y < other.y + other.h && moving.y + moving.h > other.y + other.h)
        return 0;
    return velY;
}
function colliderAabb(e) {
    const t = e.transform2d;
    const c = e.collider2d;
    if (!t || !c)
        return null;
    if (c.kind === "circle") {
        const r = c.radius;
        return { x: t.x - r, y: t.y - r, w: r * 2, h: r * 2 };
    }
    return { x: t.x - c.w / 2, y: t.y - c.h / 2, w: c.w, h: c.h };
}
function circleOverlap(ax, ay, ar, bx, by, br) {
    const dx = bx - ax;
    const dy = by - ay;
    const rr = ar + br;
    return dx * dx + dy * dy < rr * rr;
}
/** Walkable surface: normal points upward enough (ny < -0.35). */
function isGroundNormal(_nx, ny) {
    return ny < -0.35;
}
function applySlopeSlide(body, slopeDeg) {
    if (!slopeDeg || !body.grounded)
        return;
    const rad = (slopeDeg * Math.PI) / 180;
    // Slide along the slope (positive slope = rises to the right).
    const alongX = Math.cos(rad);
    const alongY = Math.sin(rad);
    const g = 900 * 0.35;
    body.vx += alongX * g * (1 / 60);
    body.vy += alongY * g * (1 / 60);
}
function recordTriggerOverlaps(moving, other) {
    const mt = moving.transform2d;
    const ot = other.transform2d;
    const mc = moving.collider2d;
    const oc = other.collider2d;
    if (!mt || !ot || !mc || !oc)
        return;
    if (mc.solid && oc.solid)
        return; // solids handled in resolvePair
    if (mc.kind === "circle" && oc.kind === "circle") {
        if (circleOverlap(mt.x, mt.y, mc.radius, ot.x, ot.y, oc.radius)) {
            pushContact(moving.id, other.id, 0, 0, true);
        }
        return;
    }
    const a = colliderAabb(moving);
    const b = colliderAabb(other);
    if (a && b && aabbOverlap(a, b))
        pushContact(moving.id, other.id, 0, 0, true);
}
function markGrounded(body, nx, ny, surface) {
    if (!isGroundNormal(nx, ny))
        return;
    body.grounded = true;
    if (surface?.slope)
        applySlopeSlide(body, surface.slope);
}
function resolvePair(moving, other) {
    const body = moving.rigidbody2d;
    const mt = moving.transform2d;
    const ot = other.transform2d;
    const mc = moving.collider2d;
    const oc = other.collider2d;
    if (!body || !mt || !ot || !mc || !oc)
        return;
    // Triggers: overlap only (never set grounded, never push)
    if (!oc.solid || !mc.solid) {
        recordTriggerOverlaps(moving, other);
        return;
    }
    if (mc.kind === "circle" && oc.kind === "circle") {
        if (!circleOverlap(mt.x, mt.y, mc.radius, ot.x, ot.y, oc.radius))
            return;
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
    if (!a || !b || !aabbOverlap(a, b))
        return;
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
        }
        else {
            mt.x += overlapX;
            nx = 1;
        }
        body.vx = 0;
    }
    else {
        if (a.y + a.h / 2 < b.y + b.h / 2) {
            mt.y -= overlapY;
            ny = -1;
            // Soften horizontal cancel when landing on a sloped surface.
            if (oc.slope) {
                const rad = (oc.slope * Math.PI) / 180;
                nx = Math.sin(rad);
                ny = -Math.cos(rad);
            }
        }
        else {
            mt.y += overlapY;
            ny = 1;
        }
        body.vy = 0;
    }
    markGrounded(body, nx, ny, oc);
    pushContact(moving.id, other.id, nx, ny, false);
}
export function stepWorldPhysics(world, dt) {
    clearContacts();
    const bodies = [];
    const colliders = [];
    for (const e of world.entities.values()) {
        if (e.rigidbody2d && e.transform2d)
            bodies.push(e);
        if (e.collider2d && e.transform2d)
            colliders.push(e);
    }
    for (const e of bodies) {
        const body = e.rigidbody2d;
        const t = e.transform2d;
        body.grounded = false;
        const g = body.gravity !== 0 ? body.gravity : world.gravity;
        body.vy += (body.ay + g) * dt;
        body.vx += body.ax * dt;
        t.x += body.vx * dt;
        for (const other of colliders) {
            if (other.id === e.id)
                continue;
            resolvePair(e, other);
        }
        t.y += body.vy * dt;
        for (const other of colliders) {
            if (other.id === e.id)
                continue;
            resolvePair(e, other);
        }
    }
    // Static trigger pairs (no rigidbody) — body vs all triggers
    for (const e of bodies) {
        for (const other of colliders) {
            if (other.id === e.id)
                continue;
            if (other.collider2d?.solid && e.collider2d?.solid)
                continue;
            recordTriggerOverlaps(e, other);
        }
    }
}
export function installPhysicsHooks() {
    setPhysicsHooks({ stepPhysics: stepWorldPhysics });
}
export function createPhysicsImports(memoryRef) {
    installPhysicsHooks();
    return {
        aabb_overlap(aPtr, bPtr) {
            const memory = memoryRef.current;
            if (!memory)
                return 0;
            return aabbOverlap(readAabb(memory, aPtr), readAabb(memory, bPtr)) ? 1 : 0;
        },
        aabb_resolve_x(mPtr, oPtr, velX) {
            const memory = memoryRef.current;
            if (!memory)
                return velX;
            return aabbResolveX(readAabb(memory, mPtr), readAabb(memory, oPtr), velX);
        },
        aabb_resolve_y(mPtr, oPtr, velY) {
            const memory = memoryRef.current;
            if (!memory)
                return velY;
            return aabbResolveY(readAabb(memory, mPtr), readAabb(memory, oPtr), velY);
        },
    };
}
/** Expose collider helper for editor gizmos. */
export function getColliderBounds(e) {
    return colliderAabb(e);
}
/** Ensure world gravity is used even when hooks already installed. */
export function ensurePhysicsInstalled() {
    installPhysicsHooks();
    getWorld();
}
//# sourceMappingURL=physics.js.map