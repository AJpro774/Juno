/** Load / serialize `.jscene` JSON into the ECS world. */
import { type AnimClip, type World } from "./world.js";
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
    sprite?: {
        asset?: string;
        tex?: number;
        w?: number;
        h?: number;
        cols?: number;
        rows?: number;
        fps?: number;
    };
    mesh3d?: {
        mesh?: number;
        /** Authoring: box primitive when mesh handle is unset. */
        primitive?: string;
        size?: [number, number, number];
        /** Authoring: load glTF asset path (relative to assets/). */
        gltf?: string;
        color?: [number, number, number, number];
    };
    camera2d?: {
        x?: number;
        y?: number;
        zoom?: number;
        active?: boolean;
        follow_target?: number;
        smooth?: number;
    };
    camera3d?: {
        cam?: number;
        active?: boolean;
        fov?: number;
        aspect?: number;
        near?: number;
        far?: number;
        orbit_yaw?: number;
        orbit_pitch?: number;
        orbit_distance?: number;
        target?: [number, number, number];
    };
    rigidbody2d?: {
        vx?: number;
        vy?: number;
        ax?: number;
        ay?: number;
        gravity?: number;
    };
    collider2d?: {
        type?: string;
        w?: number;
        h?: number;
        radius?: number;
        solid?: boolean;
        slope?: number;
    };
    rigidbody3d?: {
        vx?: number;
        vy?: number;
        vz?: number;
        gravity?: number;
    };
    collider3d?: {
        type?: string;
        kind?: string;
        w?: number;
        h?: number;
        d?: number;
        solid?: boolean;
    };
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
    script?: {
        module?: string;
        handler?: string;
    };
    /** Prefab spawn authoring: path + optional offset from entity transform. */
    prefab?: {
        path?: string;
        offset?: [number, number];
        x?: number;
        y?: number;
    };
    /** Sprite / keyframe animation clips (not skeletal). */
    sprite_animator?: {
        default?: string;
        autoplay?: boolean;
        playing?: string;
        clips?: Array<{
            name?: string;
            fps?: number;
            loop?: boolean;
            frames?: number[];
            keys?: Array<{
                t?: number;
                frame?: number;
                x?: number;
                y?: number;
                rotation?: number;
                tx?: number;
                ty?: number;
                tz?: number;
                rx?: number;
                ry?: number;
                rz?: number;
            }>;
            asset?: string;
        }>;
    };
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
/** Optional text asset loader (clip JSON under assets/). */
export type TextAssetLoader = (path: string) => string | null;
/** Parse a clip JSON asset (`assets/anims/*.json`). */
export declare function parseAnimClipJson(text: string, fallbackName?: string): AnimClip | null;
export declare function emptyScene(): JScene;
export declare function parseScene(json: string | JScene): JScene;
export declare function loadSceneIntoWorld(scene: JScene, options?: {
    world?: World;
    resolveAsset?: AssetResolver;
    getAssetText?: TextAssetLoader;
    reset?: boolean;
}): World;
export declare function serializeWorld(world?: World): JScene;
/** Helper used by WASM host when creating tagged entities from scene. */
export declare function spawnTagged(name: string, tag: string, world?: World): number;
/**
 * Spawn a `.jscene` fragment into the current world without reset.
 * Offsets all transform2d positions by (ox, oy). Returns first new entity id (or 0).
 */
export declare function prefabSpawn(scene: JScene, ox: number, oy: number, options?: {
    resolveAsset?: AssetResolver;
    getAssetText?: TextAssetLoader;
    world?: World;
}): number;
/** Create GPU mesh / camera / light handles from authored `.jscene` 3D components. */
export type Scene3dMaterializeHooks = {
    meshBox: (sx: number, sy: number, sz: number) => number;
    cameraPerspective: (fov: number, aspect: number, near: number, far: number) => number;
    cameraOrbit?: (cam: number, tx: number, ty: number, tz: number, yaw: number, pitch: number, dist: number) => void;
    lightDirectional: (dx: number, dy: number, dz: number, r: number, g: number, b: number) => number;
    lightPoint: (x: number, y: number, z: number, r: number, g: number, b: number, range: number) => number;
    materialColor?: (r: number, g: number, b: number, a: number) => number;
    meshSetMaterial?: (mesh: number, mat: number) => void;
    loadGltf?: (path: string) => number;
    syncMeshPose?: (mesh: number, tx: number, ty: number, tz: number, rx: number, ry: number, rz: number) => void;
};
/** Returns the active camera3d handle (or 0). */
export declare function materializeScene3d(scene: JScene, hooks: Scene3dMaterializeHooks, world?: World): number;
/** True when a `.jscene` has any 3D components worth WebGPU play. */
export declare function sceneHas3d(scene: JScene): boolean;
//# sourceMappingURL=scene-loader.d.ts.map