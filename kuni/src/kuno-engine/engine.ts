/**
 * KunoEngine — local LLM runtime on WebLLM (WebGPU + WASM model libs).
 */

import { resolveModelId } from "./models";
import type { ChatMessage, CompleteOptions, LoadProgress } from "./types";

type MlcEngine = {
  chat: {
    completions: {
      create: (req: Record<string, unknown>) => Promise<unknown>;
    };
  };
  interruptGenerate?: () => void | Promise<void>;
  unload: () => Promise<void>;
};

const MODEL_KEY = "kuni.kuno.modelId";

let engine: MlcEngine | null = null;
let loading: Promise<MlcEngine> | null = null;
let lastModelId = "";
let loadEpoch = 0;
let busy = false;

export function hasWebGpu(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as Navigator & { gpu?: unknown }).gpu;
}

export function isEngineReady(): boolean {
  return engine !== null;
}

export function isEngineBusy(): boolean {
  return busy || loading !== null;
}

export function getModelId(): string {
  try {
    return resolveModelId(localStorage.getItem(MODEL_KEY));
  } catch {
    return resolveModelId(null);
  }
}

export function setModelId(modelId: string): void {
  const next = resolveModelId(modelId);
  try {
    localStorage.setItem(MODEL_KEY, next);
  } catch {
    /* ignore */
  }
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
  engine = null;
  lastModelId = "";
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
}

export async function ensureEngine(
  onProgress?: (p: LoadProgress) => void
): Promise<MlcEngine> {
  if (!hasWebGpu()) {
    throw new Error("WebGPU is required for KunoEngine. Use Chrome/Edge 113+ (or a Chromium WebView with WebGPU).");
  }

  const modelId = getModelId();
  if (engine && lastModelId === modelId) return engine;
  if (engine && lastModelId !== modelId) {
    await unloadEngine();
  }
  if (loading) return loading;

  const epoch = loadEpoch;
  loading = (async () => {
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
        await (created as unknown as MlcEngine).unload();
      } catch {
        /* ignore */
      }
      throw new Error("KunoEngine load cancelled.");
    }

    engine = created as unknown as MlcEngine;
    lastModelId = modelId;
    onProgress?.({ progress: 1, text: "KunoEngine ready" });
    return engine;
  })();

  try {
    return await loading;
  } catch (e) {
    if (epoch === loadEpoch) {
      engine = null;
      lastModelId = "";
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
  const eng = await ensureEngine(onProgress);
  busy = true;
  const epoch = loadEpoch;
  const stream = options.stream !== false && typeof options.onToken === "function";

  try {
    onProgress?.({ progress: 0.98, text: "Generating…" });

    if (stream) {
      const asyncChunk = (await eng.chat.completions.create({
        messages,
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
      messages,
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
