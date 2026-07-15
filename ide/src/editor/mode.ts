/** Edit vs Play mode controller for the engine IDE. */

export type EditorMode = "edit" | "play";

export type ModeListener = (mode: EditorMode) => void;

let mode: EditorMode = "edit";
const listeners = new Set<ModeListener>();

export function getEditorMode(): EditorMode {
  return mode;
}

export function setEditorMode(next: EditorMode): void {
  if (mode === next) return;
  mode = next;
  for (const fn of listeners) fn(mode);
}

export function subscribeMode(fn: ModeListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function togglePlayMode(): EditorMode {
  setEditorMode(mode === "edit" ? "play" : "edit");
  return mode;
}
