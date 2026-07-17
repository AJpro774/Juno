/**
 * AI assistant side panel + toolbar status wiring.
 */

import {
  chat,
  disableAndUnload,
  ensureReady,
  explainDiagnostic,
  getAiModelId,
  hasCodeFence,
  hasWebGpu,
  isAiEnabled,
  isEngineReady,
  setAiEnabled,
  setAiModelId,
  stripCodeFences,
  subscribeAiSettings,
  type ChatMessage,
  type DiagLike,
  type LoadProgress,
} from "./agent";
import { AI_MODEL_OPTIONS } from "./settings";
import { unloadEngine } from "./webllm-engine";

export type AiUiHooks = {
  getSource: () => string;
  getDiagnostics: () => DiagLike[];
  getExtraContext: () => string;
  applySource: (source: string) => void;
  applySelection: (source: string) => void;
  openScratch: (source: string, name?: string) => void;
  logLine: (text: string, cls?: string) => void;
  openPanel: () => void;
};

let hooks: AiUiHooks | null = null;
let history: ChatMessage[] = [];

export function setAiUiHooks(h: AiUiHooks): void {
  hooks = h;
}

export function getChatHistory(): ChatMessage[] {
  return history;
}

export function clearChatHistory(): void {
  history = [];
  const log = document.getElementById("ai-chat-log");
  if (log) log.innerHTML = "";
}

function statusEl(): HTMLElement | null {
  return document.getElementById("ai-status");
}

function progressEl(): HTMLElement | null {
  return document.getElementById("ai-progress");
}

export function updateAiStatusLabel(): void {
  const el = statusEl();
  const btn = document.getElementById("ai-toggle") as HTMLButtonElement | null;
  if (!el) return;
  if (!hasWebGpu()) {
    el.textContent = "No WebGPU";
    if (btn) btn.textContent = "AI";
    return;
  }
  if (!isAiEnabled()) {
    el.textContent = "Off";
    if (btn) btn.textContent = "AI: Off";
    return;
  }
  if (isEngineReady()) {
    el.textContent = "Ready";
    if (btn) btn.textContent = "AI: Ready";
    return;
  }
  el.textContent = "Enabled";
  if (btn) btn.textContent = "AI: On";
}

function setProgress(p: LoadProgress | null): void {
  const el = progressEl();
  if (!el) return;
  if (!p) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  const pct = Math.round(p.progress * 100);
  el.textContent = `${p.text} (${pct}%)`;
}

export async function enableAiWithDownload(): Promise<void> {
  if (!hasWebGpu()) {
    hooks?.logLine("AI requires WebGPU (Chrome/Edge).", "err");
    updateAiStatusLabel();
    return;
  }
  setAiEnabled(true);
  clearChatHistory();
  updateAiStatusLabel();
  try {
    await ensureReady((p) => {
      setProgress(p);
      updateAiStatusLabel();
    });
    setProgress(null);
    hooks?.logLine("Local AI ready (Qwen2.5-Coder-1.5B).", "meta");
  } catch (e) {
    setProgress(null);
    setAiEnabled(false);
    hooks?.logLine(String(e), "err");
  }
  updateAiStatusLabel();
}

export async function disableAi(): Promise<void> {
  await disableAndUnload();
  setProgress(null);
  updateAiStatusLabel();
  hooks?.logLine("Local AI disabled.", "meta");
}

function appendChatBubble(role: "user" | "assistant" | "system", text: string): void {
  const log = document.getElementById("ai-chat-log");
  if (!log) return;
  const wrap = document.createElement("div");
  wrap.className = `ai-bubble-wrap ai-bubble-wrap-${role}`;
  const div = document.createElement("div");
  div.className = `ai-bubble ai-bubble-${role}`;
  div.textContent = text;
  wrap.appendChild(div);
  if (role === "assistant" && hasCodeFence(text) && hooks) {
    const row = document.createElement("div");
    row.className = "ai-insert-row";
    const insertBtn = document.createElement("button");
    insertBtn.type = "button";
    insertBtn.className = "ghost tight ai-insert-btn";
    insertBtn.textContent = "Insert into editor";
    insertBtn.addEventListener("click", () => {
      const code = stripCodeFences(text);
      hooks?.applySource(code);
      hooks?.logLine("Inserted AI Juni code into editor (fences stripped).", "meta");
    });
    const selBtn = document.createElement("button");
    selBtn.type = "button";
    selBtn.className = "ghost tight ai-insert-btn";
    selBtn.textContent = "Replace selection";
    selBtn.addEventListener("click", () => {
      const code = stripCodeFences(text);
      hooks?.applySelection(code);
      hooks?.logLine("Replaced selection with AI code.", "meta");
    });
    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.className = "ghost tight ai-insert-btn";
    newBtn.textContent = "New file";
    newBtn.addEventListener("click", () => {
      const code = stripCodeFences(text);
      hooks?.openScratch(code, "ai-snippet.juni");
      hooks?.logLine("Opened AI snippet in a new tab.", "meta");
    });
    row.append(insertBtn, selBtn, newBtn);
    wrap.appendChild(row);
  }
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
}

export async function sendChatMessage(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || !hooks) return;
  appendChatBubble("user", trimmed);
  try {
    const reply = await chat(history, trimmed, hooks.getExtraContext(), (p) => setProgress(p));
    setProgress(null);
    history.push({ role: "user", content: trimmed });
    history.push({ role: "assistant", content: reply });
    appendChatBubble("assistant", reply);
  } catch (e) {
    setProgress(null);
    appendChatBubble("system", String(e));
    hooks.logLine(String(e), "err");
  }
}

export async function explainLastDiagnostics(): Promise<void> {
  if (!hooks) return;
  const diags = hooks.getDiagnostics();
  if (!diags.length) {
    hooks.logLine("No diagnostics to explain. Run a failing compile first.", "meta");
    return;
  }
  hooks.openPanel();
  try {
    const reply = await explainDiagnostic(hooks.getSource(), diags, (p) => setProgress(p));
    setProgress(null);
    history.push({ role: "user", content: "Explain last compile diagnostics." });
    history.push({ role: "assistant", content: reply });
    appendChatBubble("assistant", reply);
    hooks.logLine(reply, "ai");
  } catch (e) {
    setProgress(null);
    hooks.logLine(String(e), "err");
  }
}

export function wireAiPanelDom(): void {
  const enableBtn = document.getElementById("ai-enable") as HTMLButtonElement | null;
  const disableBtn = document.getElementById("ai-disable") as HTMLButtonElement | null;
  const sendBtn = document.getElementById("ai-send") as HTMLButtonElement | null;
  const input = document.getElementById("ai-input") as HTMLTextAreaElement | null;
  const clearBtn = document.getElementById("ai-clear") as HTMLButtonElement | null;
  const explainBtn = document.getElementById("ai-explain") as HTMLButtonElement | null;

  enableBtn?.addEventListener("click", () => {
    void enableAiWithDownload();
  });
  disableBtn?.addEventListener("click", () => {
    void disableAi();
  });
  sendBtn?.addEventListener("click", () => {
    if (!input) return;
    const v = input.value;
    input.value = "";
    void sendChatMessage(v);
  });
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const v = input.value;
      input.value = "";
      void sendChatMessage(v);
    }
  });
  clearBtn?.addEventListener("click", () => clearChatHistory());
  explainBtn?.addEventListener("click", () => {
    void explainLastDiagnostics();
  });

  const modelSel = document.getElementById("ai-model") as HTMLSelectElement | null;
  if (modelSel) {
    modelSel.innerHTML = "";
    for (const opt of AI_MODEL_OPTIONS) {
      const o = document.createElement("option");
      o.value = opt.id;
      o.textContent = opt.label;
      if (opt.note) o.title = opt.note;
      modelSel.appendChild(o);
    }
    modelSel.value = getAiModelId();
    modelSel.addEventListener("change", () => {
      setAiModelId(modelSel.value);
      void unloadEngine().then(() => {
        hooks?.logLine(`AI model set to ${modelSel.value}. Re-enable to download.`, "meta");
        updateAiStatusLabel();
      });
    });
  }

  subscribeAiSettings(() => updateAiStatusLabel());
  updateAiStatusLabel();
}
