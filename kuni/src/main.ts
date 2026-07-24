import "./style.css";
import {
  appendBubble,
  clearLog,
  getActiveId,
  loadSessions,
  newSession,
  renderMarkdown,
  saveSessions,
  setActiveId,
  showEmptyHint,
  titleFromPrompt,
  type Session,
} from "./chat";
import {
  cancelPending,
  completeChat,
  ensureEngine,
  getModelId,
  hasWebGpu,
  isEngineBusy,
  isEngineReady,
  KUNO_MODEL_OPTIONS,
  modelMeta,
  setModelId,
  type ChatMessage,
  type LoadProgress,
} from "./kuno-engine";

const SYSTEM_PROMPT: ChatMessage = {
  role: "system",
  content:
    "You are Kuni, a helpful local assistant running on KunoEngine (WebLLM + WASM). Be concise, clear, and practical. You run fully on-device — no cloud APIs.",
};

let sessions: Session[] = [];
let active: Session | null = null;
let sending = false;

const els = {
  status: document.getElementById("engine-status")!,
  progress: document.getElementById("progress")!,
  log: document.getElementById("chat-log")!,
  prompt: document.getElementById("prompt") as HTMLTextAreaElement,
  form: document.getElementById("compose") as HTMLFormElement,
  send: document.getElementById("btn-send") as HTMLButtonElement,
  load: document.getElementById("btn-load") as HTMLButtonElement,
  cancel: document.getElementById("btn-cancel") as HTMLButtonElement,
  clear: document.getElementById("btn-clear") as HTMLButtonElement,
  neu: document.getElementById("btn-new") as HTMLButtonElement,
  model: document.getElementById("model-select") as HTMLSelectElement,
  note: document.getElementById("model-note")!,
  list: document.getElementById("session-list")!,
};

function setProgress(p: LoadProgress | null): void {
  if (!p) {
    els.progress.hidden = true;
    els.progress.textContent = "";
    return;
  }
  els.progress.hidden = false;
  els.progress.textContent = `${p.text} (${Math.round(p.progress * 100)}%)`;
}

function refreshStatus(): void {
  if (!hasWebGpu()) {
    els.status.textContent = "No WebGPU";
    els.send.disabled = true;
    els.load.disabled = true;
    return;
  }
  if (sending || isEngineBusy()) {
    els.status.textContent = isEngineReady() ? "Generating…" : "Downloading…";
  } else if (isEngineReady()) {
    els.status.textContent = "Ready · FP8 · 6GB";
  } else {
    els.status.textContent = "Model not loaded";
  }
  els.send.disabled = sending || !isEngineReady();
  els.load.disabled = sending;
  els.cancel.hidden = !(sending || isEngineBusy());
}

function fillModelSelect(): void {
  els.model.innerHTML = "";
  const current = getModelId();
  for (const opt of KUNO_MODEL_OPTIONS) {
    const el = document.createElement("option");
    el.value = opt.id;
    el.textContent = opt.label;
    if (opt.id === current) el.selected = true;
    els.model.appendChild(el);
  }
  els.note.textContent = modelMeta(current).note;
}

function renderSessionList(): void {
  els.list.innerHTML = "";
  for (const s of sessions) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `session-item${active?.id === s.id ? " is-active" : ""}`;
    const title = document.createElement("span");
    title.textContent = s.title;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = new Date(s.createdAt).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    btn.append(title, meta);
    btn.addEventListener("click", () => selectSession(s.id));
    li.appendChild(btn);
    els.list.appendChild(li);
  }
}

function renderActiveMessages(): void {
  clearLog(els.log);
  if (!active || active.messages.length === 0) {
    showEmptyHint(els.log);
    return;
  }
  for (const m of active.messages) {
    if (m.role === "system") continue;
    appendBubble(els.log, m.role === "user" ? "user" : "assistant", m.content, {
      markdown: m.role === "assistant",
    });
  }
}

function persist(): void {
  saveSessions(sessions);
  if (active) setActiveId(active.id);
}

function selectSession(id: string): void {
  const found = sessions.find((s) => s.id === id);
  if (!found) return;
  active = found;
  setActiveId(id);
  renderSessionList();
  renderActiveMessages();
}

function createSession(): void {
  const s = newSession();
  sessions = [s, ...sessions];
  active = s;
  persist();
  renderSessionList();
  renderActiveMessages();
}

async function loadModel(): Promise<void> {
  if (!hasWebGpu()) {
    appendBubble(
      els.log,
      "system",
      "WebGPU is required. Open Kuni in Chrome/Edge 113+ (desktop) or a WebGPU-capable WebView."
    );
    refreshStatus();
    return;
  }
  try {
    refreshStatus();
    await ensureEngine(setProgress);
    setProgress(null);
    appendBubble(els.log, "system", `KunoEngine ready — ${modelMeta(getModelId()).label}`);
  } catch (e) {
    setProgress(null);
    appendBubble(els.log, "system", e instanceof Error ? e.message : String(e));
  } finally {
    refreshStatus();
  }
}

async function onSend(text: string): Promise<void> {
  if (!active) createSession();
  if (!active || sending) return;
  const prompt = text.trim();
  if (!prompt) return;

  if (!isEngineReady()) {
    await loadModel();
    if (!isEngineReady()) return;
  }

  if (active.messages.length === 0) {
    active.title = titleFromPrompt(prompt);
  }

  // Strip empty-hint if present
  if (els.log.querySelector(".empty-hint")) clearLog(els.log);

  active.messages.push({ role: "user", content: prompt });
  appendBubble(els.log, "user", prompt);
  els.prompt.value = "";
  persist();
  renderSessionList();

  sending = true;
  refreshStatus();

  const assistantBubble = appendBubble(els.log, "assistant", "…", { markdown: false });
  let full = "";

  try {
    const history: ChatMessage[] = [
      SYSTEM_PROMPT,
      ...active.messages.filter((m) => m.role !== "system"),
    ];
    const reply = await completeChat(
      history,
      {
        temperature: 0.7,
        maxTokens: 1024,
        stream: true,
        onToken: (_delta, all) => {
          full = all;
          assistantBubble.textContent = all || "…";
          els.log.scrollTop = els.log.scrollHeight;
        },
      },
      setProgress
    );
    full = reply || full;
    if (!full) full = "(no response)";
    assistantBubble.innerHTML = renderMarkdown(full);
    active.messages.push({ role: "assistant", content: full });
    persist();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assistantBubble.className = "ai-bubble ai-bubble-system";
    assistantBubble.textContent = msg;
  } finally {
    setProgress(null);
    sending = false;
    refreshStatus();
  }
}

function siteHref(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  if (path.startsWith("/")) {
    // Absolute site path (Juni home, etc.)
    return path;
  }
  const joined = `${base}${path}`.replace(/\/{2,}/g, "/");
  return joined;
}

function boot(): void {
  const download = document.getElementById("link-download") as HTMLAnchorElement | null;
  if (download) download.href = siteHref("download/");

  const switchKuni = document.querySelector(
    ".app-switch-btn.is-active"
  ) as HTMLAnchorElement | null;
  if (switchKuni) switchKuni.href = siteHref("");

  fillModelSelect();
  sessions = loadSessions();
  const want = getActiveId();
  active = sessions.find((s) => s.id === want) ?? sessions[0] ?? null;
  if (!active) {
    createSession();
  } else {
    renderSessionList();
    renderActiveMessages();
  }

  if (!hasWebGpu()) {
    appendBubble(
      els.log,
      "system",
      "This browser has no WebGPU. KunoEngine cannot load models here."
    );
  }

  els.form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void onSend(els.prompt.value);
  });

  els.prompt.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      void onSend(els.prompt.value);
    }
  });

  els.load.addEventListener("click", () => void loadModel());
  els.cancel.addEventListener("click", () => {
    void cancelPending().then(() => {
      sending = false;
      setProgress(null);
      refreshStatus();
    });
  });
  els.neu.addEventListener("click", () => createSession());
  els.clear.addEventListener("click", () => {
    if (!active) return;
    active.messages = [];
    active.title = "New chat";
    persist();
    renderSessionList();
    renderActiveMessages();
  });
  els.model.addEventListener("change", () => {
    setModelId(els.model.value);
    els.note.textContent = modelMeta(getModelId()).note;
    void cancelPending().then(refreshStatus);
  });

  refreshStatus();
}

boot();
