/**
 * KunoEngine — local LLM runtime.
 * WebLLM (MLC + WebGPU) for curated tiers; wllama (llama.cpp WASM) for GGUF.
 */

import {
  DEFAULT_QUANT,
  DEFAULT_SCALE_ID,
  findScaleForModelId,
  hubUnavailableMessage,
  modelMetaFor,
  resolveGgufSource,
  resolveHubSource,
  resolveModelIdFor,
  resolveQuant,
  resolveScaleId,
  scaleMeta,
  type KunoQuant,
  type KunoScaleId,
} from "./models";
import { loadGgufEngine, unloadGgufEngine, getGgufModalities } from "./wllama-backend";
import type { ChatMessage, CompleteOptions, LoadProgress, ModalitySupport } from "./types";

type EngineHandle = {
  chat: {
    completions: {
      create: (req: Record<string, unknown>) => Promise<unknown>;
    };
  };
  interruptGenerate?: () => void | Promise<void>;
  unload: () => Promise<void>;
  multimodal?: boolean;
  modalities?: ModalitySupport;
};

const MODEL_KEY = "kuni.kuno.modelId";
const SCALE_KEY = "kuni.kuno.scaleId";
const QUANT_KEY = "kuni.kuno.quant";

let engine: EngineHandle | null = null;
let loading: Promise<EngineHandle> | null = null;
let lastModelId = "";
let loadEpoch = 0;
let busy = false;
let lastBackend: "webllm" | "wllama" | "hub" | null = null;
let lastModalities: ModalitySupport = { image: false, audio: false };

export function hasWebGpu(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as Navigator & { gpu?: unknown }).gpu;
}

export function isEngineReady(): boolean {
  return engine !== null;
}

export function isEngineBusy(): boolean {
  return busy || loading !== null;
}

function persistSelection(scaleId: KunoScaleId, quant: KunoQuant): void {
  const modelId = resolveModelIdFor(scaleId, quant);
  try {
    localStorage.setItem(SCALE_KEY, scaleId);
    localStorage.setItem(QUANT_KEY, quant);
    localStorage.setItem(MODEL_KEY, modelId);
  } catch {
    /* ignore */
  }
}

export function getScaleId(): KunoScaleId {
  try {
    const stored = localStorage.getItem(SCALE_KEY);
    if (stored) return resolveScaleId(stored);
    const legacy = localStorage.getItem(MODEL_KEY);
    const found = legacy ? findScaleForModelId(legacy) : null;
    if (found) {
      persistSelection(found.scaleId, found.quant);
      return found.scaleId;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SCALE_ID;
}

export function getQuant(): KunoQuant {
  try {
    const stored = localStorage.getItem(QUANT_KEY);
    if (stored) return resolveQuant(stored);
    const legacy = localStorage.getItem(MODEL_KEY);
    const found = legacy ? findScaleForModelId(legacy) : null;
    if (found) {
      persistSelection(found.scaleId, found.quant);
      return found.quant;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_QUANT;
}

export function setScaleId(scaleId: KunoScaleId): void {
  persistSelection(resolveScaleId(scaleId), getQuant());
}

export function setQuant(quant: KunoQuant): void {
  persistSelection(getScaleId(), resolveQuant(quant));
}

export function getModelId(): string {
  return resolveModelIdFor(getScaleId(), getQuant());
}

/** @deprecated Prefer setScaleId / setQuant. */
export function setModelId(modelId: string): void {
  const found = findScaleForModelId(modelId);
  if (found) {
    persistSelection(found.scaleId, found.quant);
    return;
  }
  persistSelection(DEFAULT_SCALE_ID, DEFAULT_QUANT);
}

export function activeModelMeta() {
  return modelMetaFor(getScaleId(), getQuant());
}

/** Runtime modalities for the selected / loaded engine (image / audio). */
export function getActiveModalities(): ModalitySupport {
  const meta = activeModelMeta();
  const currentId = resolveModelIdFor(getScaleId(), getQuant());
  // Before load, or after switching away from a still-resident engine, use catalog.
  if (!engine || lastModelId !== currentId) {
    return meta.multimodal ? { image: true, audio: true } : { image: false, audio: false };
  }
  if (lastBackend === "wllama") {
    // Catalog multimodal (Gemma 4 + mmproj) always exposes image+audio in the UI,
    // even when the WASM probe only reports vision.
    if (meta.multimodal) return { image: true, audio: true };
    return { ...lastModalities };
  }
  return { image: false, audio: false };
}

async function interruptIfPossible(): Promise<void> {
  if (!engine?.interruptGenerate) return;
  try {
    await engine.interruptGenerate();
  } catch {
    /* ignore */
  }
}

export async function cancelPending(): Promise<void> {
  loadEpoch += 1;
  loading = null;
  busy = false;
  await interruptIfPossible();
}

export async function unloadEngine(): Promise<void> {
  loadEpoch += 1;
  loading = null;
  busy = false;
  const eng = engine;
  const backend = lastBackend;
  engine = null;
  lastModelId = "";
  lastBackend = null;
  lastModalities = { image: false, audio: false };
  if (!eng) return;
  try {
    await eng.interruptGenerate?.();
  } catch {
    /* ignore */
  }
  try {
    await eng.unload();
  } catch {
    /* ignore */
  }
  if (backend === "wllama") {
    await unloadGgufEngine();
  }
}

export async function ensureEngine(
  onProgress?: (p: LoadProgress) => void
): Promise<EngineHandle> {
  const scaleId = getScaleId();
  const quant = getQuant();
  const tier = scaleMeta(scaleId);
  const modelId = resolveModelIdFor(scaleId, quant);

  if (engine && lastModelId === modelId) return engine;
  if (engine && lastModelId !== modelId) {
    await unloadEngine();
  }
  if (loading) return loading;

  const epoch = loadEpoch;
  loading = (async () => {
    if (tier.backend === "hub") {
      const hub = resolveHubSource(scaleId, quant);
      const meta = modelMetaFor(scaleId, quant);
      const msg = hub
        ? hubUnavailableMessage(hub, meta.modelName)
        : `Hub model ${modelId} is not available in-browser.`;
      onProgress?.({ progress: 0, text: msg });
      throw new Error(msg);
    }

    if (tier.backend === "wllama") {
      const src = resolveGgufSource(scaleId, quant);
      if (!src) throw new Error(`No GGUF source for ${scaleId} / ${quant}`);
      const handle = await loadGgufEngine(src, onProgress);
      if (epoch !== loadEpoch) {
        await handle.unload();
        throw new Error("KunoEngine load cancelled.");
      }
      engine = handle;
      lastModelId = modelId;
      lastBackend = "wllama";
      lastModalities = handle.modalities ?? getGgufModalities();
      return engine;
    }

    if (!hasWebGpu()) {
      throw new Error(
        "WebGPU is required for WebLLM models. Use Chrome/Edge 113+, or pick a Gemma 4 GGUF tier (wllama)."
      );
    }

    onProgress?.({ progress: 0.01, text: "Starting KunoEngine (WebLLM + WASM)…" });
    const webllm = await import("@mlc-ai/web-llm");
    if (epoch !== loadEpoch) throw new Error("KunoEngine load cancelled.");
    onProgress?.({ progress: 0.05, text: `Downloading ${modelId}…` });

    const created = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (report: { progress: number; text: string }) => {
        if (epoch !== loadEpoch) return;
        onProgress?.({
          progress: Math.max(0.05, Math.min(1, report.progress)),
          text: report.text || `Loading ${modelId}…`,
        });
      },
    });

    if (epoch !== loadEpoch) {
      try {
        await (created as unknown as EngineHandle).unload();
      } catch {
        /* ignore */
      }
      throw new Error("KunoEngine load cancelled.");
    }

    engine = created as unknown as EngineHandle;
    lastModelId = modelId;
    lastBackend = "webllm";
    lastModalities = { image: false, audio: false };
    onProgress?.({ progress: 1, text: "KunoEngine ready" });
    return engine;
  })();

  try {
    return await loading;
  } catch (e) {
    if (epoch === loadEpoch) {
      engine = null;
      lastModelId = "";
      lastBackend = null;
      lastModalities = { image: false, audio: false };
    }
    throw e;
  } finally {
    if (epoch === loadEpoch) loading = null;
  }
}

export async function completeChat(
  messages: ChatMessage[],
  options: CompleteOptions = {},
  onProgress?: (p: LoadProgress) => void
): Promise<string> {
  const hasImages = messages.some((m) => (m.images?.length ?? 0) > 0);
  const hasAudios = messages.some((m) => (m.audios?.length ?? 0) > 0);
  const meta = activeModelMeta();
  const mods = getActiveModalities();

  if ((hasImages || hasAudios) && !meta.multimodal) {
    throw new Error(
      "This model does not support multimodal input. Switch to Gemma 4 E4B QAT or Gemma 4 12B QAT."
    );
  }
  if (hasImages && !mods.image) {
    throw new Error("Loaded model does not accept images.");
  }
  if (hasAudios && !mods.audio && !meta.multimodal) {
    throw new Error(
      "Loaded model does not accept audio. Try reloading Gemma 4 with mmproj, or attach images instead."
    );
  }

  const eng = await ensureEngine(onProgress);
  busy = true;
  const epoch = loadEpoch;
  const stream = options.stream !== false && typeof options.onToken === "function";

  try {
    onProgress?.({ progress: 0.98, text: "Generating…" });

    const payload =
      meta.backend === "webllm"
        ? messages.map((m) => ({ role: m.role, content: m.content }))
        : messages;

    if (stream) {
      const asyncChunk = (await eng.chat.completions.create({
        messages: payload,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1024,
        stream: true,
        stream_options: { include_usage: false },
      })) as AsyncIterable<{
        choices?: Array<{ delta?: { content?: string } }>;
      }>;

      let full = "";
      for await (const chunk of asyncChunk) {
        if (epoch !== loadEpoch || options.signal?.aborted) {
          await interruptIfPossible();
          throw new Error("Generation cancelled.");
        }
        const delta = chunk.choices?.[0]?.delta?.content ?? "";
        if (!delta) continue;
        full += delta;
        options.onToken?.(delta, full);
      }
      return full.trim();
    }

    const reply = (await eng.chat.completions.create({
      messages: payload,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
      stream: false,
    })) as { choices?: Array<{ message?: { content?: string } }> };

    if (epoch !== loadEpoch || options.signal?.aborted) {
      throw new Error("Generation cancelled.");
    }
    return reply.choices?.[0]?.message?.content?.trim() ?? "";
  } finally {
    busy = false;
  }
}
