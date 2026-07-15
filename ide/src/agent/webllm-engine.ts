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
  unload: () => Promise<void>;
};

let engine: MlcEngine | null = null;
let loading: Promise<MlcEngine> | null = null;
let lastModelId = "";

export function isEngineReady(): boolean {
  return engine !== null;
}

export async function unloadEngine(): Promise<void> {
  loading = null;
  if (!engine) return;
  try {
    await engine.unload();
  } catch {
    /* ignore */
  }
  engine = null;
  lastModelId = "";
}

export async function ensureEngine(
  onProgress?: (p: LoadProgress) => void
): Promise<MlcEngine> {
  const modelId = getAiModelId();
  if (engine && lastModelId === modelId) return engine;
  if (loading) return loading;

  loading = (async () => {
    onProgress?.({ progress: 0.01, text: "Loading WebLLM…" });
    const webllm = await import("@mlc-ai/web-llm");
    onProgress?.({ progress: 0.05, text: `Downloading ${modelId}…` });

    const created = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (report: { progress: number; text: string }) => {
        onProgress?.({
          progress: Math.max(0.05, Math.min(1, report.progress)),
          text: report.text || `Loading ${modelId}…`,
        });
      },
    });

    engine = created as unknown as MlcEngine;
    lastModelId = modelId;
    onProgress?.({ progress: 1, text: "Ready" });
    return engine;
  })();

  try {
    return await loading;
  } catch (e) {
    loading = null;
    engine = null;
    throw e;
  } finally {
    loading = null;
  }
}

export async function completeChat(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number } = {},
  onProgress?: (p: LoadProgress) => void
): Promise<string> {
  const eng = await ensureEngine(onProgress);
  const reply = await eng.chat.completions.create({
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 512,
    stream: false,
  });
  return reply.choices[0]?.message?.content?.trim() ?? "";
}
