import { marked } from "marked";
import type { ChatMessage } from "./kuno-engine";

export type Session = {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
};

const SESSIONS_KEY = "kuni.sessions.v1";
const ACTIVE_KEY = "kuni.activeSession";

marked.setOptions({ breaks: true, gfm: true });

export function newSession(): Session {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    createdAt: Date.now(),
    messages: [],
  };
}

export function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Session[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: Session[]): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    /* ignore — may fail if media data URLs are large */
  }
}

export function getActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function titleFromPrompt(text: string, hasMedia = false): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return hasMedia ? "Media chat" : "New chat";
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
}

export function renderMarkdown(text: string): string {
  try {
    return marked.parse(text, { async: false }) as string;
  } catch {
    return escapeHtml(text);
  }
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function appendBubble(
  log: HTMLElement,
  role: "user" | "assistant" | "system",
  text: string,
  opts: { markdown?: boolean; images?: string[]; audios?: string[] } = {}
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = `ai-bubble-wrap ai-bubble-wrap-${role}`;

  if (opts.images?.length) {
    const gallery = document.createElement("div");
    gallery.className = "bubble-images";
    for (const src of opts.images) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "Attached image";
      img.className = "bubble-image";
      gallery.appendChild(img);
    }
    wrap.appendChild(gallery);
  }

  if (opts.audios?.length) {
    const audios = document.createElement("div");
    audios.className = "bubble-audios";
    for (const src of opts.audios) {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = src;
      audio.className = "bubble-audio";
      audios.appendChild(audio);
    }
    wrap.appendChild(audios);
  }

  const bubble = document.createElement("div");
  bubble.className = `ai-bubble ai-bubble-${role}`;
  if (role === "assistant" && opts.markdown) {
    bubble.innerHTML = renderMarkdown(text);
  } else {
    bubble.textContent = text;
  }
  wrap.appendChild(bubble);
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
  return bubble;
}

export function clearLog(log: HTMLElement): void {
  log.innerHTML = "";
}

export function showEmptyHint(log: HTMLElement): void {
  clearLog(log);
  const hint = document.createElement("div");
  hint.className = "empty-hint";
  hint.innerHTML =
    "<strong>Pick a model</strong> and <strong>FP8 / MXFP6</strong>, then load.<br />Gemma 4 QAT is <strong>full multimodal</strong> — image, audio, and video frames.";
  log.appendChild(hint);
}
