/** Load / serialize `.jscene` JSON into the ECS world. */
import { type World } from "./world.js";
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
    };
    camera2d?: {
        x?: number;
        y?: number;
        zoom?: number;
        active?: boolean;
    };
    camera3d?: {
        cam?: number;
        active?: boolean;
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
export declare function emptyScene(): JScene;
export declare function parseScene(json: string | JScene): JScene;
export declare function loadSceneIntoWorld(scene: JScene, options?: {
    world?: World;
    resolveAsset?: AssetResolver;
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
    world?: World;
}): number;
//# sourceMappingURL=scene-loader.d.ts.map