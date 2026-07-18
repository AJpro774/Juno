/** Classic / Modern IDE chrome. Default: modern. */

export type UiAppearance = "modern" | "classic";

const STORAGE_KEY = "juni.ui.appearance";

export function getUiAppearance(): UiAppearance {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "classic" || v === "modern") return v;
  } catch {
    /* ignore */
  }
  return "modern";
}

export function setUiAppearance(appearance: UiAppearance): void {
  try {
    localStorage.setItem(STORAGE_KEY, appearance);
  } catch {
    /* ignore */
  }
  applyUiAppearance(appearance);
}

export function applyUiAppearance(appearance: UiAppearance = getUiAppearance()): void {
  document.documentElement.dataset.ui = appearance;
  const app = document.getElementById("app");
  if (app) app.dataset.ui = appearance;
  const sel = document.getElementById("ui-appearance") as HTMLSelectElement | null;
  if (sel && sel.value !== appearance) sel.value = appearance;
}

export function wireUiAppearanceSettings(): void {
  applyUiAppearance();
  const sel = document.getElementById("ui-appearance") as HTMLSelectElement | null;
  if (!sel) return;
  sel.value = getUiAppearance();
  sel.addEventListener("change", () => {
    const v = sel.value === "classic" ? "classic" : "modern";
    setUiAppearance(v);
  });
}
