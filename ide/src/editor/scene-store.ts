/** In-memory `.jscene` store with selection and undo. */

import {
  emptyScene,
  parseScene,
  type JScene,
  type JSceneEntity,
} from "../../../runtime/src/scene-loader.js";

export type SceneStoreListener = () => void;

export class SceneStore {
  private scene: JScene = emptyScene();
  private path = "scenes/main.jscene";
  private selection = new Set<number>();
  private undoStack: JScene[] = [];
  private redoStack: JScene[] = [];
  private listeners = new Set<SceneStoreListener>();
  private dirty = false;
  private dragUndoPushed = false;

  subscribe(fn: SceneStoreListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  private pushUndo(): void {
    this.undoStack.push(structuredClone(this.scene));
    if (this.undoStack.length > 64) this.undoStack.shift();
    this.redoStack = [];
  }

  getPath(): string {
    return this.path;
  }

  getScene(): JScene {
    return this.scene;
  }

  /** Deep clone of current scene for play-mode snapshot. */
  cloneScene(): JScene {
    return structuredClone(this.scene);
  }

  /** Replace scene without clearing undo (used for play restore). */
  restoreScene(scene: JScene): void {
    this.scene = structuredClone(scene);
    this.selection.clear();
    this.notify();
  }

  isDirty(): boolean {
    return this.dirty;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getSelectedIds(): number[] {
    return [...this.selection];
  }

  getSelected(): JSceneEntity | null {
    const id = this.getSelectedIds()[0];
    if (id === undefined) return null;
    return this.scene.entities.find((e) => e.id === id) ?? null;
  }

  load(json: string | JScene, path?: string): void {
    this.scene = parseScene(json);
    if (path) this.path = path;
    this.selection.clear();
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;
    this.dragUndoPushed = false;
    this.notify();
  }

  serialize(): string {
    return JSON.stringify(this.scene, null, 2);
  }

  select(id: number, additive = false): void {
    if (!additive) this.selection.clear();
    if (this.selection.has(id) && additive) this.selection.delete(id);
    else this.selection.add(id);
    this.notify();
  }

  clearSelection(): void {
    this.selection.clear();
    this.notify();
  }

  createEntity(name = "Entity"): number {
    this.pushUndo();
    let maxId = 0;
    for (const e of this.scene.entities) maxId = Math.max(maxId, e.id ?? 0);
    const id = maxId + 1;
    this.scene.entities.push({
      id,
      name: `${name}_${id}`,
      tag: "",
      components: {
        transform2d: { x: 0, y: 0, rotation: 0, scale: [1, 1], z_index: 0 },
      },
    });
    this.dirty = true;
    this.selection.clear();
    this.selection.add(id);
    this.notify();
    return id;
  }

  deleteSelected(): void {
    if (this.selection.size === 0) return;
    this.pushUndo();
    this.scene.entities = this.scene.entities.filter((e) => !this.selection.has(e.id ?? -1));
    this.selection.clear();
    this.dirty = true;
    this.notify();
  }

  updateSelected(mutator: (entity: JSceneEntity) => void): void {
    const entity = this.getSelected();
    if (!entity) return;
    this.pushUndo();
    mutator(entity);
    this.dirty = true;
    this.notify();
  }

  /** Call once at drag start so the whole drag is one undo step. */
  beginDragGesture(): void {
    if (this.dragUndoPushed) return;
    this.pushUndo();
    this.dragUndoPushed = true;
  }

  endDragGesture(): void {
    this.dragUndoPushed = false;
  }

  setEntityTransform2d(id: number, x: number, y: number): void {
    const entity = this.scene.entities.find((e) => e.id === id);
    if (!entity) return;
    if (!this.dragUndoPushed) this.pushUndo();
    entity.components = entity.components ?? {};
    entity.components.transform2d = {
      ...(entity.components.transform2d ?? {}),
      x,
      y,
    };
    this.dirty = true;
    this.notify();
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(structuredClone(this.scene));
    this.scene = prev;
    this.dirty = true;
    this.notify();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(structuredClone(this.scene));
    this.scene = next;
    this.dirty = true;
    this.notify();
  }

  markSaved(): void {
    this.dirty = false;
    this.notify();
  }
}

export const sceneStore = new SceneStore();
