/** 2D renderer: camera, sprite batching, sprite sheets, tilemaps. */
import { type World } from "./world.js";
export type BitmapLookup = (handle: number) => ImageBitmap | HTMLImageElement | null;
export type Render2dOptions = {
    getCtx: () => CanvasRenderingContext2D | null;
    getBitmap: BitmapLookup;
    clearColor?: [number, number, number, number];
};
export declare function tilemapLoadFromData(tileSize: number, cols: number, rows: number, tiles: number[], tileset: number): number;
export declare function tilemapGet(id: number): {
    tileSize: number;
    cols: number;
    rows: number;
    tiles: number[];
    tileset: number;
} | null;
export declare function tilemapAttach(entityId: number, tilemapId: number, world?: World): void;
/** Parse a simple JSON tilemap asset: { tile_size, cols, rows, tiles, tileset? }. */
export declare function parseTilemapJson(text: string, defaultTileset?: number): number;
export declare function worldToScreen(wx: number, wy: number, canvasW: number, canvasH: number, world?: World): {
    x: number;
    y: number;
};
export declare function screenToWorld(sx: number, sy: number, canvasW: number, canvasH: number, world?: World): {
    x: number;
    y: number;
};
export declare function renderWorld2d(options: Render2dOptions, world?: World): void;
//# sourceMappingURL=render2d.d.ts.map