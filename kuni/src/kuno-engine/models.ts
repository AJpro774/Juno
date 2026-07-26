/**
 * KunoEngine scale ladder + FP8 / MXFP6 quant switch.
 *
 * WebLLM tiers use MLC prebuilts (q4f32 ≈ FP8-class, q4f16/q3f16 ≈ MXFP6-class).
 * Hub tiers (Surge, Gemma 4 GGUF, SOLAR, Solar Open2, Qwen3-Coder, DeepSeek, Kimi)
 * are catalogued but not loadable in-browser today (server / desktop, or GGUF above the ~2GB WASM limit).
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
  | "solar-10"
  | "studio-12"
  | "qwen3-coder-30"
  | "qwen3-coder-next"
  | "rig-32"
  | "deepseek-coder-v2"
  | "beast-256"
  | "qwen3-coder-480"
  | "solar-open2-250"
  | "deepseek-v3"
  | "kimi-k2"
  | "surge-k27";

export type KunoGgufSource = {
  repo: string;
  file: string;
  /** Vision projector GGUF in the same HF repo (enables multimodal). */
  mmprojFile?: string;
  /** Approximate download size (MB) for notes. */
  sizeMb: number;
};

/** Hub catalog kind (chat LLMs only in the in-browser catalog). */
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
    id: "solar-10",
    label: "SOLAR · 10.7B",
    modelNames: {
      mxfp6: "SOLAR 10.7B Instruct",
      fp8: "SOLAR 10.7B Instruct",
    },
    ramGb: 16,
    note:
      "upstage/SOLAR-10.7B-Instruct-v1.0 — chat LLM (safetensors ~21GB). Hub reference only: not in WebLLM; TheBloke GGUFs (~4.5–11GB) exceed the browser ~2GB WASM limit. Use desktop llama.cpp / Transformers.",
    backend: "hub",
    variants: {
      mxfp6: "hub:upstage/SOLAR-10.7B-Instruct-v1.0",
      fp8: "hub:upstage/SOLAR-10.7B-Instruct-v1.0",
    },
    vramMb: { mxfp6: 21_500, fp8: 21_500 },
    hub: {
      mxfp6: {
        repo: "upstage/SOLAR-10.7B-Instruct-v1.0",
        kind: "chat",
        format: "safetensors",
        sizeGb: 21.5,
      },
      fp8: {
        repo: "upstage/SOLAR-10.7B-Instruct-v1.0",
        kind: "chat",
        format: "safetensors",
        sizeGb: 21.5,
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
    id: "qwen3-coder-30",
    label: "Qwen3-Coder · 30B",
    modelNames: {
      mxfp6: "Qwen3-Coder 30B-A3B",
      fp8: "Qwen3-Coder 30B-A3B",
    },
    ramGb: 64,
    note:
      "Qwen/Qwen3-Coder-30B-A3B-Instruct — 30.5B MoE coder (3.3B active). Hub reference; run with vLLM / Transformers / desktop GGUF. Not WebLLM/wllama.",
    backend: "hub",
    variants: {
      mxfp6: "hub:Qwen/Qwen3-Coder-30B-A3B-Instruct",
      fp8: "hub:Qwen/Qwen3-Coder-30B-A3B-Instruct",
    },
    vramMb: { mxfp6: 61_000, fp8: 61_000 },
    hub: {
      mxfp6: {
        repo: "Qwen/Qwen3-Coder-30B-A3B-Instruct",
        kind: "chat",
        format: "safetensors",
        sizeGb: 61,
      },
      fp8: {
        repo: "Qwen/Qwen3-Coder-30B-A3B-Instruct",
        kind: "chat",
        format: "safetensors",
        sizeGb: 61,
      },
    },
  },
  {
    id: "qwen3-coder-next",
    label: "Qwen3-Coder · Next",
    modelNames: {
      mxfp6: "Qwen3-Coder Next",
      fp8: "Qwen3-Coder Next",
    },
    ramGb: 160,
    note:
      "Qwen/Qwen3-Coder-Next — ~80B coder (~160GB-class). Hub reference; multi-GPU / desktop. Not WebLLM/wllama.",
    backend: "hub",
    variants: {
      mxfp6: "hub:Qwen/Qwen3-Coder-Next",
      fp8: "hub:Qwen/Qwen3-Coder-Next",
    },
    vramMb: { mxfp6: 160_000, fp8: 160_000 },
    hub: {
      mxfp6: {
        repo: "Qwen/Qwen3-Coder-Next",
        kind: "chat",
        format: "safetensors",
        sizeGb: 160,
      },
      fp8: {
        repo: "Qwen/Qwen3-Coder-Next",
        kind: "chat",
        format: "safetensors",
        sizeGb: 160,
      },
    },
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
    id: "deepseek-coder-v2",
    label: "DeepSeek-Coder · V2",
    modelNames: {
      mxfp6: "DeepSeek-Coder V2",
      fp8: "DeepSeek-Coder V2",
    },
    ramGb: 256,
    note:
      "deepseek-ai/DeepSeek-Coder-V2-Instruct — ~236B MoE coder. Hub reference; multi-GPU cluster. Not WebLLM/wllama.",
    backend: "hub",
    variants: {
      mxfp6: "hub:deepseek-ai/DeepSeek-Coder-V2-Instruct",
      fp8: "hub:deepseek-ai/DeepSeek-Coder-V2-Instruct",
    },
    vramMb: { mxfp6: 472_000, fp8: 472_000 },
    hub: {
      mxfp6: {
        repo: "deepseek-ai/DeepSeek-Coder-V2-Instruct",
        kind: "chat",
        format: "safetensors",
        sizeGb: 472,
      },
      fp8: {
        repo: "deepseek-ai/DeepSeek-Coder-V2-Instruct",
        kind: "chat",
        format: "safetensors",
        sizeGb: 472,
      },
    },
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
    id: "qwen3-coder-480",
    label: "Qwen3-Coder · 480B",
    modelNames: {
      mxfp6: "Qwen3-Coder 480B-A35B",
      fp8: "Qwen3-Coder 480B-A35B",
    },
    ramGb: 512,
    note:
      "Qwen/Qwen3-Coder-480B-A35B-Instruct — largest dedicated open coder (480B MoE / 35B active, Apache-2.0). Hub reference; multi-GPU cluster only. Not WebLLM/wllama.",
    backend: "hub",
    variants: {
      mxfp6: "hub:Qwen/Qwen3-Coder-480B-A35B-Instruct",
      fp8: "hub:Qwen/Qwen3-Coder-480B-A35B-Instruct",
    },
    vramMb: { mxfp6: 960_000, fp8: 960_000 },
    hub: {
      mxfp6: {
        repo: "Qwen/Qwen3-Coder-480B-A35B-Instruct",
        kind: "chat",
        format: "safetensors",
        sizeGb: 960,
      },
      fp8: {
        repo: "Qwen/Qwen3-Coder-480B-A35B-Instruct",
        kind: "chat",
        format: "safetensors",
        sizeGb: 960,
      },
    },
  },
  {
    id: "solar-open2-250",
    label: "Solar Open2 · 250B",
    modelNames: {
      mxfp6: "Solar Open2 250B",
      fp8: "Solar Open2 250B",
    },
    ramGb: 512,
    note:
      "upstage/Solar-Open2-250B — 250B-A15B Hybrid-Attention MoE chat LLM (~500GB safetensors). Hub reference only; needs multi-GPU (min ~4× H200) with vLLM / Transformers. Not WebLLM/wllama.",
    backend: "hub",
    variants: {
      mxfp6: "hub:upstage/Solar-Open2-250B",
      fp8: "hub:upstage/Solar-Open2-250B",
    },
    vramMb: { mxfp6: 500_000, fp8: 500_000 },
    hub: {
      mxfp6: {
        repo: "upstage/Solar-Open2-250B",
        kind: "chat",
        format: "safetensors",
        sizeGb: 500,
      },
      fp8: {
        repo: "upstage/Solar-Open2-250B",
        kind: "chat",
        format: "safetensors",
        sizeGb: 500,
      },
    },
  },
  {
    id: "deepseek-v3",
    label: "DeepSeek · V3",
    modelNames: {
      mxfp6: "DeepSeek V3",
      fp8: "DeepSeek V3",
    },
    ramGb: 1024,
    note:
      "deepseek-ai/DeepSeek-V3 — ~685B MoE generalist (strong coding). Hub reference; multi-GPU cluster. Not WebLLM/wllama.",
    backend: "hub",
    variants: {
      mxfp6: "hub:deepseek-ai/DeepSeek-V3",
      fp8: "hub:deepseek-ai/DeepSeek-V3",
    },
    vramMb: { mxfp6: 1_370_000, fp8: 1_370_000 },
    hub: {
      mxfp6: {
        repo: "deepseek-ai/DeepSeek-V3",
        kind: "chat",
        format: "safetensors",
        sizeGb: 1370,
      },
      fp8: {
        repo: "deepseek-ai/DeepSeek-V3",
        kind: "chat",
        format: "safetensors",
        sizeGb: 1370,
      },
    },
  },
  {
    id: "kimi-k2",
    label: "Kimi · K2",
    modelNames: {
      mxfp6: "Kimi K2 Instruct",
      fp8: "Kimi K2 Instruct",
    },
    ramGb: 1024,
    note:
      "moonshotai/Kimi-K2-Instruct — ~1T MoE generalist (strong agentic coding). Hub reference; multi-GPU cluster. Not WebLLM/wllama.",
    backend: "hub",
    variants: {
      mxfp6: "hub:moonshotai/Kimi-K2-Instruct",
      fp8: "hub:moonshotai/Kimi-K2-Instruct",
    },
    vramMb: { mxfp6: 2_050_000, fp8: 2_050_000 },
    hub: {
      mxfp6: {
        repo: "moonshotai/Kimi-K2-Instruct",
        kind: "chat",
        format: "safetensors",
        sizeGb: 2050,
      },
      fp8: {
        repo: "moonshotai/Kimi-K2-Instruct",
        kind: "chat",
        format: "safetensors",
        sizeGb: 2050,
      },
    },
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
  const gated = hub.gated ? " (HF gated)" : "";
  if (hub.format === "gguf") {
    return (
      `${modelName} (~${hub.sizeGb}GB GGUF)${gated} is too large for in-browser load. ` +
      `Pick Llama 3.1 8B, Gemma 2 9B, or Gemma 4 E4B instead.`
    );
  }
  return (
    `${modelName} (${hub.repo}, ~${hub.sizeGb}GB)${gated} needs a GPU server (vLLM / Transformers). ` +
    `For in-browser chat, pick Llama 3.1 8B, Gemma 2 9B, or Gemma 4 E4B.`
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
