/** Edit-mode scene viewport: draw entities, drag sprites, paint tilemaps. */

import type { SceneStore } from "./scene-store.js";
import type { AssetPack } from "../../../runtime/src/types.js";
import { getEditorMode } from "./mode.js";
import { sceneHas3d } from "../../../runtime/src/scene-loader.js";

export type SceneViewHandle = {
  redraw: () => void;
  dispose: () => void;
};

function entitySize(entity: {
  components?: {
    sprite?: { w?: number; h?: number };
    tilemap?: { tile_size?: number; cols?: number; rows?: number };
  };
}): { w: number; h: number } {
  const tm = entity.components?.tilemap;
  if (tm && (tm.cols ?? 0) > 0 && (tm.rows ?? 0) > 0) {
    const ts = tm.tile_size ?? 32;
    return { w: (tm.cols ?? 0) * ts, h: (tm.rows ?? 0) * ts };
  }
  return {
    w: entity.components?.sprite?.w ?? 24,
    h: entity.components?.sprite?.h ?? 24,
  };
}

/** Tilemap origin is top-left of the grid (transform is top-left, matching runtime). */
function tileCellAt(
  entity: {
    components?: {
      transform2d?: { x?: number; y?: number };
      tilemap?: { tile_size?: number; cols?: number; rows?: number };
    };
  },
  wx: number,
  wy: number
): { col: number; row: number } | null {
  const tm = entity.components?.tilemap;
  const t = entity.components?.transform2d;
  if (!tm || !t) return null;
  const cols = tm.cols ?? 0;
  const rows = tm.rows ?? 0;
  const ts = tm.tile_size ?? 32;
  if (cols <= 0 || rows <= 0 || ts <= 0) return null;
  const ox = t.x ?? 0;
  const oy = t.y ?? 0;
  const col = Math.floor((wx - ox) / ts);
  const row = Math.floor((wy - oy) / ts);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  return { col, row };
}

export function attachSceneView(
  canvas: HTMLCanvasElement,
  store: SceneStore,
  getAssetPack: () => AssetPack | null
): SceneViewHandle {
  const ctx = canvas.getContext("2d");
  let dragging: { id: number; ox: number; oy: number } | null = null;
  let painting: { id: number; erase: boolean } | null = null;
  const bitmaps = new Map<string, HTMLImageElement>();

  function ensureImage(path: string, embed?: string): HTMLImageElement | null {
    if (bitmaps.has(path)) return bitmaps.get(path) ?? null;
    const img = new Image();
    if (embed) img.src = `data:image/png;base64,${embed}`;
    else img.src = path;
    bitmaps.set(path, img);
    img.onload = () => redraw();
    return img;
  }

  function drawTilemapEdit(
    entity: {
      id?: number;
      components?: {
        transform2d?: { x?: number; y?: number };
        tilemap?: {
          tile_size?: number;
          cols?: number;
          rows?: number;
          tiles?: number[];
          tileset?: number;
        };
      };
    },
    selected: boolean
  ): void {
    if (!ctx) return;
    const tm = entity.components?.tilemap;
    const t = entity.components?.transform2d;
    if (!tm || !t) return;
    const cols = tm.cols ?? 0;
    const rows = tm.rows ?? 0;
    const ts = tm.tile_size ?? 32;
    if (cols <= 0 || rows <= 0) return;
    const ox = (t.x ?? 0) + canvas.width / 2;
    const oy = (t.y ?? 0) + canvas.height / 2;
    const tiles = Array.isArray(tm.tiles) ? tm.tiles : [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tile = tiles[row * cols + col] ?? 0;
        const x = ox + col * ts;
        const y = oy + row * ts;
        if (tile > 0) {
          ctx.fillStyle = tile === 1 ? "#3d5a40" : tile === 2 ? "#6b4f3a" : "#4a6fa5";
          ctx.fillRect(x, y, ts, ts);
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.font = "10px JetBrains Mono, monospace";
          ctx.fillText(String(tile), x + 4, y + 12);
        }
        ctx.strokeStyle = selected ? "rgba(240,192,64,0.45)" : "rgba(255,255,255,0.12)";
        ctx.strokeRect(x + 0.5, y + 0.5, ts - 1, ts - 1);
      }
    }
    if (selected) {
      ctx.strokeStyle = "#f0c040";
      ctx.lineWidth = 2;
      ctx.strokeRect(ox - 1, oy - 1, cols * ts + 2, rows * ts + 2);
      ctx.lineWidth = 1;
    }
  }

  function redraw(): void {
    if (!ctx || getEditorMode() === "play") return;
    // 3D scenes use the WebGPU edit viewport (`scene-view-3d`).
    if (sceneHas3d(store.getScene())) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#14161c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x += 32) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (let y = 0; y < canvas.height; y += 32) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();

    const pack = getAssetPack();
    const selected = new Set(store.getSelectedIds());
    for (const entity of store.getScene().entities) {
      const t = entity.components?.transform2d;
      if (!t) continue;
      const x = (t.x ?? 0) + canvas.width / 2;
      const y = (t.y ?? 0) + canvas.height / 2;
      const isSel = selected.has(entity.id ?? -1);

      if (entity.components?.tilemap) {
        drawTilemapEdit(entity, isSel);
        ctx.fillStyle = "#e8e1d4";
        ctx.font = "11px JetBrains Mono, monospace";
        ctx.fillText(entity.name ?? "", x, y - 6);
        continue;
      }

      const sprite = entity.components?.sprite;
      const w = sprite?.w ?? 24;
      const h = sprite?.h ?? 24;
      let drawn = false;
      if (sprite?.asset && pack?.assets[sprite.asset]) {
        const entry = pack.assets[sprite.asset];
        const img = ensureImage(sprite.asset, entry.embed);
        if (img && img.complete) {
          ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
          drawn = true;
        }
      }
      if (!drawn) {
        ctx.fillStyle = isSel ? "#3ecf8e" : "#6b8cae";
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
      }
      if (isSel) {
        ctx.strokeStyle = "#f0c040";
        ctx.lineWidth = 2;
        ctx.strokeRect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4);
        ctx.lineWidth = 1;
      }
      ctx.fillStyle = "#e8e1d4";
      ctx.font = "11px JetBrains Mono, monospace";
      ctx.fillText(entity.name ?? "", x - w / 2, y - h / 2 - 4);
    }
  }

  function toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const r = canvas.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * canvas.width;
    const sy = ((clientY - r.top) / r.height) * canvas.height;
    return { x: sx - canvas.width / 2, y: sy - canvas.height / 2 };
  }

  function hitTest(wx: number, wy: number): number | null {
    for (let i = store.getScene().entities.length - 1; i >= 0; i--) {
      const entity = store.getScene().entities[i];
      const t = entity.components?.transform2d;
      if (!t) continue;
      const x = t.x ?? 0;
      const y = t.y ?? 0;
      if (entity.components?.tilemap) {
        const cell = tileCellAt(entity, wx, wy);
        if (cell) return entity.id ?? null;
        continue;
      }
      const { w, h } = entitySize(entity);
      if (wx >= x - w / 2 && wx <= x + w / 2 && wy >= y - h / 2 && wy <= y + h / 2) {
        return entity.id ?? null;
      }
    }
    return null;
  }

  function paintAt(id: number, wx: number, wy: number, erase: boolean): void {
    const ent = store.getScene().entities.find((e) => e.id === id);
    if (!ent) return;
    const cell = tileCellAt(ent, wx, wy);
    if (!cell) return;
    const tile = erase ? 0 : store.getTileBrush();
    store.setEntityTile(id, cell.col, cell.row, tile);
  }

  const onDown = (e: MouseEvent) => {
    if (getEditorMode() === "play") return;
    if (sceneHas3d(store.getScene())) return;
    const p = toWorld(e.clientX, e.clientY);
    const erase = e.button === 2 || e.altKey;
    const wantDrag = e.metaKey || e.ctrlKey;
    const selected = store.getSelected();

    // Paint / erase when a tilemap is selected and the click lands on its grid.
    if (
      !wantDrag &&
      selected?.components?.tilemap &&
      selected.id != null &&
      tileCellAt(selected, p.x, p.y)
    ) {
      store.beginPaintGesture();
      painting = { id: selected.id, erase };
      paintAt(selected.id, p.x, p.y, erase);
      redraw();
      return;
    }

    const id = hitTest(p.x, p.y);
    if (id != null) {
      store.select(id, e.shiftKey);
      const ent = store.getSelected();
      // Clicking an unselected tilemap selects; next stroke paints. ⌘/Ctrl-drag moves.
      if (
        !wantDrag &&
        ent?.components?.tilemap &&
        ent.id != null &&
        store.getSelectedIds().length === 1 &&
        selected?.id === ent.id &&
        tileCellAt(ent, p.x, p.y)
      ) {
        store.beginPaintGesture();
        painting = { id: ent.id, erase };
        paintAt(ent.id, p.x, p.y, erase);
        redraw();
        return;
      }
      const t = ent?.components?.transform2d;
      // Tilemaps: drag only with ⌘/Ctrl (paint is the default). Sprites always drag.
      if (ent?.components?.tilemap && !wantDrag) {
        redraw();
        return;
      }
      store.beginDragGesture();
      dragging = { id, ox: p.x - (t?.x ?? 0), oy: p.y - (t?.y ?? 0) };
    } else {
      store.clearSelection();
    }
    redraw();
  };

  const onMove = (e: MouseEvent) => {
    if (getEditorMode() === "play") return;
    if (sceneHas3d(store.getScene())) return;
    const p = toWorld(e.clientX, e.clientY);
    if (painting) {
      paintAt(painting.id, p.x, p.y, painting.erase || e.button === 2 || e.altKey);
      redraw();
      return;
    }
    if (!dragging) return;
    store.setEntityTransform2d(dragging.id, p.x - dragging.ox, p.y - dragging.oy);
    redraw();
  };

  const onUp = () => {
    if (painting) store.endPaintGesture();
    if (dragging) store.endDragGesture();
    painting = null;
    dragging = null;
  };

  const onContext = (e: MouseEvent) => {
    // Allow right-click erase without the browser menu.
    if (getEditorMode() === "play") return;
    const selected = store.getSelected();
    if (selected?.components?.tilemap) e.preventDefault();
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (getEditorMode() === "play") return;
    if (sceneHas3d(store.getScene())) return;
    const path = e.dataTransfer?.getData("text/juno-asset");
    if (!path) return;
    const p = toWorld(e.clientX, e.clientY);
    const pack = getAssetPack();
    const entry = pack?.assets[path];
    const id = store.createEntity("Sprite");
    store.updateSelected((ent) => {
      if (ent.id !== id) return;
      ent.components = {
        transform2d: { x: p.x, y: p.y, rotation: 0, scale: [1, 1] },
        sprite: {
          asset: path,
          w: entry?.w || 32,
          h: entry?.h || 32,
        },
      };
    });
    redraw();
  };

  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  canvas.addEventListener("contextmenu", onContext);
  canvas.addEventListener("dragover", onDragOver);
  canvas.addEventListener("drop", onDrop);

  const unsub = store.subscribe(() => redraw());
  redraw();

  return {
    redraw,
    dispose() {
      unsub();
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("contextmenu", onContext);
      canvas.removeEventListener("dragover", onDragOver);
      canvas.removeEventListener("drop", onDrop);
    },
  };
}
