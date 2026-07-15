/** 2D renderer: camera, sprite batching, sprite sheets, tilemaps. */
import { getActiveCamera2D, getWorld } from "./world.js";
const tilemaps = new Map();
let nextTilemapId = 1;
export function tilemapLoadFromData(tileSize, cols, rows, tiles, tileset) {
    const id = nextTilemapId++;
    tilemaps.set(id, { tileSize, cols, rows, tiles: tiles.slice(), tileset });
    return id;
}
export function tilemapGet(id) {
    return tilemaps.get(id | 0) ?? null;
}
export function tilemapAttach(entityId, tilemapId, world = getWorld()) {
    const e = world.entities.get(entityId | 0);
    const tm = tilemaps.get(tilemapId | 0);
    if (!e || !tm)
        return;
    e.tilemap = {
        tileSize: tm.tileSize,
        cols: tm.cols,
        rows: tm.rows,
        tiles: tm.tiles.slice(),
        tileset: tm.tileset,
    };
}
/** Parse a simple JSON tilemap asset: { tile_size, cols, rows, tiles, tileset? }. */
export function parseTilemapJson(text, defaultTileset = 0) {
    const data = JSON.parse(text);
    return tilemapLoadFromData(data.tile_size ?? 32, data.cols ?? 0, data.rows ?? 0, data.tiles ?? [], data.tileset ?? defaultTileset);
}
export function worldToScreen(wx, wy, canvasW, canvasH, world = getWorld()) {
    const cam = getActiveCamera2D(world);
    const zoom = cam?.zoom || 1;
    const cx = cam?.x ?? 0;
    const cy = cam?.y ?? 0;
    return {
        x: (wx - cx) * zoom + canvasW / 2,
        y: (wy - cy) * zoom + canvasH / 2,
    };
}
export function screenToWorld(sx, sy, canvasW, canvasH, world = getWorld()) {
    const cam = getActiveCamera2D(world);
    const zoom = cam?.zoom || 1;
    const cx = cam?.x ?? 0;
    const cy = cam?.y ?? 0;
    return {
        x: (sx - canvasW / 2) / zoom + cx,
        y: (sy - canvasH / 2) / zoom + cy,
    };
}
function drawSprite(ctx, e, getBitmap, canvasW, canvasH, world) {
    const sprite = e.sprite;
    const t = e.transform2d;
    if (!sprite || !t)
        return;
    const bmp = getBitmap(sprite.tex);
    if (!bmp)
        return;
    const screen = worldToScreen(t.x, t.y, canvasW, canvasH, world);
    const cam = getActiveCamera2D(world);
    const zoom = cam?.zoom || 1;
    const dw = sprite.w * t.sx * zoom;
    const dh = sprite.h * t.sy * zoom;
    ctx.save();
    ctx.translate(screen.x, screen.y);
    if (t.rotation)
        ctx.rotate(t.rotation);
    if (sprite.cols > 1 || sprite.rows > 1) {
        const fw = bmp.width / sprite.cols;
        const fh = bmp.height / sprite.rows;
        const col = sprite.frame % sprite.cols;
        const row = Math.floor(sprite.frame / sprite.cols) % sprite.rows;
        ctx.drawImage(bmp, col * fw, row * fh, fw, fh, -dw / 2, -dh / 2, dw, dh);
    }
    else {
        ctx.drawImage(bmp, -dw / 2, -dh / 2, dw, dh);
    }
    ctx.restore();
}
function drawTilemap(ctx, e, getBitmap, canvasW, canvasH, world) {
    const tm = e.tilemap;
    const t = e.transform2d;
    if (!tm || !t)
        return;
    const bmp = getBitmap(tm.tileset);
    const cam = getActiveCamera2D(world);
    const zoom = cam?.zoom || 1;
    const ts = tm.tileSize * zoom;
    for (let row = 0; row < tm.rows; row++) {
        for (let col = 0; col < tm.cols; col++) {
            const idx = row * tm.cols + col;
            const tile = tm.tiles[idx] ?? 0;
            if (tile <= 0)
                continue;
            const wx = t.x + col * tm.tileSize + tm.tileSize / 2;
            const wy = t.y + row * tm.tileSize + tm.tileSize / 2;
            const screen = worldToScreen(wx, wy, canvasW, canvasH, world);
            if (bmp) {
                const tilesPerRow = Math.max(1, Math.floor(bmp.width / tm.tileSize));
                const ti = tile - 1;
                const sx = (ti % tilesPerRow) * tm.tileSize;
                const sy = Math.floor(ti / tilesPerRow) * tm.tileSize;
                ctx.drawImage(bmp, sx, sy, tm.tileSize, tm.tileSize, screen.x - ts / 2, screen.y - ts / 2, ts, ts);
            }
            else {
                ctx.fillStyle = tile === 1 ? "#3d5a40" : "#6b4f3a";
                ctx.fillRect(screen.x - ts / 2, screen.y - ts / 2, ts, ts);
            }
        }
    }
}
export function renderWorld2d(options, world = getWorld()) {
    const ctx = options.getCtx();
    if (!ctx)
        return;
    const canvas = ctx.canvas;
    const [r, g, b, a] = options.clearColor ?? [0.08, 0.09, 0.12, 1];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const list = [...world.entities.values()].sort((a, b) => {
        const za = a.transform2d?.zIndex ?? 0;
        const zb = b.transform2d?.zIndex ?? 0;
        return za - zb;
    });
    for (const e of list) {
        if (e.tilemap)
            drawTilemap(ctx, e, options.getBitmap, canvas.width, canvas.height, world);
        if (e.sprite)
            drawSprite(ctx, e, options.getBitmap, canvas.width, canvas.height, world);
    }
}
//# sourceMappingURL=render2d.js.map