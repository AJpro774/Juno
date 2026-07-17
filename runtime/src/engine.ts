/** Engine ECS host imports for WASM env. */

import { readStr } from "./memory.js";
import type { MemoryRef, AssetPack } from "./types.js";
import {
  camera2dFollow,
  camera2dSet,
  collider2dSet,
  createWorld,
  entityCreate,
  entityDestroy,
  entityFindByTag,
  entitySetTag,
  getWorld,
  mesh3dAttach,
  resetWorld,
  rigidbody2dGetGrounded,
  rigidbody2dSetVel,
  spriteSet,
  transform2dSet,
  transform3dSet,
  worldStep,
  type World,
} from "./world.js";
import {
  loadSceneIntoWorld,
  materializeScene3d,
  parseScene,
  prefabSpawn,
  type JScene,
  type Scene3dMaterializeHooks,
} from "./scene-loader.js";
import { parseTilemapJson, renderWorld2d, tilemapAttach, tilemapGet } from "./render2d.js";
import {
  collisionCount,
  collisionEntityA,
  collisionEntityB,
  ensurePhysicsInstalled,
} from "./physics.js";
import { parseGltfJson } from "./gltf.js";

export type EngineHostOptions = {
  memoryRef: MemoryRef;
  assetPack?: AssetPack | null;
  getCtx2d?: () => CanvasRenderingContext2D | null;
  getBitmap?: (handle: number) => ImageBitmap | HTMLImageElement | null;
  getAssetText?: (path: string) => string | null;
  createCustomMesh?: (positions: Float32Array, indices: Uint16Array) => number;
  syncMeshPose?: (
    meshHandle: number,
    tx: number,
    ty: number,
    tz: number,
    rx: number,
    ry: number,
    rz: number
  ) => void;
  meshBox?: (sx: number, sy: number, sz: number) => number;
  cameraPerspective?: (fov: number, aspect: number, near: number, far: number) => number;
  cameraOrbit?: (
    cam: number,
    tx: number,
    ty: number,
    tz: number,
    yaw: number,
    pitch: number,
    dist: number
  ) => void;
  materialColor?: (r: number, g: number, b: number, a: number) => number;
  meshSetMaterial?: (mesh: number, mat: number) => void;
  materialTexture?: (assetHandle: number) => number;
  lightDirectional?: (
    dx: number,
    dy: number,
    dz: number,
    r: number,
    g: number,
    b: number
  ) => number;
  lightPoint?: (
    x: number,
    y: number,
    z: number,
    r: number,
    g: number,
    b: number,
    range: number
  ) => number;
  scene3dClear?: (r: number, g: number, b: number, a: number) => void;
  scene3dDraw?: (mesh: number, cam: number) => void;
  scene3dSetAmbient?: (r: number, g: number, b: number) => void;
  scene3dSetFog?: (density: number) => void;
  /** When set, loaded before `main` and re-applied after `world_create`. */
  initialScene?: JScene | string | null;
};

const scenes = new Map<number, JScene>();
let nextSceneHandle = 1;

export function createEngineImports(options: EngineHostOptions) {
  const memoryRef = options.memoryRef;
  ensurePhysicsInstalled();

  function resolveAsset(path: string): number {
    const entry = options.assetPack?.assets?.[path];
    return entry?.id ?? 0;
  }

  function loadSceneText(path: string): string | null {
    let text = options.getAssetText?.(path) ?? null;
    if (!text) {
      const entry = options.assetPack?.assets?.[path];
      if (entry?.embed) {
        try {
          text = atob(entry.embed);
        } catch {
          text = null;
        }
      }
    }
    return text;
  }

  function materializeHooks(): Scene3dMaterializeHooks | null {
    if (!options.meshBox || !options.cameraPerspective) return null;
    if (!options.lightDirectional || !options.lightPoint) return null;
    return {
      meshBox: options.meshBox,
      cameraPerspective: options.cameraPerspective,
      cameraOrbit: options.cameraOrbit,
      lightDirectional: options.lightDirectional,
      lightPoint: options.lightPoint,
      materialColor: options.materialColor,
      meshSetMaterial: options.meshSetMaterial,
      loadGltf: (path: string) => {
        const text = loadSceneText(path) ?? loadSceneText(`assets/${path}`);
        if (!text || !options.createCustomMesh) return 0;
        const data = parseGltfJson(text, {
          getBufferBytes: (uri) => {
            const bin = loadSceneText(uri) ?? loadSceneText(`assets/${uri}`);
            if (!bin) return null;
            if (bin.startsWith("data:")) {
              const idx = bin.indexOf("base64,");
              if (idx < 0) return null;
              const raw = atob(bin.slice(idx + 7));
              const out = new Uint8Array(raw.length);
              for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
              return out.buffer;
            }
            return null;
          },
        });
        if (!data) return 0;
        return options.createCustomMesh!(data.positions, data.indices);
      },
      syncMeshPose: options.syncMeshPose,
    };
  }

  let playScene: JScene | null = null;
  if (options.initialScene) {
    playScene =
      typeof options.initialScene === "string"
        ? parseScene(options.initialScene)
        : options.initialScene;
  }

  function applyScene(scene: JScene, reset: boolean): void {
    loadSceneIntoWorld(scene, { resolveAsset, reset });
    const hooks = materializeHooks();
    if (hooks) materializeScene3d(scene, hooks);
  }

  if (playScene) {
    applyScene(playScene, true);
  }

  return {
    world_create(): number {
      createWorld();
      if (playScene) {
        applyScene(playScene, true);
      }
      return 1;
    },
    entity_create(): number {
      return entityCreate();
    },
    entity_destroy(id: number): void {
      entityDestroy(id);
    },
    entity_set_tag(id: number, tagPtr: number): void {
      const memory = memoryRef.current;
      if (!memory) return;
      entitySetTag(id, readStr(memory, tagPtr));
    },
    entity_find_by_tag(tagPtr: number): number {
      const memory = memoryRef.current;
      if (!memory) return 0;
      return entityFindByTag(readStr(memory, tagPtr));
    },
    transform2d_set(id: number, x: number, y: number, rot: number, sx: number, sy: number): void {
      transform2dSet(id, x, y, rot, sx, sy);
    },
    transform3d_set(
      id: number,
      tx: number,
      ty: number,
      tz: number,
      rx: number,
      ry: number,
      rz: number,
      sx: number,
      sy: number,
      sz: number
    ): void {
      transform3dSet(id, tx, ty, tz, rx, ry, rz, sx, sy, sz);
      const e = getWorld().entities.get(id | 0);
      if (e?.mesh3d && options.syncMeshPose) {
        options.syncMeshPose(e.mesh3d.meshHandle, tx, ty, tz, rx, ry, rz);
      }
    },
    sprite_set(id: number, tex: number, w: number, h: number): void {
      spriteSet(id, tex, w, h);
    },
    mesh3d_attach(id: number, mesh: number): void {
      mesh3dAttach(id, mesh);
    },
    world_step(dt: number): void {
      worldStep(dt);
      const world = getWorld();
      if (options.syncMeshPose) {
        for (const e of world.entities.values()) {
          if (e.mesh3d && e.transform3d) {
            const t = e.transform3d;
            options.syncMeshPose(e.mesh3d.meshHandle, t.tx, t.ty, t.tz, t.rx, t.ry, t.rz);
          }
        }
      }
    },
    scene_load(pathPtr: number): number {
      const memory = memoryRef.current;
      if (!memory) return 0;
      const path = readStr(memory, pathPtr);
      const text = loadSceneText(path);
      if (!text) return 0;
      try {
        const scene = parseScene(text);
        applyScene(scene, true);
        const handle = nextSceneHandle++;
        scenes.set(handle, scene);
        return handle;
      } catch {
        return 0;
      }
    },
    camera2d_set(id: number, x: number, y: number, zoom: number): void {
      camera2dSet(id, x, y, zoom);
    },
    tilemap_load(pathPtr: number): number {
      const memory = memoryRef.current;
      if (!memory) return 0;
      const path = readStr(memory, pathPtr);
      const text = loadSceneText(path);
      if (!text) return 0;
      try {
        return parseTilemapJson(text);
      } catch {
        return 0;
      }
    },
    tilemap_attach(entityId: number, tilemapId: number): void {
      tilemapAttach(entityId, tilemapId);
      tilemapGet(tilemapId);
    },
    world_draw(_camEntity: number): void {
      if (!options.getCtx2d || !options.getBitmap) return;
      renderWorld2d({
        getCtx: options.getCtx2d,
        getBitmap: options.getBitmap,
      });
    },
    material3d_texture(assetHandle: number): number {
      return options.materialTexture?.(assetHandle) ?? 0;
    },
    light3d_directional(
      dx: number,
      dy: number,
      dz: number,
      r: number,
      g: number,
      b: number
    ): number {
      return options.lightDirectional?.(dx, dy, dz, r, g, b) ?? 0;
    },
    light3d_point(
      x: number,
      y: number,
      z: number,
      r: number,
      g: number,
      b: number,
      range: number
    ): number {
      return options.lightPoint?.(x, y, z, r, g, b, range) ?? 0;
    },
    mesh_load_gltf(pathPtr: number): number {
      const memory = memoryRef.current;
      if (!memory) return 0;
      const path = readStr(memory, pathPtr);
      const text = loadSceneText(path);
      if (!text || !options.createCustomMesh) return 0;
      const mesh = parseGltfJson(text, {
        getBufferBytes: (uri: string) => {
          const entry = options.assetPack?.assets?.[uri];
          if (entry?.embed) {
            try {
              const bin = atob(entry.embed);
              const out = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
              return out.buffer;
            } catch {
              return null;
            }
          }
          return null;
        },
      });
      if (!mesh) return 0;
      return options.createCustomMesh(mesh.positions, mesh.indices);
    },
    collision_count(): number {
      return collisionCount();
    },
    collision_entity_a(i: number): number {
      return collisionEntityA(i);
    },
    collision_entity_b(i: number): number {
      return collisionEntityB(i);
    },
    rigidbody2d_set_vel(id: number, vx: number, vy: number): void {
      rigidbody2dSetVel(id, vx, vy);
    },
    rigidbody2d_get_grounded(id: number): number {
      return rigidbody2dGetGrounded(id);
    },
    collider2d_set(
      id: number,
      kind: number,
      w: number,
      h: number,
      radius: number,
      solid: number
    ): void {
      collider2dSet(id, kind, w, h, radius, solid);
    },
    camera2d_follow(cam: number, target: number, smooth: number): void {
      camera2dFollow(cam, target, smooth);
    },
    prefab_spawn(pathPtr: number, x: number, y: number): number {
      const memory = memoryRef.current;
      if (!memory) return 0;
      const path = readStr(memory, pathPtr);
      const text = loadSceneText(path);
      if (!text) return 0;
      try {
        return prefabSpawn(parseScene(text), x, y, { resolveAsset });
      } catch {
        return 0;
      }
    },
    world_draw3d(cam: number): void {
      const world = getWorld();
      options.scene3dClear?.(0.04, 0.05, 0.08, 1);
      for (const e of world.entities.values()) {
        if (!e.mesh3d) continue;
        if (e.transform3d && options.syncMeshPose) {
          const t = e.transform3d;
          options.syncMeshPose(e.mesh3d.meshHandle, t.tx, t.ty, t.tz, t.rx, t.ry, t.rz);
        }
        options.scene3dDraw?.(e.mesh3d.meshHandle, cam | 0);
      }
    },
    scene3d_set_ambient(r: number, g: number, b: number): void {
      options.scene3dSetAmbient?.(r, g, b);
    },
    scene3d_set_fog(density: number): void {
      options.scene3dSetFog?.(density);
    },
  };
}

export function createEngineStubs() {
  return {
    world_create: () => 1,
    entity_create: () => 1,
    entity_destroy: (_id: number) => {},
    entity_set_tag: (_id: number, _tag: number) => {},
    entity_find_by_tag: (_tag: number) => 0,
    transform2d_set: () => {},
    transform3d_set: () => {},
    sprite_set: () => {},
    mesh3d_attach: () => {},
    world_step: () => {},
    scene_load: () => 0,
    camera2d_set: () => {},
    tilemap_load: () => 0,
    tilemap_attach: () => {},
    world_draw: () => {},
    material3d_texture: () => 0,
    light3d_directional: () => 0,
    light3d_point: () => 0,
    mesh_load_gltf: () => 0,
    collision_count: () => 0,
    collision_entity_a: () => 0,
    collision_entity_b: () => 0,
    rigidbody2d_set_vel: () => {},
    rigidbody2d_get_grounded: () => 0,
    collider2d_set: () => {},
    camera2d_follow: () => {},
    prefab_spawn: () => 0,
    world_draw3d: () => {},
    scene3d_set_ambient: () => {},
    scene3d_set_fog: () => {},
  };
}

export { resetWorld, getWorld };
export type { World };
