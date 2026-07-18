/** Host-side ECS world for the Juno game engine. */
import { dispatchCollisionScripts, dispatchEntityScripts } from "./scripts.js";
export let activeWorld = null;
export function createWorld() {
    const world = {
        entities: new Map(),
        nextId: 1,
        tags: new Map(),
        gravity: 900,
    };
    activeWorld = world;
    return world;
}
export function getWorld() {
    if (!activeWorld)
        return createWorld();
    return activeWorld;
}
export function resetWorld() {
    activeWorld = null;
}
export function entityCreate(world = getWorld()) {
    const id = world.nextId++;
    world.entities.set(id, {
        id,
        name: `Entity_${id}`,
        tag: "",
        parent: 0,
    });
    return id;
}
export function entityDestroy(id, world = getWorld()) {
    const e = world.entities.get(id | 0);
    if (!e)
        return;
    if (e.tag)
        world.tags.delete(e.tag);
    world.entities.delete(id | 0);
}
export function entitySetTag(id, tag, world = getWorld()) {
    const e = world.entities.get(id | 0);
    if (!e)
        return;
    if (e.tag)
        world.tags.delete(e.tag);
    e.tag = tag;
    if (tag)
        world.tags.set(tag, id | 0);
}
export function entityFindByTag(tag, world = getWorld()) {
    return world.tags.get(tag) ?? 0;
}
export function defaultTransform2D() {
    return { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, zIndex: 0 };
}
export function defaultTransform3D() {
    return { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
}
export function transform2dSet(id, x, y, rot, sx, sy, world = getWorld()) {
    const e = world.entities.get(id | 0);
    if (!e)
        return;
    const t = e.transform2d ?? defaultTransform2D();
    t.x = x;
    t.y = y;
    t.rotation = rot;
    t.sx = sx;
    t.sy = sy;
    e.transform2d = t;
}
export function transform3dSet(id, tx, ty, tz, rx, ry, rz, sx, sy, sz, world = getWorld()) {
    const e = world.entities.get(id | 0);
    if (!e)
        return;
    e.transform3d = { tx, ty, tz, rx, ry, rz, sx, sy, sz };
}
export function spriteSet(id, tex, w, h, world = getWorld()) {
    const e = world.entities.get(id | 0);
    if (!e)
        return;
    e.sprite = {
        tex: tex | 0,
        w,
        h,
        frame: 0,
        cols: 1,
        rows: 1,
        fps: 0,
        loop: true,
        animTime: 0,
    };
    if (!e.transform2d)
        e.transform2d = defaultTransform2D();
}
export function mesh3dAttach(id, meshHandle, world = getWorld()) {
    const e = world.entities.get(id | 0);
    if (!e)
        return;
    e.mesh3d = { meshHandle: meshHandle | 0 };
    if (!e.transform3d)
        e.transform3d = defaultTransform3D();
}
function findClip(anim, name) {
    const want = name.trim();
    if (!want)
        return null;
    return anim.clips.find((c) => c.name === want) ?? null;
}
function clipDuration(clip) {
    if (clip.keys && clip.keys.length > 0) {
        let maxT = 0;
        for (const k of clip.keys)
            maxT = Math.max(maxT, k.t);
        return Math.max(maxT, 1e-6);
    }
    const frames = clip.frames;
    if (frames && frames.length > 0) {
        const fps = clip.fps > 0 ? clip.fps : 1;
        return frames.length / fps;
    }
    return 1;
}
function applyAnimKey(e, key) {
    if (key.frame !== undefined && e.sprite) {
        e.sprite.frame = key.frame | 0;
    }
    if (key.x !== undefined ||
        key.y !== undefined ||
        key.rotation !== undefined) {
        const t = e.transform2d ?? defaultTransform2D();
        if (key.x !== undefined)
            t.x = key.x;
        if (key.y !== undefined)
            t.y = key.y;
        if (key.rotation !== undefined)
            t.rotation = key.rotation;
        e.transform2d = t;
    }
    if (key.tx !== undefined ||
        key.ty !== undefined ||
        key.tz !== undefined ||
        key.rx !== undefined ||
        key.ry !== undefined ||
        key.rz !== undefined) {
        const t = e.transform3d ?? defaultTransform3D();
        if (key.tx !== undefined)
            t.tx = key.tx;
        if (key.ty !== undefined)
            t.ty = key.ty;
        if (key.tz !== undefined)
            t.tz = key.tz;
        if (key.rx !== undefined)
            t.rx = key.rx;
        if (key.ry !== undefined)
            t.ry = key.ry;
        if (key.rz !== undefined)
            t.rz = key.rz;
        e.transform3d = t;
    }
}
function sampleClip(e, clip, time) {
    const frames = clip.frames;
    if (frames && frames.length > 0) {
        const fps = clip.fps > 0 ? clip.fps : 1;
        const idx = Math.floor(time * fps);
        const frame = clip.loop
            ? frames[idx % frames.length]
            : frames[Math.min(idx, frames.length - 1)];
        if (e.sprite)
            e.sprite.frame = frame | 0;
    }
    const keys = clip.keys;
    if (!keys || keys.length === 0)
        return;
    const sorted = [...keys].sort((a, b) => a.t - b.t);
    let active = sorted[0];
    for (const k of sorted) {
        if (k.t <= time + 1e-9)
            active = k;
        else
            break;
    }
    applyAnimKey(e, active);
}
/** Start a named clip on an entity's SpriteAnimator. Returns 1 on success. */
export function animPlay(id, clipName, world = getWorld()) {
    const e = world.entities.get(id | 0);
    if (!e?.spriteAnimator)
        return 0;
    const clip = findClip(e.spriteAnimator, clipName);
    if (!clip)
        return 0;
    e.spriteAnimator.playing = clip.name;
    e.spriteAnimator.time = 0;
    sampleClip(e, clip, 0);
    return 1;
}
/** Stop the current SpriteAnimator clip on an entity. */
export function animStop(id, world = getWorld()) {
    const e = world.entities.get(id | 0);
    if (!e?.spriteAnimator)
        return;
    e.spriteAnimator.playing = "";
    e.spriteAnimator.time = 0;
}
function tickSpriteAnimator(e, dt) {
    const anim = e.spriteAnimator;
    if (!anim || !anim.playing)
        return false;
    const clip = findClip(anim, anim.playing);
    if (!clip) {
        anim.playing = "";
        return false;
    }
    anim.time += dt;
    const dur = clipDuration(clip);
    if (anim.time >= dur) {
        if (clip.loop) {
            anim.time = anim.time % dur;
        }
        else {
            anim.time = dur;
            sampleClip(e, clip, anim.time);
            anim.playing = "";
            return true;
        }
    }
    sampleClip(e, clip, anim.time);
    return true;
}
export function camera2dSet(id, x, y, zoom, world = getWorld()) {
    const e = world.entities.get(id | 0);
    if (!e)
        return;
    for (const other of world.entities.values()) {
        if (other.camera2d)
            other.camera2d.active = false;
    }
    e.camera2d = { x, y, zoom: zoom || 1, active: true, followTarget: 0, smooth: 1 };
}
export function camera2dFollow(camId, targetId, smooth, world = getWorld()) {
    const e = world.entities.get(camId | 0);
    if (!e)
        return;
    if (!e.camera2d) {
        camera2dSet(camId, 0, 0, 1, world);
    }
    if (e.camera2d) {
        e.camera2d.followTarget = targetId | 0;
        e.camera2d.smooth = Math.max(0, smooth);
        e.camera2d.active = true;
        for (const other of world.entities.values()) {
            if (other.id !== (camId | 0) && other.camera2d)
                other.camera2d.active = false;
        }
    }
}
export function rigidbody2dSetVel(id, vx, vy, world = getWorld()) {
    const e = world.entities.get(id | 0);
    if (!e)
        return;
    if (!e.rigidbody2d) {
        e.rigidbody2d = { vx: 0, vy: 0, ax: 0, ay: 0, gravity: 0, grounded: false };
    }
    e.rigidbody2d.vx = vx;
    // Sentinel: vy >= 1e6 means "leave vertical velocity unchanged" (airborne horizontal move).
    if (vy < 1_000_000)
        e.rigidbody2d.vy = vy;
}
export function rigidbody2dGetGrounded(id, world = getWorld()) {
    return world.entities.get(id | 0)?.rigidbody2d?.grounded ? 1 : 0;
}
export function collider2dSet(id, kind, w, h, radius, solid, world = getWorld()) {
    const e = world.entities.get(id | 0);
    if (!e)
        return;
    e.collider2d = {
        kind: kind === 1 ? "circle" : "aabb",
        w,
        h,
        radius,
        solid: solid !== 0,
        slope: e.collider2d?.slope ?? 0,
    };
    if (!e.transform2d)
        e.transform2d = defaultTransform2D();
}
export function rigidbody3dSetVel(id, vx, vy, vz, world = getWorld()) {
    const e = world.entities.get(id | 0);
    if (!e)
        return;
    if (!e.rigidbody3d) {
        e.rigidbody3d = { vx: 0, vy: 0, vz: 0, gravity: 0, grounded: false };
    }
    e.rigidbody3d.vx = vx;
    // Sentinel: vy >= 1e6 means leave vertical unchanged (airborne horizontal move).
    if (vy < 1_000_000)
        e.rigidbody3d.vy = vy;
    if (vz < 1_000_000)
        e.rigidbody3d.vz = vz;
}
export function rigidbody3dGetGrounded(id, world = getWorld()) {
    return world.entities.get(id | 0)?.rigidbody3d?.grounded ? 1 : 0;
}
export function collider3dSet(id, kind, w, h, d, solid, world = getWorld()) {
    const e = world.entities.get(id | 0);
    if (!e)
        return;
    void kind; // only AABB today
    e.collider3d = {
        kind: "aabb",
        w,
        h,
        d,
        solid: solid !== 0,
    };
    if (!e.transform3d)
        e.transform3d = defaultTransform3D();
}
/** Copy transform2d.x/y onto transform3d.tx/ty (keeps tz). Creates transform3d if missing. */
export function transform3dSyncFrom2d(id, world = getWorld()) {
    const e = world.entities.get(id | 0);
    if (!e?.transform2d)
        return;
    const t3 = e.transform3d ?? defaultTransform3D();
    t3.tx = e.transform2d.x;
    t3.ty = e.transform2d.y;
    e.transform3d = t3;
}
export function getActiveCamera2D(world = getWorld()) {
    for (const e of world.entities.values()) {
        if (e.camera2d?.active)
            return e.camera2d;
    }
    return null;
}
let physicsHooks = null;
export function setPhysicsHooks(hooks) {
    physicsHooks = hooks;
}
export function worldStep(dt, world = getWorld()) {
    const clamped = Math.min(0.05, Math.max(0, dt));
    for (const e of world.entities.values()) {
        const drivenByClip = tickSpriteAnimator(e, clamped);
        const sprite = e.sprite;
        if (!drivenByClip &&
            sprite &&
            sprite.fps > 0 &&
            sprite.cols * sprite.rows > 1) {
            sprite.animTime += clamped;
            const total = sprite.cols * sprite.rows;
            const frame = Math.floor(sprite.animTime * sprite.fps);
            if (sprite.loop) {
                sprite.frame = frame % total;
            }
            else {
                sprite.frame = Math.min(frame, total - 1);
            }
        }
    }
    if (physicsHooks?.stepPhysics) {
        physicsHooks.stepPhysics(world, clamped);
    }
    else {
        for (const e of world.entities.values()) {
            const body = e.rigidbody2d;
            const t = e.transform2d;
            if (!body || !t)
                continue;
            body.vy += (body.ay + body.gravity) * clamped;
            body.vx += body.ax * clamped;
            t.x += body.vx * clamped;
            t.y += body.vy * clamped;
        }
    }
    for (const e of world.entities.values()) {
        const cam = e.camera2d;
        if (!cam || !cam.followTarget)
            continue;
        const target = world.entities.get(cam.followTarget);
        if (!target?.transform2d)
            continue;
        const smooth = cam.smooth ?? 0;
        const t = smooth <= 0 ? 1 : Math.min(1, smooth * Math.max(clamped, 0.001) * 60);
        cam.x += (target.transform2d.x - cam.x) * t;
        cam.y += (target.transform2d.y - cam.y) * t;
    }
    physicsHooks?.syncMeshes?.(world);
    // Collision / trigger events, then per-entity tick (contacts are current).
    dispatchCollisionScripts(world, clamped);
    dispatchEntityScripts(world, clamped);
}
//# sourceMappingURL=world.js.map