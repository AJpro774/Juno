/** Host-side ECS world for the Juno game engine. */

import { dispatchCollisionScripts, dispatchEntityScripts } from "./scripts.js";

export type Transform2D = {
  x: number;
  y: number;
  rotation: number;
  sx: number;
  sy: number;
  zIndex: number;
};

export type Transform3D = {
  tx: number;
  ty: number;
  tz: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
};

export type SpriteComp = {
  tex: number;
  w: number;
  h: number;
  frame: number;
  cols: number;
  rows: number;
  fps: number;
  loop: boolean;
  animTime: number;
};

export type Mesh3DComp = {
  meshHandle: number;
};

export type Camera2DComp = {
  x: number;
  y: number;
  zoom: number;
  active: boolean;
  followTarget: number;
  smooth: number;
};

export type Camera3DComp = {
  camHandle: number;
  active: boolean;
};

export type RigidBody2D = {
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  gravity: number;
  grounded: boolean;
};

export type Collider2D = {
  kind: "aabb" | "circle";
  w: number;
  h: number;
  radius: number;
  solid: boolean;
  /** Degrees from horizontal; non-zero enables slope slide when grounded on this surface. */
  slope: number;
};

export type PrefabComp = {
  path: string;
  offsetX: number;
  offsetY: number;
};

export type TilemapComp = {
  tileSize: number;
  cols: number;
  rows: number;
  tiles: number[];
  tileset: number;
};

export type Light3DComp = {
  kind: "directional" | "point";
  dx: number;
  dy: number;
  dz: number;
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  range: number;
};

export type ScriptRef = {
  module: string;
  handler: string;
};

export type EntityRecord = {
  id: number;
  name: string;
  tag: string;
  parent: number;
  transform2d?: Transform2D;
  transform3d?: Transform3D;
  sprite?: SpriteComp;
  mesh3d?: Mesh3DComp;
  camera2d?: Camera2DComp;
  camera3d?: Camera3DComp;
  rigidbody2d?: RigidBody2D;
  collider2d?: Collider2D;
  tilemap?: TilemapComp;
  light3d?: Light3DComp;
  script?: ScriptRef;
  prefab?: PrefabComp;
};

export type World = {
  entities: Map<number, EntityRecord>;
  nextId: number;
  tags: Map<string, number>;
  gravity: number;
};

export let activeWorld: World | null = null;

export function createWorld(): World {
  const world: World = {
    entities: new Map(),
    nextId: 1,
    tags: new Map(),
    gravity: 900,
  };
  activeWorld = world;
  return world;
}

export function getWorld(): World {
  if (!activeWorld) return createWorld();
  return activeWorld;
}

export function resetWorld(): void {
  activeWorld = null;
}

export function entityCreate(world: World = getWorld()): number {
  const id = world.nextId++;
  world.entities.set(id, {
    id,
    name: `Entity_${id}`,
    tag: "",
    parent: 0,
  });
  return id;
}

export function entityDestroy(id: number, world: World = getWorld()): void {
  const e = world.entities.get(id | 0);
  if (!e) return;
  if (e.tag) world.tags.delete(e.tag);
  world.entities.delete(id | 0);
}

export function entitySetTag(id: number, tag: string, world: World = getWorld()): void {
  const e = world.entities.get(id | 0);
  if (!e) return;
  if (e.tag) world.tags.delete(e.tag);
  e.tag = tag;
  if (tag) world.tags.set(tag, id | 0);
}

export function entityFindByTag(tag: string, world: World = getWorld()): number {
  return world.tags.get(tag) ?? 0;
}

export function defaultTransform2D(): Transform2D {
  return { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, zIndex: 0 };
}

export function defaultTransform3D(): Transform3D {
  return { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
}

export function transform2dSet(
  id: number,
  x: number,
  y: number,
  rot: number,
  sx: number,
  sy: number,
  world: World = getWorld()
): void {
  const e = world.entities.get(id | 0);
  if (!e) return;
  const t = e.transform2d ?? defaultTransform2D();
  t.x = x;
  t.y = y;
  t.rotation = rot;
  t.sx = sx;
  t.sy = sy;
  e.transform2d = t;
}

export function transform3dSet(
  id: number,
  tx: number,
  ty: number,
  tz: number,
  rx: number,
  ry: number,
  rz: number,
  sx: number,
  sy: number,
  sz: number,
  world: World = getWorld()
): void {
  const e = world.entities.get(id | 0);
  if (!e) return;
  e.transform3d = { tx, ty, tz, rx, ry, rz, sx, sy, sz };
}

export function spriteSet(
  id: number,
  tex: number,
  w: number,
  h: number,
  world: World = getWorld()
): void {
  const e = world.entities.get(id | 0);
  if (!e) return;
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
  if (!e.transform2d) e.transform2d = defaultTransform2D();
}

export function mesh3dAttach(id: number, meshHandle: number, world: World = getWorld()): void {
  const e = world.entities.get(id | 0);
  if (!e) return;
  e.mesh3d = { meshHandle: meshHandle | 0 };
  if (!e.transform3d) e.transform3d = defaultTransform3D();
}

export function camera2dSet(
  id: number,
  x: number,
  y: number,
  zoom: number,
  world: World = getWorld()
): void {
  const e = world.entities.get(id | 0);
  if (!e) return;
  for (const other of world.entities.values()) {
    if (other.camera2d) other.camera2d.active = false;
  }
  e.camera2d = { x, y, zoom: zoom || 1, active: true, followTarget: 0, smooth: 1 };
}

export function camera2dFollow(
  camId: number,
  targetId: number,
  smooth: number,
  world: World = getWorld()
): void {
  const e = world.entities.get(camId | 0);
  if (!e) return;
  if (!e.camera2d) {
    camera2dSet(camId, 0, 0, 1, world);
  }
  if (e.camera2d) {
    e.camera2d.followTarget = targetId | 0;
    e.camera2d.smooth = Math.max(0, smooth);
    e.camera2d.active = true;
    for (const other of world.entities.values()) {
      if (other.id !== (camId | 0) && other.camera2d) other.camera2d.active = false;
    }
  }
}

export function rigidbody2dSetVel(id: number, vx: number, vy: number, world: World = getWorld()): void {
  const e = world.entities.get(id | 0);
  if (!e) return;
  if (!e.rigidbody2d) {
    e.rigidbody2d = { vx: 0, vy: 0, ax: 0, ay: 0, gravity: 0, grounded: false };
  }
  e.rigidbody2d.vx = vx;
  // Sentinel: vy >= 1e6 means "leave vertical velocity unchanged" (airborne horizontal move).
  if (vy < 1_000_000) e.rigidbody2d.vy = vy;
}

export function rigidbody2dGetGrounded(id: number, world: World = getWorld()): number {
  return world.entities.get(id | 0)?.rigidbody2d?.grounded ? 1 : 0;
}

export function collider2dSet(
  id: number,
  kind: number,
  w: number,
  h: number,
  radius: number,
  solid: number,
  world: World = getWorld()
): void {
  const e = world.entities.get(id | 0);
  if (!e) return;
  e.collider2d = {
    kind: kind === 1 ? "circle" : "aabb",
    w,
    h,
    radius,
    solid: solid !== 0,
    slope: e.collider2d?.slope ?? 0,
  };
  if (!e.transform2d) e.transform2d = defaultTransform2D();
}

export function getActiveCamera2D(world: World = getWorld()): Camera2DComp | null {
  for (const e of world.entities.values()) {
    if (e.camera2d?.active) return e.camera2d;
  }
  return null;
}

export type PhysicsHooks = {
  stepPhysics: (world: World, dt: number) => void;
  syncMeshes?: (world: World) => void;
};

let physicsHooks: PhysicsHooks | null = null;

export function setPhysicsHooks(hooks: PhysicsHooks | null): void {
  physicsHooks = hooks;
}

export function worldStep(dt: number, world: World = getWorld()): void {
  const clamped = Math.min(0.05, Math.max(0, dt));

  for (const e of world.entities.values()) {
    const sprite = e.sprite;
    if (sprite && sprite.fps > 0 && sprite.cols * sprite.rows > 1) {
      sprite.animTime += clamped;
      const total = sprite.cols * sprite.rows;
      const frame = Math.floor(sprite.animTime * sprite.fps);
      if (sprite.loop) {
        sprite.frame = frame % total;
      } else {
        sprite.frame = Math.min(frame, total - 1);
      }
    }
  }

  if (physicsHooks?.stepPhysics) {
    physicsHooks.stepPhysics(world, clamped);
  } else {
    for (const e of world.entities.values()) {
      const body = e.rigidbody2d;
      const t = e.transform2d;
      if (!body || !t) continue;
      body.vy += (body.ay + body.gravity) * clamped;
      body.vx += body.ax * clamped;
      t.x += body.vx * clamped;
      t.y += body.vy * clamped;
    }
  }

  for (const e of world.entities.values()) {
    const cam = e.camera2d;
    if (!cam || !cam.followTarget) continue;
    const target = world.entities.get(cam.followTarget);
    if (!target?.transform2d) continue;
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
