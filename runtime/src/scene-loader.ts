/** Load / serialize `.jscene` JSON into the ECS world. */

import {
  createWorld,
  defaultTransform2D,
  defaultTransform3D,
  entitySetTag,
  getWorld,
  type Collider2D,
  type EntityRecord,
  type Light3DComp,
  type RigidBody2D,
  type SpriteComp,
  type TilemapComp,
  type World,
} from "./world.js";

export type JSceneTransform2D = {
  x?: number;
  y?: number;
  rotation?: number;
  scale?: [number, number];
  z_index?: number;
};

export type JSceneTransform3D = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
};

export type JSceneComponents = {
  transform2d?: JSceneTransform2D;
  transform3d?: JSceneTransform3D;
  sprite?: { asset?: string; tex?: number; w?: number; h?: number; cols?: number; rows?: number; fps?: number };
  mesh3d?: { mesh?: number };
  camera2d?: { x?: number; y?: number; zoom?: number; active?: boolean };
  camera3d?: { cam?: number; active?: boolean };
  rigidbody2d?: { vx?: number; vy?: number; ax?: number; ay?: number; gravity?: number };
  collider2d?: { type?: string; w?: number; h?: number; radius?: number; solid?: boolean };
  tilemap?: {
    tile_size?: number;
    cols?: number;
    rows?: number;
    tiles?: number[];
    tileset?: number;
  };
  light3d?: {
    type?: string;
    direction?: [number, number, number];
    position?: [number, number, number];
    color?: [number, number, number];
    range?: number;
  };
  script?: { module?: string; handler?: string };
};

export type JSceneEntity = {
  id?: number;
  name?: string;
  tag?: string;
  parent?: number;
  components?: JSceneComponents;
};

export type JScene = {
  version: number;
  gravity?: number;
  entities: JSceneEntity[];
};

/** Resolve asset path → handle via optional lookup (asset pack id). */
export type AssetResolver = (path: string) => number;

export function emptyScene(): JScene {
  return { version: 1, entities: [] };
}

export function parseScene(json: string | JScene): JScene {
  const data = typeof json === "string" ? (JSON.parse(json) as JScene) : json;
  if (!data || typeof data !== "object") throw new Error("invalid .jscene");
  if (!Array.isArray(data.entities)) data.entities = [];
  if (!data.version) data.version = 1;
  return data;
}

export function loadSceneIntoWorld(
  scene: JScene,
  options: { world?: World; resolveAsset?: AssetResolver; reset?: boolean } = {}
): World {
  const world = options.reset === false ? options.world ?? getWorld() : createWorld();
  if (typeof scene.gravity === "number") world.gravity = scene.gravity;

  let maxId = world.nextId - 1;
  for (const raw of scene.entities) {
    const id = raw.id && raw.id > 0 ? raw.id : world.nextId++;
    maxId = Math.max(maxId, id);
    const e: EntityRecord = {
      id,
      name: raw.name ?? `Entity_${id}`,
      tag: raw.tag ?? "",
      parent: raw.parent ?? 0,
    };
    applyComponents(e, raw.components ?? {}, options.resolveAsset);
    world.entities.set(id, e);
    if (e.tag) world.tags.set(e.tag, id);
  }
  world.nextId = maxId + 1;
  return world;
}

function applyComponents(
  e: EntityRecord,
  c: JSceneComponents,
  resolveAsset?: AssetResolver
): void {
  if (c.transform2d) {
    const t = defaultTransform2D();
    t.x = c.transform2d.x ?? 0;
    t.y = c.transform2d.y ?? 0;
    t.rotation = c.transform2d.rotation ?? 0;
    t.sx = c.transform2d.scale?.[0] ?? 1;
    t.sy = c.transform2d.scale?.[1] ?? 1;
    t.zIndex = c.transform2d.z_index ?? 0;
    e.transform2d = t;
  }
  if (c.transform3d) {
    const t = defaultTransform3D();
    t.tx = c.transform3d.position?.[0] ?? 0;
    t.ty = c.transform3d.position?.[1] ?? 0;
    t.tz = c.transform3d.position?.[2] ?? 0;
    t.rx = c.transform3d.rotation?.[0] ?? 0;
    t.ry = c.transform3d.rotation?.[1] ?? 0;
    t.rz = c.transform3d.rotation?.[2] ?? 0;
    t.sx = c.transform3d.scale?.[0] ?? 1;
    t.sy = c.transform3d.scale?.[1] ?? 1;
    t.sz = c.transform3d.scale?.[2] ?? 1;
    e.transform3d = t;
  }
  if (c.sprite) {
    let tex = c.sprite.tex ?? 0;
    if (c.sprite.asset && resolveAsset) tex = resolveAsset(c.sprite.asset);
    const sprite: SpriteComp = {
      tex,
      w: c.sprite.w ?? 32,
      h: c.sprite.h ?? 32,
      frame: 0,
      cols: c.sprite.cols ?? 1,
      rows: c.sprite.rows ?? 1,
      fps: c.sprite.fps ?? 0,
      loop: true,
      animTime: 0,
    };
    e.sprite = sprite;
    if (!e.transform2d) e.transform2d = defaultTransform2D();
  }
  if (c.mesh3d) {
    e.mesh3d = { meshHandle: c.mesh3d.mesh ?? 0 };
    if (!e.transform3d) e.transform3d = defaultTransform3D();
  }
  if (c.camera2d) {
    e.camera2d = {
      x: c.camera2d.x ?? 0,
      y: c.camera2d.y ?? 0,
      zoom: c.camera2d.zoom ?? 1,
      active: c.camera2d.active !== false,
      followTarget: 0,
      smooth: 1,
    };
  }
  if (c.camera3d) {
    e.camera3d = {
      camHandle: c.camera3d.cam ?? 0,
      active: c.camera3d.active !== false,
    };
  }
  if (c.rigidbody2d) {
    const body: RigidBody2D = {
      vx: c.rigidbody2d.vx ?? 0,
      vy: c.rigidbody2d.vy ?? 0,
      ax: c.rigidbody2d.ax ?? 0,
      ay: c.rigidbody2d.ay ?? 0,
      gravity: c.rigidbody2d.gravity ?? 0,
      grounded: false,
    };
    e.rigidbody2d = body;
  }
  if (c.collider2d) {
    const kind = c.collider2d.type === "circle" ? "circle" : "aabb";
    const col: Collider2D = {
      kind,
      w: c.collider2d.w ?? 32,
      h: c.collider2d.h ?? 32,
      radius: c.collider2d.radius ?? 16,
      solid: c.collider2d.solid !== false,
    };
    e.collider2d = col;
  }
  if (c.tilemap) {
    const tm: TilemapComp = {
      tileSize: c.tilemap.tile_size ?? 32,
      cols: c.tilemap.cols ?? 0,
      rows: c.tilemap.rows ?? 0,
      tiles: c.tilemap.tiles ?? [],
      tileset: c.tilemap.tileset ?? 0,
    };
    e.tilemap = tm;
    if (!e.transform2d) e.transform2d = defaultTransform2D();
  }
  if (c.light3d) {
    const light: Light3DComp = {
      kind: c.light3d.type === "point" ? "point" : "directional",
      dx: c.light3d.direction?.[0] ?? 0,
      dy: c.light3d.direction?.[1] ?? -1,
      dz: c.light3d.direction?.[2] ?? -0.5,
      x: c.light3d.position?.[0] ?? 0,
      y: c.light3d.position?.[1] ?? 0,
      z: c.light3d.position?.[2] ?? 0,
      r: c.light3d.color?.[0] ?? 1,
      g: c.light3d.color?.[1] ?? 1,
      b: c.light3d.color?.[2] ?? 1,
      range: c.light3d.range ?? 10,
    };
    e.light3d = light;
  }
  if (c.script) {
    e.script = {
      module: c.script.module ?? "",
      handler: c.script.handler ?? "on_update",
    };
  }
}

export function serializeWorld(world: World = getWorld()): JScene {
  const entities: JSceneEntity[] = [];
  for (const e of world.entities.values()) {
    const components: JSceneComponents = {};
    if (e.transform2d) {
      components.transform2d = {
        x: e.transform2d.x,
        y: e.transform2d.y,
        rotation: e.transform2d.rotation,
        scale: [e.transform2d.sx, e.transform2d.sy],
        z_index: e.transform2d.zIndex,
      };
    }
    if (e.transform3d) {
      components.transform3d = {
        position: [e.transform3d.tx, e.transform3d.ty, e.transform3d.tz],
        rotation: [e.transform3d.rx, e.transform3d.ry, e.transform3d.rz],
        scale: [e.transform3d.sx, e.transform3d.sy, e.transform3d.sz],
      };
    }
    if (e.sprite) {
      components.sprite = {
        tex: e.sprite.tex,
        w: e.sprite.w,
        h: e.sprite.h,
        cols: e.sprite.cols,
        rows: e.sprite.rows,
        fps: e.sprite.fps,
      };
    }
    if (e.mesh3d) components.mesh3d = { mesh: e.mesh3d.meshHandle };
    if (e.camera2d) {
      components.camera2d = {
        x: e.camera2d.x,
        y: e.camera2d.y,
        zoom: e.camera2d.zoom,
        active: e.camera2d.active,
      };
    }
    if (e.camera3d) {
      components.camera3d = { cam: e.camera3d.camHandle, active: e.camera3d.active };
    }
    if (e.rigidbody2d) {
      components.rigidbody2d = {
        vx: e.rigidbody2d.vx,
        vy: e.rigidbody2d.vy,
        ax: e.rigidbody2d.ax,
        ay: e.rigidbody2d.ay,
        gravity: e.rigidbody2d.gravity,
      };
    }
    if (e.collider2d) {
      components.collider2d = {
        type: e.collider2d.kind,
        w: e.collider2d.w,
        h: e.collider2d.h,
        radius: e.collider2d.radius,
        solid: e.collider2d.solid,
      };
    }
    if (e.tilemap) {
      components.tilemap = {
        tile_size: e.tilemap.tileSize,
        cols: e.tilemap.cols,
        rows: e.tilemap.rows,
        tiles: e.tilemap.tiles,
        tileset: e.tilemap.tileset,
      };
    }
    if (e.light3d) {
      components.light3d = {
        type: e.light3d.kind,
        direction: [e.light3d.dx, e.light3d.dy, e.light3d.dz],
        position: [e.light3d.x, e.light3d.y, e.light3d.z],
        color: [e.light3d.r, e.light3d.g, e.light3d.b],
        range: e.light3d.range,
      };
    }
    if (e.script) {
      components.script = { module: e.script.module, handler: e.script.handler };
    }
    entities.push({
      id: e.id,
      name: e.name,
      tag: e.tag || undefined,
      parent: e.parent || undefined,
      components,
    });
  }
  return { version: 1, gravity: world.gravity, entities };
}

/** Helper used by WASM host when creating tagged entities from scene. */
export function spawnTagged(
  name: string,
  tag: string,
  world: World = getWorld()
): number {
  const id = world.nextId++;
  world.entities.set(id, {
    id,
    name,
    tag: "",
    parent: 0,
  });
  entitySetTag(id, tag, world);
  return id;
}

/**
 * Spawn a `.jscene` fragment into the current world without reset.
 * Offsets all transform2d positions by (ox, oy). Returns first new entity id (or 0).
 */
export function prefabSpawn(
  scene: JScene,
  ox: number,
  oy: number,
  options: { resolveAsset?: AssetResolver; world?: World } = {}
): number {
  const world = options.world ?? getWorld();
  const clone = structuredClone(scene) as JScene;
  const idRemap = new Map<number, number>();
  let firstId = 0;

  for (const raw of clone.entities) {
    const oldId = raw.id && raw.id > 0 ? raw.id : 0;
    const id = world.nextId++;
    if (!firstId) firstId = id;
    if (oldId) idRemap.set(oldId, id);
    raw.id = id;
  }

  for (const raw of clone.entities) {
    if (raw.parent && idRemap.has(raw.parent)) {
      raw.parent = idRemap.get(raw.parent);
    } else {
      raw.parent = 0;
    }
    const c = raw.components;
    if (c?.transform2d) {
      c.transform2d.x = (c.transform2d.x ?? 0) + ox;
      c.transform2d.y = (c.transform2d.y ?? 0) + oy;
    }
    const e: EntityRecord = {
      id: raw.id!,
      name: raw.name ?? `Prefab_${raw.id}`,
      tag: "",
      parent: raw.parent ?? 0,
    };
    applyComponents(e, raw.components ?? {}, options.resolveAsset);
    world.entities.set(e.id, e);
    if (raw.tag) entitySetTag(e.id, raw.tag, world);
  }
  return firstId;
}
