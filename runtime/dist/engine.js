/** Engine ECS host imports for WASM env. */
import { readStr } from "./memory.js";
import { camera2dFollow, camera2dSet, collider2dSet, createWorld, entityCreate, entityDestroy, entityFindByTag, entitySetTag, getWorld, mesh3dAttach, resetWorld, rigidbody2dGetGrounded, rigidbody2dSetVel, spriteSet, transform2dSet, transform3dSet, worldStep, } from "./world.js";
import { loadSceneIntoWorld, materializeScene3d, parseScene, prefabSpawn, } from "./scene-loader.js";
import { parseTilemapJson, renderWorld2d, tilemapAttach, tilemapGet } from "./render2d.js";
import { collisionCount, collisionEntityA, collisionEntityB, ensurePhysicsInstalled, } from "./physics.js";
import { parseGltfJson, parseGltfOrGlb, isGlbBytes } from "./gltf.js";
const scenes = new Map();
let nextSceneHandle = 1;
export function createEngineImports(options) {
    const memoryRef = options.memoryRef;
    ensurePhysicsInstalled();
    function resolveAsset(path) {
        const entry = options.assetPack?.assets?.[path];
        return entry?.id ?? 0;
    }
    function loadSceneText(path) {
        let text = options.getAssetText?.(path) ?? null;
        if (!text) {
            const entry = options.assetPack?.assets?.[path];
            if (entry?.embed) {
                try {
                    text = atob(entry.embed);
                }
                catch {
                    text = null;
                }
            }
        }
        return text;
    }
    function decodeEmbedBytes(embed) {
        try {
            const bin = atob(embed);
            const out = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++)
                out[i] = bin.charCodeAt(i);
            return out.buffer;
        }
        catch {
            return null;
        }
    }
    function loadSceneBytes(path) {
        const fromHook = options.getAssetBytes?.(path) ?? null;
        if (fromHook)
            return fromHook;
        const entry = options.assetPack?.assets?.[path];
        if (entry?.embed)
            return decodeEmbedBytes(entry.embed);
        return null;
    }
    function loadMeshFromPath(path) {
        const lower = path.toLowerCase();
        if (lower.endsWith(".glb")) {
            const bytes = loadSceneBytes(path) ??
                loadSceneBytes(`assets/${path}`);
            if (!bytes)
                return null;
            return parseGlbWithResolver(bytes);
        }
        // Prefer binary when the pack embed is already GLB bytes.
        const bytes = loadSceneBytes(path) ?? loadSceneBytes(`assets/${path}`);
        if (bytes && isGlbBytes(bytes)) {
            return parseGlbWithResolver(bytes);
        }
        const text = loadSceneText(path) ?? loadSceneText(`assets/${path}`);
        if (!text)
            return null;
        return parseGltfJson(text, {
            getBufferBytes: (uri) => {
                const entry = options.assetPack?.assets?.[uri];
                if (entry?.embed)
                    return decodeEmbedBytes(entry.embed);
                const embedded = loadSceneBytes(uri);
                if (embedded)
                    return embedded;
                const bin = loadSceneText(uri) ?? loadSceneText(`assets/${uri}`);
                if (!bin)
                    return null;
                if (bin.startsWith("data:")) {
                    const idx = bin.indexOf("base64,");
                    if (idx < 0)
                        return null;
                    return decodeEmbedBytes(bin.slice(idx + 7));
                }
                return null;
            },
        });
    }
    function parseGlbWithResolver(bytes) {
        return parseGltfOrGlb(bytes, {
            getBufferBytes: (uri) => {
                const entry = options.assetPack?.assets?.[uri];
                if (entry?.embed)
                    return decodeEmbedBytes(entry.embed);
                return loadSceneBytes(uri) ?? loadSceneBytes(`assets/${uri}`);
            },
        });
    }
    function materializeHooks() {
        if (!options.meshBox || !options.cameraPerspective)
            return null;
        if (!options.lightDirectional || !options.lightPoint)
            return null;
        return {
            meshBox: options.meshBox,
            cameraPerspective: options.cameraPerspective,
            cameraOrbit: options.cameraOrbit,
            lightDirectional: options.lightDirectional,
            lightPoint: options.lightPoint,
            materialColor: options.materialColor,
            meshSetMaterial: options.meshSetMaterial,
            loadGltf: (path) => {
                if (!options.createCustomMesh)
                    return 0;
                const data = loadMeshFromPath(path);
                if (!data)
                    return 0;
                return options.createCustomMesh(data.positions, data.indices);
            },
            syncMeshPose: options.syncMeshPose,
        };
    }
    let playScene = null;
    if (options.initialScene) {
        playScene =
            typeof options.initialScene === "string"
                ? parseScene(options.initialScene)
                : options.initialScene;
    }
    function applyScene(scene, reset) {
        loadSceneIntoWorld(scene, { resolveAsset, reset });
        const hooks = materializeHooks();
        if (hooks)
            materializeScene3d(scene, hooks);
    }
    if (playScene) {
        applyScene(playScene, true);
    }
    return {
        world_create() {
            createWorld();
            if (playScene) {
                applyScene(playScene, true);
            }
            return 1;
        },
        entity_create() {
            return entityCreate();
        },
        entity_destroy(id) {
            entityDestroy(id);
        },
        entity_set_tag(id, tagPtr) {
            const memory = memoryRef.current;
            if (!memory)
                return;
            entitySetTag(id, readStr(memory, tagPtr));
        },
        entity_find_by_tag(tagPtr) {
            const memory = memoryRef.current;
            if (!memory)
                return 0;
            return entityFindByTag(readStr(memory, tagPtr));
        },
        transform2d_set(id, x, y, rot, sx, sy) {
            transform2dSet(id, x, y, rot, sx, sy);
        },
        transform3d_set(id, tx, ty, tz, rx, ry, rz, sx, sy, sz) {
            transform3dSet(id, tx, ty, tz, rx, ry, rz, sx, sy, sz);
            const e = getWorld().entities.get(id | 0);
            if (e?.mesh3d && options.syncMeshPose) {
                options.syncMeshPose(e.mesh3d.meshHandle, tx, ty, tz, rx, ry, rz);
            }
        },
        sprite_set(id, tex, w, h) {
            spriteSet(id, tex, w, h);
        },
        mesh3d_attach(id, mesh) {
            mesh3dAttach(id, mesh);
        },
        world_step(dt) {
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
        scene_load(pathPtr) {
            const memory = memoryRef.current;
            if (!memory)
                return 0;
            const path = readStr(memory, pathPtr);
            const text = loadSceneText(path);
            if (!text)
                return 0;
            try {
                const scene = parseScene(text);
                applyScene(scene, true);
                const handle = nextSceneHandle++;
                scenes.set(handle, scene);
                return handle;
            }
            catch {
                return 0;
            }
        },
        camera2d_set(id, x, y, zoom) {
            camera2dSet(id, x, y, zoom);
        },
        tilemap_load(pathPtr) {
            const memory = memoryRef.current;
            if (!memory)
                return 0;
            const path = readStr(memory, pathPtr);
            const text = loadSceneText(path);
            if (!text)
                return 0;
            try {
                return parseTilemapJson(text);
            }
            catch {
                return 0;
            }
        },
        tilemap_attach(entityId, tilemapId) {
            tilemapAttach(entityId, tilemapId);
            tilemapGet(tilemapId);
        },
        world_draw(_camEntity) {
            if (!options.getCtx2d || !options.getBitmap)
                return;
            renderWorld2d({
                getCtx: options.getCtx2d,
                getBitmap: options.getBitmap,
            });
        },
        material3d_texture(assetHandle) {
            return options.materialTexture?.(assetHandle) ?? 0;
        },
        light3d_directional(dx, dy, dz, r, g, b) {
            return options.lightDirectional?.(dx, dy, dz, r, g, b) ?? 0;
        },
        light3d_point(x, y, z, r, g, b, range) {
            return options.lightPoint?.(x, y, z, r, g, b, range) ?? 0;
        },
        mesh_load_gltf(pathPtr) {
            const memory = memoryRef.current;
            if (!memory)
                return 0;
            const path = readStr(memory, pathPtr);
            if (!options.createCustomMesh)
                return 0;
            const mesh = loadMeshFromPath(path);
            if (!mesh)
                return 0;
            return options.createCustomMesh(mesh.positions, mesh.indices);
        },
        collision_count() {
            return collisionCount();
        },
        collision_entity_a(i) {
            return collisionEntityA(i);
        },
        collision_entity_b(i) {
            return collisionEntityB(i);
        },
        rigidbody2d_set_vel(id, vx, vy) {
            rigidbody2dSetVel(id, vx, vy);
        },
        rigidbody2d_get_grounded(id) {
            return rigidbody2dGetGrounded(id);
        },
        collider2d_set(id, kind, w, h, radius, solid) {
            collider2dSet(id, kind, w, h, radius, solid);
        },
        camera2d_follow(cam, target, smooth) {
            camera2dFollow(cam, target, smooth);
        },
        prefab_spawn(pathPtr, x, y) {
            const memory = memoryRef.current;
            if (!memory)
                return 0;
            const path = readStr(memory, pathPtr);
            const text = loadSceneText(path);
            if (!text)
                return 0;
            try {
                return prefabSpawn(parseScene(text), x, y, { resolveAsset });
            }
            catch {
                return 0;
            }
        },
        world_draw3d(cam) {
            const world = getWorld();
            options.scene3dClear?.(0.04, 0.05, 0.08, 1);
            for (const e of world.entities.values()) {
                if (!e.mesh3d)
                    continue;
                if (e.transform3d && options.syncMeshPose) {
                    const t = e.transform3d;
                    options.syncMeshPose(e.mesh3d.meshHandle, t.tx, t.ty, t.tz, t.rx, t.ry, t.rz);
                }
                options.scene3dDraw?.(e.mesh3d.meshHandle, cam | 0);
            }
        },
        scene3d_set_ambient(r, g, b) {
            options.scene3dSetAmbient?.(r, g, b);
        },
        scene3d_set_fog(density) {
            options.scene3dSetFog?.(density);
        },
    };
}
export function createEngineStubs() {
    return {
        world_create: () => 1,
        entity_create: () => 1,
        entity_destroy: (_id) => { },
        entity_set_tag: (_id, _tag) => { },
        entity_find_by_tag: (_tag) => 0,
        transform2d_set: () => { },
        transform3d_set: () => { },
        sprite_set: () => { },
        mesh3d_attach: () => { },
        world_step: () => { },
        scene_load: () => 0,
        camera2d_set: () => { },
        tilemap_load: () => 0,
        tilemap_attach: () => { },
        world_draw: () => { },
        material3d_texture: () => 0,
        light3d_directional: () => 0,
        light3d_point: () => 0,
        mesh_load_gltf: () => 0,
        collision_count: () => 0,
        collision_entity_a: () => 0,
        collision_entity_b: () => 0,
        rigidbody2d_set_vel: () => { },
        rigidbody2d_get_grounded: () => 0,
        collider2d_set: () => { },
        camera2d_follow: () => { },
        prefab_spawn: () => 0,
        world_draw3d: () => { },
        scene3d_set_ambient: () => { },
        scene3d_set_fog: () => { },
    };
}
export { resetWorld, getWorld };
//# sourceMappingURL=engine.js.map