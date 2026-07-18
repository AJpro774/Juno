/** Scene hierarchy panel. */

import type { SceneStore } from "./scene-store.js";

export function renderScenePanel(host: HTMLElement, store: SceneStore): void {
  host.innerHTML = "";
  const head = document.createElement("div");
  head.className = "pane-toolbar";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "ghost tight";
  addBtn.textContent = "+ Entity";
  addBtn.addEventListener("click", () => store.createEntity("Entity"));
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "ghost tight";
  delBtn.textContent = "Delete";
  delBtn.addEventListener("click", () => store.deleteSelected());
  head.append(addBtn, delBtn);
  host.appendChild(head);

  const list = document.createElement("ul");
  list.className = "scene-hierarchy";
  const selected = new Set(store.getSelectedIds());
  for (const entity of store.getScene().entities) {
    const id = entity.id ?? 0;
    const li = document.createElement("li");
    li.className = "scene-hierarchy-item" + (selected.has(id) ? " is-selected" : "");
    const label = document.createElement("span");
    label.className = "scene-hierarchy-label";
    label.textContent = entity.name ?? `Entity_${id}`;
    li.appendChild(label);
    if (entity.tag) {
      const tag = document.createElement("span");
      tag.className = "scene-tag";
      tag.textContent = entity.tag;
      li.appendChild(tag);
    }
    const c = entity.components ?? {};
    const badges: string[] = [];
    if (c.mesh3d) badges.push("mesh");
    if (c.light3d) badges.push("light");
    if (c.camera3d) badges.push("cam3d");
    if (c.camera2d) badges.push("cam2d");
    if (c.sprite) badges.push("sprite");
    if (c.sprite_animator) badges.push("anim");
    for (const b of badges) {
      const badge = document.createElement("span");
      badge.className = "scene-badge";
      badge.textContent = b;
      li.appendChild(badge);
    }
    li.addEventListener("click", (e) => {
      store.select(id, e.shiftKey);
    });
    li.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      store.select(id);
      if (window.confirm(`Delete ${entity.name}?`)) store.deleteSelected();
    });
    list.appendChild(li);
  }
  host.appendChild(list);
}
