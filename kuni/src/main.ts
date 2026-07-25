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
    "You are Kuni, a helpful local multimodal assistant on KunoEngine. Be concise and practical. You run fully on-device. When images, audio, or video frames are provided, reason about them carefully. For voice turns, reply in short spoken sentences (1–3 sentences) without markdown.",
};

const VOICE_TURN_PROMPT =
  "Listen to my audio and reply conversationally in one to three short spoken sentences. No markdown, no bullet lists.";

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

function getSpeechRecognitionCtor(): (new () => SpeechRec) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

let sessions: Session[] = [];
let active: Session | null = null;
let sending = false;
let pendingImages: string[] = [];
let pendingAudios: string[] = [];
let micRecorder: MediaRecorder | null = null;
let micChunks: Blob[] = [];
let micRecording = false;
/** Continuous conversation: listen → reply → speak → listen again. */
let voiceMode = false;
let voiceAwaitingReply = false;
let voiceListening = false;
let voiceSpeechRec: SpeechRec | null = null;
let voiceListenGeneration = 0;

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
  voice: document.getElementById("btn-voice") as HTMLButtonElement,
  mic: document.getElementById("btn-mic") as HTMLButtonElement,
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
  const m = getActiveModalities();
  const parts = [m.image ? "image" : null, m.audio ? "audio" : null].filter(Boolean);
  return parts.length ? parts.join("+") : "";
}

function refreshStatus(): void {
  const meta = activeModelMeta();
  const mods = getActiveModalities();
  const needsGpu = meta.backend === "webllm";
  if (needsGpu && !hasWebGpu()) {
    els.status.textContent = "No WebGPU";
    els.send.disabled = true;
    els.load.disabled = true;
    els.attach.disabled = sending;
    els.voice.hidden = false;
    els.voice.disabled = false;
    els.mic.hidden = false;
    els.mic.disabled = sending;
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
  // Always keep compose media controls clickable; handlers validate the selected model.
  els.attach.disabled = sending;
  els.attach.title = meta.multimodal
    ? "Attach image, audio, or video (frames)"
    : "Attach media (requires Gemma 4 E4B/12B QAT)";
  els.voice.hidden = false;
  els.voice.disabled = sending && !voiceMode;
  els.voice.classList.toggle("is-active", voiceMode);
  els.voice.textContent = voiceMode ? "Voice · on" : "Voice";
  els.voice.title = voiceMode
    ? "Voice conversation on — speak naturally; tap Voice to exit"
    : "Start back-and-forth voice conversation";
  els.mic.hidden = false;
  els.mic.disabled = sending || voiceAwaitingReply || (voiceMode && voiceListening);
  if (voiceMode) {
    els.mic.title = voiceListening
      ? "Listening… tap Stop to send early"
      : micRecording
        ? "Stop speaking (sends your turn)"
        : "Listening will resume after Kuni speaks";
    els.mic.textContent = voiceListening || micRecording ? "Listening…" : "…";
  } else {
    els.mic.title =
      mods.audio || meta.multimodal
        ? "Record audio attachment"
        : "Record audio (requires Gemma 4 E4B/12B QAT)";
    els.mic.textContent = micRecording ? "Stop" : "Mic";
  }
  els.mic.classList.toggle("is-recording", micRecording || voiceListening);
  els.mic.classList.toggle("is-voice-mode", voiceMode);

  if (voiceMode) {
    if (voiceListening) els.status.textContent = "Listening…";
    else if (voiceAwaitingReply || sending) els.status.textContent = "Thinking…";
    else els.status.textContent = "Speaking…";
  }
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
    pendingAudios = [];
    if (micRecording && micRecorder) micRecorder.stop();
    setVoiceMode(false);
  }
  fillScaleSelect();
  // Drop the previous engine so modalities / status match the new selection.
  void unloadEngine().then(refreshStatus);
}

function renderAttachPreview(): void {
  els.attachPreview.innerHTML = "";
  if (!pendingImages.length && !pendingAudios.length) {
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

  pendingAudios.forEach((src, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "attach-audio-wrap";
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = src;
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "ghost tight attach-remove";
    rm.textContent = "×";
    rm.addEventListener("click", () => {
      pendingAudios = pendingAudios.filter((_, i) => i !== idx);
      renderAttachPreview();
    });
    wrap.append(audio, rm);
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
      audios: m.audios,
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
        : `${meta.modelName} is a Hugging Face hub checkpoint and cannot load in-browser.`;
    appendBubble(els.log, "system", msg);
    setProgress(null);
    refreshStatus();
    return;
  }
  if (meta.backend === "webllm" && !hasWebGpu()) {
    appendBubble(
      els.log,
      "system",
      "WebGPU is required for WebLLM models. Pick a Gemma 4 QAT GGUF model or use Chrome/Edge 113+."
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

async function onSend(
  text: string,
  opts: { speakReply?: boolean; voiceTurn?: boolean } = {}
): Promise<void> {
  if (!active) createSession();
  if (!active || sending) return;
  const prompt = text.trim();
  const images = [...pendingImages];
  const audios = [...pendingAudios];
  if (!prompt && images.length === 0 && audios.length === 0) return;

  const mods = getActiveModalities();
  if ((images.length || audios.length) && !activeModelMeta().multimodal) {
    appendBubble(
      els.log,
      "system",
      "Multimodal input requires Gemma 4 E4B QAT or Gemma 4 12B QAT."
    );
    return;
  }
  if (images.length && !mods.image) {
    appendBubble(els.log, "system", "This loaded model does not accept images.");
    return;
  }
  if (audios.length && !mods.audio && !activeModelMeta().multimodal) {
    appendBubble(els.log, "system", "This loaded model does not accept audio.");
    return;
  }

  if (!isEngineReady()) {
    await loadModel();
    if (!isEngineReady()) return;
  }

  if (active.messages.length === 0) {
    active.title = titleFromPrompt(prompt, images.length + audios.length > 0);
  }

  if (els.log.querySelector(".empty-hint")) clearLog(els.log);

  const userMsg: ChatMessage = {
    role: "user",
    content:
      prompt ||
      (opts.voiceTurn ? VOICE_TURN_PROMPT : defaultPromptForMedia(images.length, audios.length)),
    ...(images.length ? { images } : {}),
    ...(audios.length ? { audios } : {}),
  };
  active.messages.push(userMsg);
  appendBubble(els.log, "user", userMsg.content, { images, audios });
  els.prompt.value = "";
  pendingImages = [];
  pendingAudios = [];
  renderAttachPreview();
  persist();
  renderSessionList();

  sending = true;
  if (opts.voiceTurn) voiceAwaitingReply = true;
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
        temperature: opts.voiceTurn ? 0.6 : 0.7,
        maxTokens: opts.voiceTurn ? 256 : 1024,
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
    if (opts.speakReply || voiceMode) {
      await speakText(stripForSpeech(full));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assistantBubble.className = "ai-bubble ai-bubble-system";
    assistantBubble.textContent = msg;
    if (/Media marker is undefined/i.test(msg)) {
      appendBubble(
        els.log,
        "system",
        "Multimodal marker was missing — try Load model again so mmproj initializes. Voice/media needs Gemma 4 with mmproj."
      );
    }
  } finally {
    setProgress(null);
    sending = false;
    voiceAwaitingReply = false;
    refreshStatus();
    if (voiceMode) {
      // Continue the conversation after Kuni finishes speaking / errors out.
      queueMicrotask(() => {
        if (voiceMode && !sending && !voiceListening && !micRecording) {
          void startVoiceListen();
        }
      });
    }
  }
}

function stripForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/[#*_>~\[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function speakText(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!text || typeof speechSynthesis === "undefined") {
      resolve();
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

function stopSpeech(): void {
  try {
    speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

function stopVoiceListen(): void {
  voiceListenGeneration += 1;
  voiceListening = false;
  if (voiceSpeechRec) {
    try {
      voiceSpeechRec.onresult = null;
      voiceSpeechRec.onerror = null;
      voiceSpeechRec.onend = null;
      voiceSpeechRec.abort();
    } catch {
      /* ignore */
    }
    voiceSpeechRec = null;
  }
  if (micRecording && micRecorder) {
    try {
      micRecorder.stop();
    } catch {
      /* ignore */
    }
  }
  refreshStatus();
}

function setVoiceMode(on: boolean): void {
  voiceMode = on;
  if (!on) {
    stopSpeech();
    stopVoiceListen();
    voiceAwaitingReply = false;
  }
  refreshStatus();
}

async function toggleVoiceMode(): Promise<void> {
  if (voiceMode) {
    setVoiceMode(false);
    appendBubble(els.log, "system", "Voice conversation off.");
    return;
  }
  if (!isEngineReady()) {
    await loadModel();
    if (!isEngineReady()) return;
  }
  setVoiceMode(true);
  const hasStt = Boolean(getSpeechRecognitionCtor());
  appendBubble(
    els.log,
    "system",
    hasStt
      ? "Voice conversation on — speak when you see Listening…. Kuni replies out loud, then listens again. Tap Voice to exit."
      : "Voice conversation on — browser speech recognition unavailable; using mic audio turns. Tap Voice to exit."
  );
  void startVoiceListen();
}

async function startVoiceListen(): Promise<void> {
  if (!voiceMode || sending || voiceAwaitingReply || voiceListening || micRecording) return;
  stopSpeech();

  const Rec = getSpeechRecognitionCtor();
  if (Rec) {
    await startSpeechRecognitionListen(Rec);
    return;
  }
  // Fallback: MediaRecorder push-to-auto (silence or max duration)
  await startMicFallbackListen();
}

async function startSpeechRecognitionListen(Rec: new () => SpeechRec): Promise<void> {
  const gen = ++voiceListenGeneration;
  const rec = new Rec();
  voiceSpeechRec = rec;
  rec.continuous = false;
  rec.interimResults = true;
  rec.lang = navigator.language || "en-US";
  let finalText = "";

  rec.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i]!;
      const t = r[0]?.transcript ?? "";
      if (r.isFinal) finalText += t;
      else interim += t;
    }
    const shown = (finalText || interim).trim();
    if (shown) els.status.textContent = `Listening… ${shown.slice(0, 48)}`;
  };

  rec.onerror = (ev) => {
    if (!voiceMode || gen !== voiceListenGeneration) return;
    const err = ev.error ?? "";
    if (err === "aborted" || err === "no-speech") {
      // Restart quietly — user may still be in conversation.
      voiceListening = false;
      voiceSpeechRec = null;
      refreshStatus();
      if (voiceMode && !sending) {
        window.setTimeout(() => {
          if (voiceMode && gen === voiceListenGeneration) void startVoiceListen();
        }, 350);
      }
      return;
    }
    voiceListening = false;
    voiceSpeechRec = null;
    appendBubble(els.log, "system", `Voice listen error: ${err || "unknown"}. Tap Voice to retry.`);
    refreshStatus();
  };

  rec.onend = () => {
    if (gen !== voiceListenGeneration) return;
    voiceListening = false;
    voiceSpeechRec = null;
    refreshStatus();
    const text = finalText.trim();
    if (!voiceMode) return;
    if (!text) {
      // Nothing heard — listen again.
      window.setTimeout(() => {
        if (voiceMode && !sending && !voiceAwaitingReply) void startVoiceListen();
      }, 280);
      return;
    }
    void onSend(text, { speakReply: true, voiceTurn: true });
  };

  try {
    voiceListening = true;
    refreshStatus();
    rec.start();
  } catch (e) {
    voiceListening = false;
    voiceSpeechRec = null;
    appendBubble(
      els.log,
      "system",
      e instanceof Error ? e.message : "Could not start speech recognition."
    );
    refreshStatus();
  }
}

async function startMicFallbackListen(): Promise<void> {
  if (!activeModelMeta().multimodal) {
    appendBubble(
      els.log,
      "system",
      "This browser has no speech recognition. Load Gemma 4 E4B/12B for mic-audio voice turns."
    );
    setVoiceMode(false);
    return;
  }
  // Auto-record up to ~8s then send; user can tap Listening…/Stop early via mic button.
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micChunks = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
    micRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const maxMs = 8000;
    const timer = window.setTimeout(() => {
      if (micRecording && micRecorder?.state === "recording") micRecorder.stop();
    }, maxMs);

    micRecorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) micChunks.push(ev.data);
    };
    micRecorder.onstop = async () => {
      window.clearTimeout(timer);
      micRecording = false;
      stream.getTracks().forEach((t) => t.stop());
      refreshStatus();
      const blob = new Blob(micChunks, { type: micRecorder?.mimeType || "audio/webm" });
      micChunks = [];
      micRecorder = null;
      if (!voiceMode || blob.size < 64) {
        if (voiceMode && !sending) {
          window.setTimeout(() => void startVoiceListen(), 400);
        }
        return;
      }
      const dataUrl = await fileToDataUrl(
        new File([blob], "recording.webm", { type: blob.type })
      );
      pendingAudios = [dataUrl];
      pendingImages = [];
      renderAttachPreview();
      void onSend(VOICE_TURN_PROMPT, { speakReply: true, voiceTurn: true });
    };
    micRecorder.start();
    micRecording = true;
    refreshStatus();
  } catch (e) {
    appendBubble(
      els.log,
      "system",
      e instanceof Error ? e.message : "Microphone permission denied."
    );
    setVoiceMode(false);
  }
}

async function toggleMic(): Promise<void> {
  // In voice mode, mic stops an in-progress listen/record early.
  if (voiceMode) {
    if (voiceListening && voiceSpeechRec) {
      try {
        voiceSpeechRec.stop();
      } catch {
        /* ignore */
      }
      return;
    }
    if (micRecording && micRecorder) {
      micRecorder.stop();
      return;
    }
    if (!sending && !voiceAwaitingReply) void startVoiceListen();
    return;
  }

  if (micRecording && micRecorder) {
    micRecorder.stop();
    return;
  }
  if (!activeModelMeta().multimodal) {
    appendBubble(
      els.log,
      "system",
      "Pick Gemma 4 E4B QAT or Gemma 4 12B QAT, then use Mic for audio."
    );
    return;
  }
  if (sending || voiceAwaitingReply) return;

  stopSpeech();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micChunks = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
    micRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    micRecorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) micChunks.push(ev.data);
    };
    micRecorder.onstop = async () => {
      micRecording = false;
      stream.getTracks().forEach((t) => t.stop());
      refreshStatus();
      const blob = new Blob(micChunks, { type: micRecorder?.mimeType || "audio/webm" });
      micChunks = [];
      micRecorder = null;
      if (blob.size < 64) return;
      const dataUrl = await fileToDataUrl(
        new File([blob], "recording.webm", { type: blob.type })
      );
      if (pendingAudios.length >= 4) return;
      pendingAudios.push(dataUrl);
      renderAttachPreview();
    };
    micRecorder.start();
    micRecording = true;
    refreshStatus();
  } catch (e) {
    appendBubble(
      els.log,
      "system",
      e instanceof Error ? e.message : "Microphone permission denied."
    );
  }
}

async function onPickMedia(files: FileList | null): Promise<void> {
  if (!files?.length) return;
  const mods = getActiveModalities();
  const multi = activeModelMeta().multimodal;
  if (!multi) {
    appendBubble(els.log, "system", "Pick Gemma 4 E4B QAT or Gemma 4 12B QAT for media.");
    return;
  }

  for (const file of Array.from(files)) {
    try {
      if (file.type.startsWith("image/") && mods.image) {
        if (pendingImages.length >= 6) continue;
        pendingImages.push(await fileToDataUrl(file));
      } else if (file.type.startsWith("audio/") && (mods.audio || multi)) {
        if (pendingAudios.length >= 4) continue;
        pendingAudios.push(await fileToDataUrl(file));
      } else if (file.type.startsWith("video/") && mods.image) {
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
      } else if (file.type.startsWith("video/") && !mods.image) {
        appendBubble(els.log, "system", "Video frames need image modality.");
      } else if (file.type.startsWith("audio/") && !mods.audio && !multi) {
        appendBubble(els.log, "system", "Loaded model does not accept audio.");
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
      "No WebGPU — WebLLM tiers need Chrome/Edge 113+. Gemma 4 QAT (wllama) still works, including multimodal."
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
      if (item.type.startsWith("image/") || item.type.startsWith("audio/")) {
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
      voiceAwaitingReply = false;
      stopSpeech();
      stopVoiceListen();
      setProgress(null);
      refreshStatus();
      if (voiceMode) void startVoiceListen();
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
      appendBubble(
        els.log,
        "system",
        "Pick Gemma 4 E4B QAT or Gemma 4 12B QAT for image / audio / video."
      );
      return;
    }
    els.mediaInput.click();
  });
  els.mediaInput.addEventListener("change", () => void onPickMedia(els.mediaInput.files));
  els.voice.addEventListener("click", () => void toggleVoiceMode());
  els.mic.addEventListener("click", () => void toggleMic());

  refreshStatus();
}

boot();
