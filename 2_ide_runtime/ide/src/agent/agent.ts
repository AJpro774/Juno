/**
 * Public facade for the optional local Juni AI assistant.
 * Safe when disabled: no WebLLM import until ensureReady / generate calls.
 */

import {
  hasWebGpu,
  isAiEnabled,
  setAiEnabled,
  getAiModelId,
  setAiModelId,
  subscribeAiSettings,
} from "./settings";
import {
  autocorrectPrompt,
  chatPrompt,
  explainDiagnosticsPrompt,
  stripCodeFences,
  type ChatMessage,
} from "./prompts";
import {
  completeChat,
  ensureEngine,
  isEngineReady,
  unloadEngine,
  type LoadProgress,
} from "./webllm-engine";

export type { ChatMessage, LoadProgress };
export {
  isAiEnabled,
  setAiEnabled,
  getAiModelId,
  setAiModelId,
  subscribeAiSettings,
  hasWebGpu,
  isEngineReady,
};
export { stripCodeFences, hasCodeFence } from "./prompts";

export type DiagLike = {
  severity?: string;
  line: number;
  col: number;
  message: string;
  file?: string;
};

export function formatDiagnostics(diags: DiagLike[]): string {
  return diags
    .map((d) => {
      const where = d.file ? `${d.file}:${d.line}:${d.col}` : `${d.line}:${d.col}`;
      return `${where} ${d.message}`;
    })
    .join("\n");
}

export async function ensureReady(onProgress?: (p: LoadProgress) => void): Promise<void> {
  if (!isAiEnabled()) throw new Error("AI assistant is disabled. Enable it in the AI panel.");
  if (!hasWebGpu()) {
    throw new Error("WebGPU is not available in this browser. Use Chrome/Edge with WebGPU enabled.");
  }
  await ensureEngine(onProgress);
}

export async function disableAndUnload(): Promise<void> {
  setAiEnabled(false);
  await unloadEngine();
}

export async function suggestFix(
  source: string,
  selection: string,
  diagnostics: DiagLike[] = [],
  onProgress?: (p: LoadProgress) => void
): Promise<string> {
  await ensureReady(onProgress);
  const text = await completeChat(
    autocorrectPrompt(source, selection, formatDiagnostics(diagnostics)),
    { temperature: 0.1, maxTokens: 400 },
    onProgress
  );
  return stripCodeFences(text);
}

export async function explainDiagnostic(
  source: string,
  diagnostics: DiagLike[],
  onProgress?: (p: LoadProgress) => void
): Promise<string> {
  await ensureReady(onProgress);
  return completeChat(
    explainDiagnosticsPrompt(source, formatDiagnostics(diagnostics)),
    { temperature: 0.2, maxTokens: 600 },
    onProgress
  );
}

export async function chat(
  history: ChatMessage[],
  userText: string,
  extraContext = "",
  onProgress?: (p: LoadProgress) => void
): Promise<string> {
  await ensureReady(onProgress);
  return completeChat(chatPrompt(history, userText, extraContext), {
    temperature: 0.15,
    maxTokens: 700,
  }, onProgress);
}
