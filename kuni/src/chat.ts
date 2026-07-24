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
    /* ignore */
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

export function titleFromPrompt(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
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
  opts: { markdown?: boolean } = {}
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = `ai-bubble-wrap ai-bubble-wrap-${role}`;
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
    "<strong>Load the FP8 · 6GB model</strong>, then ask anything.<br />KunoEngine keeps inference on-device via WebLLM + WASM.";
  log.appendChild(hint);
}
