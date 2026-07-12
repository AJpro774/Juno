/** Asset loading: asset_load_str, sprite_draw, mesh_load_obj. */
import type { AssetPack, MemoryRef } from "./types.js";
export type AssetHandlers = {
    asset_load_str: (ptr: number) => number;
    sprite_draw: (handle: number, x: number, y: number, w: number, h: number) => void;
    mesh_load_obj: (ptr: number) => number;
    preloadAll: () => Promise<void>;
};
export declare function createAssetHandlers(options: {
    memoryRef: MemoryRef;
    assetPack?: AssetPack | null;
    assetBaseUrl?: string;
    getCtx2d?: () => CanvasRenderingContext2D | null;
}): AssetHandlers;
/** Node / headless stubs when no asset pack or canvas is available. */
export declare function createAssetStubs(): Pick<AssetHandlers, "asset_load_str" | "sprite_draw" | "mesh_load_obj">;
//# sourceMappingURL=assets.d.ts.map