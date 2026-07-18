/**
 * AI assistant side panel + toolbar status wiring.
 */

import {
  cancelPending,
  chat,
  disableAndUnload,
  ensureReady,
  explainDiagnostic,
  getAiModelId,
  hasCodeFence,
  hasWebGpu,
  isAiEnabled,
  isEngineBusy,
  isEngineReady,
  setAiEnabled,
  setAiModelId,
  stripCodeFences,
  subscribeAiSettings,
  type ChatMessage,
  type DiagLike,
  type LoadProgress,
} from "./agent";
import { ensureDocsIndexLoaded } from "./docs-rag";
import { AI_MODEL_OPTIONS, DEFAULT_MODEL_ID, modelOptionNote } from "./settings";
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
let opInFlight = false;

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

function cancelBtn(): HTMLButtonElement | null {
  return document.getElementById("ai-cancel") as HTMLButtonElement | null;
}

function sendBtn(): HTMLButtonElement | null {
  return document.getElementById("ai-send") as HTMLButtonElement | null;
}

function enableBtn(): HTMLButtonElement | null {
  return document.getElementById("ai-enable") as HTMLButtonElement | null;
}

function modelNoteEl(): HTMLElement | null {
  return document.getElementById("ai-model-note");
}

function updateModelNote(): void {
  const el = modelNoteEl();
  if (!el) return;
  const note = modelOptionNote(getAiModelId());
  el.textContent = note || "Coder 1.5B is the recommended default.";
}

function setBusyUi(busy: boolean): void {
  const cancel = cancelBtn();
  if (cancel) cancel.hidden = !busy;
  const send = sendBtn();
  if (send) send.disabled = busy || !isEngineReady();
  const enable = enableBtn();
  if (enable) enable.disabled = busy;
}

export function updateAiStatusLabel(): void {
  const el = statusEl();
  const btn = document.getElementById("ai-toggle") as HTMLButtonElement | null;
  if (!el) return;
  if (!hasWebGpu()) {
    el.textContent = "No WebGPU";
    if (btn) btn.textContent = "AI";
    setBusyUi(false);
    return;
  }
  if (!isAiEnabled()) {
    el.textContent = "Off";
    if (btn) btn.textContent = "AI: Off";
    setBusyUi(false);
    return;
  }
  if (opInFlight || isEngineBusy()) {
    el.textContent = isEngineReady() ? "Working…" : "Downloading…";
    if (btn) btn.textContent = "AI: Busy";
    setBusyUi(true);
    return;
  }
  if (isEngineReady()) {
    el.textContent = "Ready";
    if (btn) btn.textContent = "AI: Ready";
    setBusyUi(false);
    return;
  }
  el.textContent = "Enabled — download needed";
  if (btn) btn.textContent = "AI: On";
  setBusyUi(false);
  const send = sendBtn();
  if (send) send.disabled = true;
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

export async function enableAiWithDownload(): Promise<void> {
  if (!hasWebGpu()) {
    hooks?.logLine("AI requires WebGPU (Chrome/Edge).", "err");
    updateAiStatusLabel();
    return;
  }
  ensureDocsIndexLoaded();
  setAiEnabled(true);
  clearChatHistory();
  opInFlight = true;
  updateAiStatusLabel();
  const modelId = getAiModelId() || DEFAULT_MODEL_ID;
  try {
    await ensureReady((p) => {
      setProgress(p);
      updateAiStatusLabel();
    });
    setProgress(null);
    hooks?.logLine(`Local AI ready (${modelId.split("-Instruct")[0] ?? "model"}).`, "meta");
    appendChatBubble(
      "system",
      "Ready. Chat is project-aware: open file, selection, and diagnostics are included when you ask coding questions."
    );
  } catch (e) {
    setProgress(null);
    const msg = String(e);
    if (/cancell?ed/i.test(msg)) {
      hooks?.logLine("AI download cancelled.", "meta");
    } else {
      setAiEnabled(false);
      hooks?.logLine(msg, "err");
    }
  } finally {
    opInFlight = false;
  }
  updateAiStatusLabel();
}

export async function disableAi(): Promise<void> {
  opInFlight = false;
  await disableAndUnload();
  setProgress(null);
  updateAiStatusLabel();
  hooks?.logLine("Local AI disabled and unloaded.", "meta");
}

export async function cancelAiWork(): Promise<void> {
  await cancelPending();
  if (!isEngineReady()) {
    setAiEnabled(false);
    await unloadEngine();
  }
  opInFlight = false;
  setProgress(null);
  updateAiStatusLabel();
  hooks?.logLine("AI cancelled.", "meta");
  appendChatBubble("system", "Cancelled.");
}

export async function sendChatMessage(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || !hooks) return;
  if (!isAiEnabled() || !isEngineReady()) {
    hooks.logLine("Enable & download the local model first.", "meta");
    return;
  }
  appendChatBubble("user", trimmed);
  opInFlight = true;
  updateAiStatusLabel();
  try {
    const reply = await chat(history, trimmed, hooks.getExtraContext(), (p) => setProgress(p));
    setProgress(null);
    history.push({ role: "user", content: trimmed });
    history.push({ role: "assistant", content: reply });
    appendChatBubble("assistant", reply);
  } catch (e) {
    setProgress(null);
    const msg = String(e);
    if (/cancell?ed/i.test(msg)) {
      appendChatBubble("system", "Cancelled.");
    } else {
      appendChatBubble("system", msg);
      hooks.logLine(msg, "err");
    }
  } finally {
    opInFlight = false;
    updateAiStatusLabel();
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
  opInFlight = true;
  updateAiStatusLabel();
  try {
    const reply = await explainDiagnostic(hooks.getSource(), diags, (p) => setProgress(p));
    setProgress(null);
    history.push({ role: "user", content: "Explain last compile diagnostics." });
    history.push({ role: "assistant", content: reply });
    appendChatBubble("assistant", reply);
    hooks.logLine(reply, "ai");
  } catch (e) {
    setProgress(null);
    const msg = String(e);
    if (!/cancell?ed/i.test(msg)) hooks.logLine(msg, "err");
  } finally {
    opInFlight = false;
    updateAiStatusLabel();
  }
}

export function wireAiPanelDom(): void {
  ensureDocsIndexLoaded();

  const enableBtnEl = document.getElementById("ai-enable") as HTMLButtonElement | null;
  const disableBtn = document.getElementById("ai-disable") as HTMLButtonElement | null;
  const cancelBtnEl = document.getElementById("ai-cancel") as HTMLButtonElement | null;
  const sendBtnEl = document.getElementById("ai-send") as HTMLButtonElement | null;
  const input = document.getElementById("ai-input") as HTMLTextAreaElement | null;
  const clearBtn = document.getElementById("ai-clear") as HTMLButtonElement | null;
  const explainBtn = document.getElementById("ai-explain") as HTMLButtonElement | null;

  enableBtnEl?.addEventListener("click", () => {
    void enableAiWithDownload();
  });
  disableBtn?.addEventListener("click", () => {
    void disableAi();
  });
  cancelBtnEl?.addEventListener("click", () => {
    void cancelAiWork();
  });
  sendBtnEl?.addEventListener("click", () => {
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
    const current = getAiModelId();
    modelSel.value = current;
    if (modelSel.value !== current) {
      setAiModelId(DEFAULT_MODEL_ID);
      modelSel.value = DEFAULT_MODEL_ID;
    }
    updateModelNote();
    modelSel.addEventListener("change", () => {
      setAiModelId(modelSel.value);
      updateModelNote();
      void unloadEngine().then(() => {
        hooks?.logLine(
          `Model set to ${modelSel.value}. Click Enable & download to load it.`,
          "meta"
        );
        updateAiStatusLabel();
      });
    });
  }

  subscribeAiSettings(() => updateAiStatusLabel());
  updateAiStatusLabel();
}
