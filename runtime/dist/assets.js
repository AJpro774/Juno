/** Asset loading: asset_load_str, sprite_draw, mesh_load_obj. */
import { readStr } from "./memory.js";
function mimeForKind(kind) {
    if (kind === "image")
        return "image/png";
    return "application/octet-stream";
}
export function createAssetHandlers(options) {
    const memoryRef = options.memoryRef;
    const pack = options.assetPack ?? null;
    const assetBaseUrl = options.assetBaseUrl ?? "";
    const getCtx2d = options.getCtx2d ?? (() => null);
    const bitmaps = new Map();
    const meshes = new Map();
    let nextMeshId = 1;
    function lookup(path) {
        if (!pack?.assets)
            return null;
        return pack.assets[path] ?? null;
    }
    async function ensureBitmap(entry) {
        if (bitmaps.has(entry.id))
            return;
        let url;
        if (entry.embed) {
            url = `data:${mimeForKind(entry.kind)};base64,${entry.embed}`;
        }
        else {
            const base = assetBaseUrl.endsWith("/") ? assetBaseUrl : `${assetBaseUrl}/`;
            url = `${base}${entry.path}`;
        }
        if (typeof fetch === "undefined")
            return;
        const resp = await fetch(url);
        if (!resp.ok)
            return;
        const blob = await resp.blob();
        const bitmap = await createImageBitmap(blob);
        bitmaps.set(entry.id, bitmap);
    }
    return {
        async preloadAll() {
            if (!pack?.assets || typeof fetch === "undefined")
                return;
            const entries = Object.values(pack.assets).filter((e) => e.kind === "image");
            await Promise.all(entries.map((e) => ensureBitmap(e)));
        },
        asset_load_str(ptr) {
            const memory = memoryRef.current;
            if (!memory)
                return 0;
            const path = readStr(memory, ptr);
            const entry = lookup(path);
            if (!entry)
                return 0;
            if (entry.kind === "image") {
                ensureBitmap(entry).catch(() => { });
            }
            return entry.id | 0;
        },
        sprite_draw(handle, x, y, w, h) {
            const ctx = getCtx2d();
            if (!ctx)
                return;
            const bmp = bitmaps.get(handle | 0);
            if (!bmp)
                return;
            ctx.drawImage(bmp, x, y, w, h);
        },
        mesh_load_obj(ptr) {
            const memory = memoryRef.current;
            if (!memory)
                return 0;
            const path = readStr(memory, ptr);
            const entry = lookup(path);
            const id = entry?.id ?? nextMeshId++;
            meshes.set(id, { path });
            return id | 0;
        },
    };
}
/** Node / headless stubs when no asset pack or canvas is available. */
export function createAssetStubs() {
    let nextMeshId = 1;
    return {
        asset_load_str: () => 0,
        sprite_draw: () => { },
        mesh_load_obj: () => nextMeshId++ | 0,
    };
}
//# sourceMappingURL=assets.js.map