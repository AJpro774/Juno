/**
 * Lazy WebLLM engine wrapper. Dynamic-imports @mlc-ai/web-llm only when needed.
 */

import { getAiModelId } from "./settings";
import type { ChatMessage } from "./prompts";

export type LoadProgress = {
  progress: number;
  text: string;
};

type MlcEngine = {
  chat: {
    completions: {
      create: (req: {
        messages: ChatMessage[];
        temperature?: number;
        max_tokens?: number;
        stream?: boolean;
      }) => Promise<{ choices: Array<{ message?: { content?: string } }> }>;
    };
  };
  interruptGenerate?: () => void | Promise<void>;
  unload: () => Promise<void>;
};

let engine: MlcEngine | null = null;
let loading: Promise<MlcEngine> | null = null;
let lastModelId = "";
/** Bumped on cancel/unload so in-flight loads discard their result. */
let loadEpoch = 0;
let busy = false;

export function isEngineReady(): boolean {
  return engine !== null;
}

export function isEngineBusy(): boolean {
  return busy || loading !== null;
}

async function interruptIfPossible(): Promise<void> {
  if (!engine?.interruptGenerate) return;
  try {
    await engine.interruptGenerate();
  } catch {
    /* ignore */
  }
}

/** Cancel in-flight download/generate without necessarily unloading a ready engine. */
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
  const modelId = getAiModelId();
  if (engine && lastModelId === modelId) return engine;
  if (engine && lastModelId !== modelId) {
    await unloadEngine();
  }
  if (loading) return loading;

  const epoch = loadEpoch;
  loading = (async () => {
    onProgress?.({ progress: 0.01, text: "Loading WebLLM…" });
    const webllm = await import("@mlc-ai/web-llm");
    if (epoch !== loadEpoch) throw new Error("AI load cancelled.");
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
        await (created as MlcEngine).unload();
      } catch {
        /* ignore */
      }
      throw new Error("AI load cancelled.");
    }

    engine = created as unknown as MlcEngine;
    lastModelId = modelId;
    onProgress?.({ progress: 1, text: "Ready" });
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
  options: { temperature?: number; maxTokens?: number } = {},
  onProgress?: (p: LoadProgress) => void
): Promise<string> {
  const eng = await ensureEngine(onProgress);
  busy = true;
  const epoch = loadEpoch;
  try {
    onProgress?.({ progress: 0.95, text: "Generating…" });
    const reply = await eng.chat.completions.create({
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 512,
      stream: false,
    });
    if (epoch !== loadEpoch) throw new Error("AI generation cancelled.");
    return reply.choices[0]?.message?.content?.trim() ?? "";
  } finally {
    busy = false;
  }
}
