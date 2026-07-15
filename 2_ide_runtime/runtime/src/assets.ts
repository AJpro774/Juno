/** Asset loading: asset_load_str, sprite_draw, mesh_load_obj. */

import { readStr } from "./memory.js";
import type { AssetEntry, AssetPack, MemoryRef } from "./types.js";

function mimeForKind(kind: string): string {
  if (kind === "image") return "image/png";
  return "application/octet-stream";
}

export type AssetHandlers = {
  asset_load_str: (ptr: number) => number;
  sprite_draw: (handle: number, x: number, y: number, w: number, h: number) => void;
  mesh_load_obj: (ptr: number) => number;
  preloadAll: () => Promise<void>;
  getBitmap: (handle: number) => ImageBitmap | null;
  getText: (path: string) => string | null;
};

export function createAssetHandlers(options: {
  memoryRef: MemoryRef;
  assetPack?: AssetPack | null;
  assetBaseUrl?: string;
  getCtx2d?: () => CanvasRenderingContext2D | null;
}): AssetHandlers {
  const memoryRef = options.memoryRef;
  const pack = options.assetPack ?? null;
  const assetBaseUrl = options.assetBaseUrl ?? "";
  const getCtx2d = options.getCtx2d ?? (() => null);

  const bitmaps = new Map<number, ImageBitmap>();
  const texts = new Map<string, string>();
  const meshes = new Map<number, { path: string }>();
  let nextMeshId = 1;

  function lookup(path: string): AssetEntry | null {
    if (!pack?.assets) return null;
    return pack.assets[path] ?? null;
  }

  async function ensureBitmap(entry: AssetEntry): Promise<void> {
    if (bitmaps.has(entry.id)) return;
    let url: string;
    if (entry.embed) {
      url = `data:${mimeForKind(entry.kind)};base64,${entry.embed}`;
    } else {
      const base = assetBaseUrl.endsWith("/") ? assetBaseUrl : `${assetBaseUrl}/`;
      url = `${base}${entry.path}`;
    }
    if (typeof fetch === "undefined") return;
    const resp = await fetch(url);
    if (!resp.ok) return;
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);
    bitmaps.set(entry.id, bitmap);
  }

  function decodeText(entry: AssetEntry): string | null {
    if (texts.has(entry.path)) return texts.get(entry.path) ?? null;
    if (!entry.embed) return null;
    try {
      const text = atob(entry.embed);
      texts.set(entry.path, text);
      return text;
    } catch {
      return null;
    }
  }

  return {
    async preloadAll() {
      if (!pack?.assets || typeof fetch === "undefined") return;
      const entries = Object.values(pack.assets);
      await Promise.all(
        entries.map(async (e) => {
          if (e.kind === "image") await ensureBitmap(e);
          else if (
            e.kind === "scene" ||
            e.kind === "tilemap" ||
            e.kind === "gltf" ||
            e.kind === "blob"
          ) {
            decodeText(e);
          }
        })
      );
    },
    asset_load_str(ptr: number) {
      const memory = memoryRef.current;
      if (!memory) return 0;
      const path = readStr(memory, ptr);
      const entry = lookup(path);
      if (!entry) return 0;
      if (entry.kind === "image") {
        ensureBitmap(entry).catch(() => {});
      } else {
        decodeText(entry);
      }
      return entry.id | 0;
    },
    sprite_draw(handle: number, x: number, y: number, w: number, h: number) {
      const ctx = getCtx2d();
      if (!ctx) return;
      const bmp = bitmaps.get(handle | 0);
      if (!bmp) return;
      ctx.drawImage(bmp, x, y, w, h);
    },
    mesh_load_obj(ptr: number) {
      const memory = memoryRef.current;
      if (!memory) return 0;
      const path = readStr(memory, ptr);
      const entry = lookup(path);
      const id = entry?.id ?? nextMeshId++;
      meshes.set(id, { path });
      return id | 0;
    },
    getBitmap(handle: number) {
      return bitmaps.get(handle | 0) ?? null;
    },
    getText(path: string) {
      const cached = texts.get(path);
      if (cached) return cached;
      const entry = lookup(path);
      if (!entry) return null;
      return decodeText(entry);
    },
  };
}

/** Node / headless stubs when no asset pack or canvas is available. */
export function createAssetStubs(): Pick<
  AssetHandlers,
  "asset_load_str" | "sprite_draw" | "mesh_load_obj"
> {
  let nextMeshId = 1;
  return {
    asset_load_str: () => 0,
    sprite_draw: () => {},
    mesh_load_obj: () => nextMeshId++ | 0,
  };
}
