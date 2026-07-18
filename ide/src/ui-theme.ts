/** IDE chrome appearance themes. Default: classic. */

export const UI_APPEARANCES = [
  "classic",
  "modern",
  "cosmic",
  "froggy",
  "berryland",
  "basic",
  "hacker",
] as const;

export type UiAppearance = (typeof UI_APPEARANCES)[number];

const STORAGE_KEY = "juni.ui.appearance";

const APPEARANCE_SET = new Set<string>(UI_APPEARANCES);

export function isUiAppearance(value: string | null | undefined): value is UiAppearance {
  return !!value && APPEARANCE_SET.has(value);
}

/** Unknown / legacy values migrate to classic. */
export function normalizeUiAppearance(value: string | null | undefined): UiAppearance {
  return isUiAppearance(value) ? value : "classic";
}

export function getUiAppearance(): UiAppearance {
  try {
    return normalizeUiAppearance(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "classic";
  }
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
  const next = normalizeUiAppearance(appearance);
  document.documentElement.dataset.ui = next;
  const app = document.getElementById("app");
  if (app) app.dataset.ui = next;
  const sel = document.getElementById("ui-appearance") as HTMLSelectElement | null;
  if (sel && sel.value !== next) sel.value = next;
}

export function wireUiAppearanceSettings(): void {
  applyUiAppearance();
  const sel = document.getElementById("ui-appearance") as HTMLSelectElement | null;
  if (!sel) return;
  sel.value = getUiAppearance();
  sel.addEventListener("change", () => {
    setUiAppearance(normalizeUiAppearance(sel.value));
  });
}
