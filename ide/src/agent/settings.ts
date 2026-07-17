/** Optional AI assistant settings (localStorage). Off by default. */

export const AI_ENABLED_KEY = "juni.ai.enabled";
export const AI_MODEL_KEY = "juni.ai.modelId";

/** Prefer 1.5B coder — 0.5B drifts off Juni into Unity/C# nonsense. */
export const DEFAULT_MODEL_ID = "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC";

/** Curated picker list (id → short label). First entry is the default. */
export const AI_MODEL_OPTIONS: Array<{ id: string; label: string; note?: string }> = [
  {
    id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
    label: "Coder 1.5B (default)",
    note: "Best Juni grounding / size tradeoff",
  },
  {
    id: "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC",
    label: "Coder 3B",
    note: "Stronger code; larger download",
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Instruct 1.5B",
    note: "General chat; less code-focused",
  },
];

const LEGACY_TINY_MODELS = new Set([
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  "Qwen2.5-0.5B-Instruct-q4f32_1-MLC",
]);

const KNOWN_MODEL_IDS = new Set(AI_MODEL_OPTIONS.map((m) => m.id));

export type AiSettingsListener = () => void;

const listeners = new Set<AiSettingsListener>();

export function subscribeAiSettings(fn: AiSettingsListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) fn();
}

export function isAiEnabled(): boolean {
  try {
    return localStorage.getItem(AI_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAiEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AI_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
  notify();
}

export function getAiModelId(): string {
  try {
    const stored = localStorage.getItem(AI_MODEL_KEY);
    if (!stored || LEGACY_TINY_MODELS.has(stored)) return DEFAULT_MODEL_ID;
    if (!KNOWN_MODEL_IDS.has(stored)) return DEFAULT_MODEL_ID;
    return stored;
  } catch {
    return DEFAULT_MODEL_ID;
  }
}

export function setAiModelId(modelId: string): void {
  try {
    localStorage.setItem(AI_MODEL_KEY, modelId);
  } catch {
    /* ignore */
  }
  notify();
}

export function hasWebGpu(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as Navigator & { gpu?: unknown }).gpu;
}
