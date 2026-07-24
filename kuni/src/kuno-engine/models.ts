/**
 * KunoEngine model catalog.
 *
 * Product profile: ~6GB GPU memory, FP8-class precision.
 * WebLLM's prebuilt catalog does not yet ship native FP8 (e4m3) WebGPU libs,
 * so the default maps to Llama-3.1-8B q4f32 (~6101 MB) — the closest ~6GB slot.
 * When MLC publishes FP8 WebGPU builds, swap DEFAULT_MODEL_ID to the FP8 record.
 */

export type KunoModelOption = {
  id: string;
  label: string;
  note: string;
  /** Reported WebLLM VRAM requirement (MB). */
  vramMb: number;
  /** Product profile tag shown in the UI. */
  profile: "fp8-6gb" | "light" | "heavy";
};

/** Default: ~6.1GB — FP8 · 6GB product profile. */
export const DEFAULT_MODEL_ID = "Llama-3.1-8B-Instruct-q4f32_1-MLC";

export const KUNO_MODEL_OPTIONS: KunoModelOption[] = [
  {
    id: "Llama-3.1-8B-Instruct-q4f32_1-MLC",
    label: "Llama 3.1 8B · FP8 · 6GB",
    note: "Default KunoEngine profile — ~6.1GB VRAM",
    vramMb: 6101,
    profile: "fp8-6gb",
  },
  {
    id: "Qwen2.5-7B-Instruct-q4f32_1-MLC",
    label: "Qwen2.5 7B · ~6GB",
    note: "Strong general chat · ~5.9GB",
    vramMb: 5900,
    profile: "fp8-6gb",
  },
  {
    id: "Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 Coder 7B",
    note: "Code-focused · ~5.1GB",
    vramMb: 5107,
    profile: "fp8-6gb",
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 3B · Light",
    note: "Faster / lower VRAM · ~2.2GB",
    vramMb: 2263,
    profile: "light",
  },
];

const KNOWN = new Set(KUNO_MODEL_OPTIONS.map((m) => m.id));

export function resolveModelId(stored: string | null | undefined): string {
  if (stored && KNOWN.has(stored)) return stored;
  return DEFAULT_MODEL_ID;
}

export function modelMeta(id: string): KunoModelOption {
  return (
    KUNO_MODEL_OPTIONS.find((m) => m.id === id) ??
    KUNO_MODEL_OPTIONS[0]!
  );
}
