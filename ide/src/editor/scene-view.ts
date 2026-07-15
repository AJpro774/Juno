/** Edit-mode scene viewport: draw entities and drag sprites. */

import type { SceneStore } from "./scene-store.js";
import type { AssetPack } from "../../../runtime/src/types.js";
import { getEditorMode } from "./mode.js";

export type SceneViewHandle = {
  redraw: () => void;
  dispose: () => void;
};

export function attachSceneView(
  canvas: HTMLCanvasElement,
  store: SceneStore,
  getAssetPack: () => AssetPack | null
): SceneViewHandle {
  const ctx = canvas.getContext("2d");
  let dragging: { id: number; ox: number; oy: number } | null = null;
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

  function redraw(): void {
    if (!ctx || getEditorMode() === "play") return;
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
        ctx.fillStyle = selected.has(entity.id ?? -1) ? "#3ecf8e" : "#6b8cae";
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
      }
      if (selected.has(entity.id ?? -1)) {
        ctx.strokeStyle = "#f0c040";
        ctx.lineWidth = 2;
        ctx.strokeRect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4);
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
      const w = entity.components?.sprite?.w ?? 24;
      const h = entity.components?.sprite?.h ?? 24;
      const x = t.x ?? 0;
      const y = t.y ?? 0;
      if (wx >= x - w / 2 && wx <= x + w / 2 && wy >= y - h / 2 && wy <= y + h / 2) {
        return entity.id ?? null;
      }
    }
    return null;
  }

  const onDown = (e: MouseEvent) => {
    if (getEditorMode() === "play") return;
    const p = toWorld(e.clientX, e.clientY);
    const id = hitTest(p.x, p.y);
    if (id != null) {
      store.select(id, e.shiftKey);
      const ent = store.getSelected();
      const t = ent?.components?.transform2d;
      store.beginDragGesture();
      dragging = { id, ox: p.x - (t?.x ?? 0), oy: p.y - (t?.y ?? 0) };
    } else {
      store.clearSelection();
    }
    redraw();
  };

  const onMove = (e: MouseEvent) => {
    if (!dragging || getEditorMode() === "play") return;
    const p = toWorld(e.clientX, e.clientY);
    store.setEntityTransform2d(dragging.id, p.x - dragging.ox, p.y - dragging.oy);
    redraw();
  };

  const onUp = () => {
    if (dragging) store.endDragGesture();
    dragging = null;
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (getEditorMode() === "play") return;
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
      canvas.removeEventListener("dragover", onDragOver);
      canvas.removeEventListener("drop", onDrop);
    },
  };
}
