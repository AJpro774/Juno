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
  activeModelMeta,
  cancelPending,
  completeChat,
  defaultPromptForMedia,
  ensureEngine,
  fileToDataUrl,
  getActiveModalities,
  getQuant,
  getScaleId,
  hasWebGpu,
  hubUnavailableMessage,
  isEngineBusy,
  isEngineReady,
  KUNO_SCALE_TIERS,
  setQuant,
  setScaleId,
  scaleOptionLabel,
  unloadEngine,
  videoFileToFrames,
  type ChatMessage,
  type KunoQuant,
  type KunoScaleId,
  type LoadProgress,
} from "./kuno-engine";

const SYSTEM_PROMPT: ChatMessage = {
  role: "system",
  content:
    "You are Kuni, a helpful local multimodal assistant on KunoEngine. Be concise and practical. You run fully on-device. When images or video frames are provided, reason about them carefully.",
};

let sessions: Session[] = [];
let active: Session | null = null;
let sending = false;
let pendingImages: string[] = [];

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
  scale: document.getElementById("scale-select") as HTMLSelectElement,
  note: document.getElementById("model-note")!,
  list: document.getElementById("session-list")!,
  quantSwitch: document.getElementById("quant-switch")!,
  attach: document.getElementById("btn-attach") as HTMLButtonElement,
  mediaInput: document.getElementById("media-input") as HTMLInputElement,
  attachPreview: document.getElementById("attach-preview")!,
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

function modalityLabel(): string {
  return getActiveModalities().image ? "image" : "";
}

function refreshStatus(): void {
  const meta = activeModelMeta();
  const needsGpu = meta.backend === "webllm";
  if (needsGpu && !hasWebGpu()) {
    els.status.textContent = "No WebGPU";
    els.send.disabled = true;
    els.load.disabled = true;
    els.attach.disabled = sending;
    return;
  }
  if (sending || isEngineBusy()) {
    els.status.textContent = isEngineReady() ? "Generating…" : "Downloading…";
  } else if (isEngineReady()) {
    const multi = modalityLabel();
    els.status.textContent = multi
      ? `Ready · ${meta.statusLabel} · ${multi}`
      : `Ready · ${meta.statusLabel}`;
  } else {
    els.status.textContent = "Model not loaded";
  }
  els.send.disabled = sending;
  els.load.disabled = sending;
  els.cancel.hidden = !(sending || isEngineBusy());
  els.attach.disabled = sending;
  els.attach.title = meta.multimodal
    ? "Attach image or video (frames)"
    : "Attach images (requires Gemma 4 E4B QAT)";
}

function syncQuantButtons(): void {
  const q = getQuant();
  for (const btn of els.quantSwitch.querySelectorAll<HTMLButtonElement>(".quant-btn")) {
    btn.classList.toggle("is-active", btn.dataset.quant === q);
  }
}

function fillScaleSelect(): void {
  els.scale.innerHTML = "";
  const current = getScaleId();
  const quant = getQuant();
  for (const tier of KUNO_SCALE_TIERS) {
    const el = document.createElement("option");
    el.value = tier.id;
    el.textContent = scaleOptionLabel(tier.id, quant);
    if (tier.id === current) el.selected = true;
    els.scale.appendChild(el);
  }
  els.note.textContent = activeModelMeta().note;
  syncQuantButtons();
  renderAttachPreview();
  refreshStatus();
}

function onSelectionChanged(): void {
  if (!activeModelMeta().multimodal) {
    pendingImages = [];
  }
  fillScaleSelect();
  // Drop the previous engine so modalities / status match the new selection.
  void unloadEngine().then(refreshStatus);
}

function renderAttachPreview(): void {
  els.attachPreview.innerHTML = "";
  if (!pendingImages.length) {
    els.attachPreview.hidden = true;
    return;
  }
  els.attachPreview.hidden = false;

  pendingImages.forEach((src, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "attach-thumb-wrap";
    const img = document.createElement("img");
    img.src = src;
    img.alt = `Image ${idx + 1}`;
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "ghost tight attach-remove";
    rm.textContent = "×";
    rm.addEventListener("click", () => {
      pendingImages = pendingImages.filter((_, i) => i !== idx);
      renderAttachPreview();
    });
    wrap.append(img, rm);
    els.attachPreview.appendChild(wrap);
  });
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
      images: m.images,
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
  const meta = activeModelMeta();
  if (meta.backend === "hub") {
    const msg =
      meta.hub != null
        ? hubUnavailableMessage(meta.hub, meta.modelName)
        : `${meta.modelName} cannot load in-browser — pick a WebLLM or Gemma 4 E4B tier.`;
    els.log.querySelector(".empty-hint")?.remove();
    appendBubble(els.log, "system", msg);
    setProgress(null);
    refreshStatus();
    return;
  }
  if (meta.backend === "webllm" && !hasWebGpu()) {
    appendBubble(
      els.log,
      "system",
      "WebGPU is required for WebLLM models. Use Chrome/Edge 113+."
    );
    refreshStatus();
    return;
  }
  try {
    refreshStatus();
    await ensureEngine(setProgress);
    setProgress(null);
    const loaded = activeModelMeta();
    const multi = modalityLabel();
    appendBubble(
      els.log,
      "system",
      multi
        ? `KunoEngine ready — ${loaded.label} (${multi})`
        : `KunoEngine ready — ${loaded.label}`
    );
  } catch (e) {
    setProgress(null);
    appendBubble(els.log, "system", e instanceof Error ? e.message : String(e));
  } finally {
    refreshStatus();
  }
}

function formatChatError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const name = e instanceof Error ? e.name : "";
  if (/\(ABORT\)/i.test(msg) || name === "RuntimeError") {
    return (
      "Model runtime crashed (WASM abort) — often memory pressure with GGUF + mmproj. " +
      "Try Gemma 4 E4B · MXFP6, fewer/smaller images, or Llama 3.1 8B / Gemma 2 9B for text-only. " +
      "Large GGUFs may need a desktop build or ≤512MB shards."
    );
  }
  if (/Media marker is undefined/i.test(msg)) {
    return "Multimodal marker missing — reload Gemma 4 E4B so mmproj initializes, then attach images again.";
  }
  if (/Operation aborted|Generation cancelled|load cancelled/i.test(msg)) {
    return "Cancelled.";
  }
  return msg;
}

async function onSend(text: string): Promise<void> {
  if (!active) createSession();
  if (!active || sending) return;
  const prompt = text.trim();
  const images = [...pendingImages];
  if (!prompt && images.length === 0) return;

  const mods = getActiveModalities();
  if (images.length && !activeModelMeta().multimodal) {
    appendBubble(els.log, "system", "Image input requires Gemma 4 E4B QAT.");
    return;
  }
  if (images.length && !mods.image) {
    appendBubble(els.log, "system", "This loaded model does not accept images.");
    return;
  }

  if (!isEngineReady()) {
    await loadModel();
    if (!isEngineReady()) return;
  }

  if (active.messages.length === 0) {
    active.title = titleFromPrompt(prompt, images.length > 0);
  }

  if (els.log.querySelector(".empty-hint")) clearLog(els.log);

  const userMsg: ChatMessage = {
    role: "user",
    content: prompt || defaultPromptForMedia(images.length, 0),
    ...(images.length ? { images } : {}),
  };
  active.messages.push(userMsg);
  appendBubble(els.log, "user", userMsg.content, { images });
  els.prompt.value = "";
  pendingImages = [];
  renderAttachPreview();
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
    const msg = formatChatError(e);
    assistantBubble.className = "ai-bubble ai-bubble-system";
    assistantBubble.textContent = msg;
  } finally {
    setProgress(null);
    sending = false;
    refreshStatus();
  }
}

async function onPickMedia(files: FileList | null): Promise<void> {
  if (!files?.length) return;
  const mods = getActiveModalities();
  const multi = activeModelMeta().multimodal;
  if (!multi) {
    appendBubble(els.log, "system", "Pick Gemma 4 E4B QAT for images.");
    return;
  }

  for (const file of Array.from(files)) {
    try {
      if (file.type.startsWith("image/")) {
        if (!mods.image) {
          appendBubble(els.log, "system", "Loaded model does not accept images.");
          continue;
        }
        if (pendingImages.length >= 6) continue;
        pendingImages.push(await fileToDataUrl(file));
      } else if (file.type.startsWith("video/")) {
        if (!mods.image) {
          appendBubble(els.log, "system", "Video frames need image modality.");
          continue;
        }
        const frames = await videoFileToFrames(file, 3);
        for (const frame of frames) {
          if (pendingImages.length >= 6) break;
          pendingImages.push(frame);
        }
        appendBubble(
          els.log,
          "system",
          `Video “${file.name}” → ${frames.length} frame(s) attached as images.`
        );
      } else if (file.type.startsWith("audio/")) {
        appendBubble(els.log, "system", "Audio is not supported — attach images or video frames.");
      }
    } catch (e) {
      appendBubble(els.log, "system", e instanceof Error ? e.message : String(e));
    }
  }
  renderAttachPreview();
  els.mediaInput.value = "";
}

function siteHref(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  if (path.startsWith("/")) return path;
  return `${base}${path}`.replace(/\/{2,}/g, "/");
}

function boot(): void {
  const download = document.getElementById("link-download") as HTMLAnchorElement | null;
  if (download) download.href = siteHref("download/");

  const switchKuni = document.querySelector(
    ".app-switch-btn.is-active"
  ) as HTMLAnchorElement | null;
  if (switchKuni) switchKuni.href = siteHref("");

  fillScaleSelect();
  sessions = loadSessions();
  const want = getActiveId();
  active = sessions.find((s) => s.id === want) ?? sessions[0] ?? null;
  if (!active) createSession();
  else {
    renderSessionList();
    renderActiveMessages();
  }

  if (!hasWebGpu()) {
    appendBubble(
      els.log,
      "system",
      "No WebGPU — WebLLM tiers need Chrome/Edge 113+."
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

  els.prompt.addEventListener("paste", (ev) => {
    const items = ev.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (!files.length) return;
    ev.preventDefault();
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    void onPickMedia(dt.files);
  });

  els.form.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    els.form.classList.add("is-drop-target");
  });
  els.form.addEventListener("dragleave", () => els.form.classList.remove("is-drop-target"));
  els.form.addEventListener("drop", (ev) => {
    ev.preventDefault();
    els.form.classList.remove("is-drop-target");
    void onPickMedia(ev.dataTransfer?.files ?? null);
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
  els.scale.addEventListener("change", () => {
    setScaleId(els.scale.value as KunoScaleId);
    onSelectionChanged();
  });
  els.quantSwitch.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>(".quant-btn");
    if (!btn?.dataset.quant) return;
    setQuant(btn.dataset.quant as KunoQuant);
    onSelectionChanged();
  });
  els.attach.addEventListener("click", () => {
    if (!activeModelMeta().multimodal) {
      appendBubble(els.log, "system", "Pick Gemma 4 E4B QAT for images.");
      return;
    }
    els.mediaInput.click();
  });
  els.mediaInput.addEventListener("change", () => void onPickMedia(els.mediaInput.files));

  refreshStatus();
}

boot();
