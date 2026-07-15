/** Asset browser thumbnails from assets.pack.json / project files. */

import type { AssetPack } from "../../../runtime/src/types.js";
import type { SceneStore } from "./scene-store.js";

export function renderAssetBrowser(
  host: HTMLElement,
  assetPack: AssetPack | null,
  store: SceneStore,
  onDropCreate?: (path: string) => void
): void {
  host.innerHTML = "";
  if (!assetPack || Object.keys(assetPack.assets).length === 0) {
    const empty = document.createElement("p");
    empty.className = "inspector-empty";
    empty.textContent = "No packed assets. Open a project with assets/.";
    host.appendChild(empty);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "asset-grid";
  for (const [path, entry] of Object.entries(assetPack.assets)) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "asset-card";
    card.draggable = true;
    card.title = path;
    const kind = document.createElement("span");
    kind.className = "asset-kind";
    kind.textContent = entry.kind;
    const name = document.createElement("span");
    name.className = "asset-name";
    name.textContent = path.split("/").pop() ?? path;
    card.append(kind, name);
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/juno-asset", path);
    });
    card.addEventListener("dblclick", () => {
      if (entry.kind === "image") {
        const id = store.createEntity("Sprite");
        store.updateSelected((ent) => {
          if (ent.id !== id) return;
          ent.components = ent.components ?? {};
          ent.components.sprite = {
            asset: path,
            w: entry.w || 32,
            h: entry.h || 32,
          };
        });
        onDropCreate?.(path);
      }
    });
    grid.appendChild(card);
  }
  host.appendChild(grid);
}
