/**
 * KunoEngine scale ladder + FP8 / MXFP6 quant switch.
 *
 * WebLLM tiers use MLC prebuilts (q4f32 ≈ FP8-class, q4f16/q3f16 ≈ MXFP6-class).
 * Hub tiers (Surge, Gemma 4 GGUF) are catalogued but not loadable in-browser today
 * (server / desktop, or GGUF above the ~2GB WASM limit).
 */

export type KunoQuant = "fp8" | "mxfp6";
export type KunoBackend = "webllm" | "wllama" | "hub";

export type KunoScaleId =
  | "tablet-3"
  | "slim-4"
  | "gemma4-e4b"
  | "standard-6"
  | "creator-8"
  | "gemma4-12b"
  | "studio-12"
  | "rig-32"
  | "beast-256"
  | "surge-k27";

export type KunoGgufSource = {
  repo: string;
  file: string;
  /** Vision projector GGUF in the same HF repo (enables multimodal). */
  mmprojFile?: string;
  /** Approximate download size (MB) for notes. */
  sizeMb: number;
};

export type KunoHubKind = "chat";

export type KunoHubSource = {
  repo: string;
  kind: KunoHubKind;
  format: "safetensors" | "gguf";
  /** Approximate download size (GB) for notes. */
  sizeGb: number;
  /** HF gated repo (needs login / access grant). */
  gated?: boolean;
};

export type KunoScaleTier = {
  id: KunoScaleId;
  label: string;
  modelNames: Record<KunoQuant, string>;
  ramGb: number;
  note: string;
  backend: KunoBackend;
  /** WebLLM / hub model ids (or gguf:… keys). */
  variants: Record<KunoQuant, string>;
  vramMb: Record<KunoQuant, number>;
  /** HuggingFace GGUF sources (backend === "wllama"). */
  gguf?: Record<KunoQuant, KunoGgufSource>;
  /** HuggingFace safetensors hubs (backend === "hub"). */
  hub?: Record<KunoQuant, KunoHubSource>;
};

export const DEFAULT_SCALE_ID: KunoScaleId = "standard-6";
export const DEFAULT_QUANT: KunoQuant = "fp8";

export const KUNO_SCALE_TIERS: KunoScaleTier[] = [
  {
    id: "tablet-3",
    label: "Tablet · 3GB",
    modelNames: { mxfp6: "Llama 3.2 3B", fp8: "Llama 3.2 3B" },
    ramGb: 3,
    note: "Small tablets / low-end Chromebooks — Llama 3.2 3B (WebLLM)",
    backend: "webllm",
    variants: {
      mxfp6: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
      fp8: "Llama-3.2-3B-Instruct-q4f32_1-MLC",
    },
    vramMb: { mxfp6: 2264, fp8: 2952 },
  },
  {
    id: "slim-4",
    label: "Slim · 4GB",
    modelNames: { mxfp6: "Qwen2.5 3B", fp8: "Qwen2.5 3B" },
    ramGb: 4,
    note: "Phones & thin laptops — Qwen2.5 3B (WebLLM)",
    backend: "webllm",
    variants: {
      mxfp6: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
      fp8: "Qwen2.5-3B-Instruct-q4f32_1-MLC",
    },
    vramMb: { mxfp6: 2505, fp8: 2894 },
  },
  {
    id: "gemma4-e4b",
    label: "Gemma 4 E4B",
    modelNames: {
      mxfp6: "Gemma 4 E4B QAT",
      fp8: "Gemma 4 E4B QAT",
    },
    ramGb: 5,
    note:
      "Unsloth Gemma 4 E4B QAT via wllama — text + image (mmproj ~1GB). MXFP6→UD-Q2_K_XL (~3.2GB), FP8→UD-Q4_K_XL (~4.2GB). No audio/voice. CPU offload reduces WASM abort risk.",
    backend: "wllama",
    variants: {
      mxfp6: "gguf:unsloth/gemma-4-E4B-it-qat-GGUF:gemma-4-E4B-it-qat-UD-Q2_K_XL.gguf",
      fp8: "gguf:unsloth/gemma-4-E4B-it-qat-GGUF:gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf",
    },
    vramMb: { mxfp6: 3220, fp8: 4220 },
    gguf: {
      mxfp6: {
        repo: "unsloth/gemma-4-E4B-it-qat-GGUF",
        file: "gemma-4-E4B-it-qat-UD-Q2_K_XL.gguf",
        mmprojFile: "mmproj-F16.gguf",
        sizeMb: 3220,
      },
      fp8: {
        repo: "unsloth/gemma-4-E4B-it-qat-GGUF",
        file: "gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf",
        mmprojFile: "mmproj-F16.gguf",
        sizeMb: 4220,
      },
    },
  },
  {
    id: "standard-6",
    label: "Standard · 6GB",
    modelNames: { mxfp6: "Llama 3.1 8B", fp8: "Llama 3.1 8B" },
    ramGb: 6,
    note: "Default KunoEngine profile — Llama 3.1 8B (WebLLM)",
    backend: "webllm",
    variants: {
      mxfp6: "Llama-3.1-8B-Instruct-q4f16_1-MLC",
      fp8: "Llama-3.1-8B-Instruct-q4f32_1-MLC",
    },
    vramMb: { mxfp6: 5001, fp8: 6101 },
  },
  {
    id: "creator-8",
    label: "Creator · 8GB",
    modelNames: { mxfp6: "Gemma 2 9B", fp8: "Gemma 2 9B" },
    ramGb: 8,
    note: "Creator laptops — Gemma 2 9B (WebLLM)",
    backend: "webllm",
    variants: {
      mxfp6: "gemma-2-9b-it-q4f16_1-MLC",
      fp8: "gemma-2-9b-it-q4f32_1-MLC",
    },
    vramMb: { mxfp6: 6422, fp8: 8383 },
  },
  {
    id: "gemma4-12b",
    label: "Gemma 4 12B",
    modelNames: {
      mxfp6: "Gemma 4 12B QAT",
      fp8: "Gemma 4 12B QAT",
    },
    ramGb: 8,
    note:
      "unsloth/gemma-4-12B-it-qat-GGUF (~6.7GB) exceeds the browser ~2GB WASM limit. Use Gemma 2 9B (WebLLM) in-browser, or run the GGUF in desktop llama.cpp.",
    backend: "hub",
    variants: {
      mxfp6: "hub:unsloth/gemma-4-12B-it-qat-GGUF",
      fp8: "hub:unsloth/gemma-4-12B-it-qat-GGUF",
    },
    vramMb: { mxfp6: 6720, fp8: 6720 },
    hub: {
      mxfp6: {
        repo: "unsloth/gemma-4-12B-it-qat-GGUF",
        kind: "chat",
        format: "gguf",
        sizeGb: 6.7,
      },
      fp8: {
        repo: "unsloth/gemma-4-12B-it-qat-GGUF",
        kind: "chat",
        format: "gguf",
        sizeGb: 6.7,
      },
    },
  },
  {
    id: "studio-12",
    label: "Studio · 12GB",
    modelNames: { mxfp6: "Llama 2 13B", fp8: "Gemma 2 9B" },
    ramGb: 12,
    note: "Desktop / studio GPUs — Llama 2 13B (MXFP6); FP8 uses Gemma 2 9B (WebLLM)",
    backend: "webllm",
    variants: {
      mxfp6: "Llama-2-13b-chat-hf-q4f16_1-MLC",
      fp8: "gemma-2-9b-it-q4f32_1-MLC",
    },
    vramMb: { mxfp6: 11814, fp8: 8383 },
  },
  {
    id: "rig-32",
    label: "Rig · 32GB",
    modelNames: { mxfp6: "Llama 3.1 70B", fp8: "Llama 3.1 70B" },
    ramGb: 32,
    note: "High-end local rigs — Llama 3.1 70B (WebLLM q3)",
    backend: "webllm",
    variants: {
      mxfp6: "Llama-3.1-70B-Instruct-q3f16_1-MLC",
      fp8: "Llama-3.1-70B-Instruct-q3f16_1-MLC",
    },
    vramMb: { mxfp6: 31153, fp8: 31153 },
  },
  {
    id: "beast-256",
    label: "Beast · 256GB",
    modelNames: { mxfp6: "Llama 3.1 70B", fp8: "Llama 3.1 70B" },
    ramGb: 256,
    note: "256GB-class target — WebLLM max today is Llama 3.1 70B (~31GB)",
    backend: "webllm",
    variants: {
      mxfp6: "Llama-3.1-70B-Instruct-q3f16_1-MLC",
      fp8: "Llama-3.1-70B-Instruct-q3f16_1-MLC",
    },
    vramMb: { mxfp6: 31153, fp8: 31153 },
  },
  {
    id: "surge-k27",
    label: "Surge · K2.7",
    modelNames: { mxfp6: "Surge K2.7", fp8: "Surge K2.7" },
    ramGb: 512,
    note:
      "Anubis136/Surge-K2.7 — 1T MoE any-to-any (Kimi K2.6-class) safetensors. Server cluster only (vLLM / SGLang / Transformers); not WebLLM/wllama.",
    backend: "hub",
    variants: {
      mxfp6: "hub:Anubis136/Surge-K2.7",
      fp8: "hub:Anubis136/Surge-K2.7",
    },
    vramMb: { mxfp6: 512_000, fp8: 512_000 },
    hub: {
      mxfp6: {
        repo: "Anubis136/Surge-K2.7",
        kind: "chat",
        format: "safetensors",
        sizeGb: 600,
      },
      fp8: {
        repo: "Anubis136/Surge-K2.7",
        kind: "chat",
        format: "safetensors",
        sizeGb: 600,
      },
    },
  },
];

const SCALE_IDS = new Set(KUNO_SCALE_TIERS.map((t) => t.id));

export type KunoModelOption = {
  id: string;
  label: string;
  modelName: string;
  note: string;
  vramMb: number;
  profile: KunoQuant | "light" | "heavy";
  statusLabel: string;
  scaleId: KunoScaleId;
  quant: KunoQuant;
  backend: KunoBackend;
  /** True when GGUF loads with an mmproj (image capable). */
  multimodal: boolean;
  /** Hugging Face hub metadata when backend === "hub". */
  hub?: KunoHubSource;
};

export function resolveScaleId(stored: string | null | undefined): KunoScaleId {
  if (stored && SCALE_IDS.has(stored as KunoScaleId)) return stored as KunoScaleId;
  return DEFAULT_SCALE_ID;
}

export function resolveQuant(stored: string | null | undefined): KunoQuant {
  if (stored === "fp8" || stored === "mxfp6") return stored;
  return DEFAULT_QUANT;
}

export function scaleMeta(id: KunoScaleId): KunoScaleTier {
  return KUNO_SCALE_TIERS.find((t) => t.id === id) ?? KUNO_SCALE_TIERS.find((t) => t.id === DEFAULT_SCALE_ID)!;
}

export function resolveModelIdFor(scaleId: KunoScaleId, quant: KunoQuant): string {
  return scaleMeta(scaleId).variants[quant];
}

export function resolveGgufSource(
  scaleId: KunoScaleId,
  quant: KunoQuant
): KunoGgufSource | null {
  const tier = scaleMeta(scaleId);
  if (tier.backend !== "wllama" || !tier.gguf) return null;
  return tier.gguf[quant];
}

export function resolveHubSource(
  scaleId: KunoScaleId,
  quant: KunoQuant
): KunoHubSource | null {
  const tier = scaleMeta(scaleId);
  if (tier.backend !== "hub" || !tier.hub) return null;
  return tier.hub[quant];
}

/** Dropdown label: just the model name for the active quant */
export function scaleOptionLabel(scaleId: KunoScaleId, quant: KunoQuant): string {
  return scaleMeta(scaleId).modelNames[quant];
}

export function modelMetaFor(scaleId: KunoScaleId, quant: KunoQuant): KunoModelOption {
  const tier = scaleMeta(scaleId);
  const modelName = tier.modelNames[quant];
  const quantTag = quant === "fp8" ? "FP8" : "MXFP6";
  const gguf = tier.gguf?.[quant];
  const hub = tier.hub?.[quant];
  return {
    id: tier.variants[quant],
    label: modelName,
    modelName,
    note: `${tier.label} · ${quantTag} — ${tier.note}`,
    vramMb: tier.vramMb[quant],
    profile: quant,
    statusLabel: `${quantTag} · ${modelName}`,
    scaleId,
    quant,
    backend: tier.backend,
    multimodal: Boolean(gguf?.mmprojFile),
    hub: hub ?? undefined,
  };
}

/** Human-readable reason a hub tier cannot load in-browser. */
export function hubUnavailableMessage(hub: KunoHubSource, modelName: string): string {
  const gated = hub.gated ? " (gated — HF login + access required)" : "";
  if (hub.format === "gguf") {
    return (
      `${modelName} is ${hub.repo}${gated}: GGUF ~${hub.sizeGb}GB exceeds the browser WASM ~2GB single-file limit ` +
      `(needs pre-split shards or desktop llama.cpp). For in-browser chat, load Llama 3.1 8B, Gemma 2 9B, or Gemma 4 E4B.`
    );
  }
  return (
    `${modelName} is ${hub.repo}${gated}: ${hub.format} checkpoint (~${hub.sizeGb}GB). ` +
    `Deploy on a GPU cluster with Transformers / vLLM / SGLang. Not loadable in-browser via WebLLM or wllama.`
  );
}

export function supportsMultimodal(scaleId: KunoScaleId, quant: KunoQuant): boolean {
  return modelMetaFor(scaleId, quant).multimodal;
}

export function findScaleForModelId(
  modelId: string
): { scaleId: KunoScaleId; quant: KunoQuant } | null {
  for (const tier of KUNO_SCALE_TIERS) {
    if (tier.variants.fp8 === modelId) return { scaleId: tier.id, quant: "fp8" };
    if (tier.variants.mxfp6 === modelId) return { scaleId: tier.id, quant: "mxfp6" };
  }
  return null;
}

/** @deprecated */
export function resolveModelId(stored: string | null | undefined): string {
  const found = stored ? findScaleForModelId(stored) : null;
  if (found) return resolveModelIdFor(found.scaleId, found.quant);
  return resolveModelIdFor(DEFAULT_SCALE_ID, DEFAULT_QUANT);
}

/** @deprecated */
export function modelMeta(id: string): KunoModelOption {
  const found = findScaleForModelId(id);
  if (found) return modelMetaFor(found.scaleId, found.quant);
  return modelMetaFor(DEFAULT_SCALE_ID, DEFAULT_QUANT);
}

export const KUNO_MODEL_OPTIONS: KunoModelOption[] = KUNO_SCALE_TIERS.flatMap((tier) =>
  (["fp8", "mxfp6"] as KunoQuant[]).map((quant) => modelMetaFor(tier.id, quant))
);

export const DEFAULT_MODEL_ID = resolveModelIdFor(DEFAULT_SCALE_ID, DEFAULT_QUANT);
