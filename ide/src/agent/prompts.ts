/** Prompt templates for the optional local Juni AI assistant. */

import juniContext from "./juni-context.md?raw";
import { retrieveDocContext } from "./docs-rag";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function systemPrompt(): string {
  return `You are Juni Assist — a local helper ONLY for the Juni language and Juno game engine.

Hard rules:
- Stay on Juni / Juno. NEVER use Unity, Unreal, Godot, C#, C++, Python, JavaScript, or Three.js.
- Match the user's intent:
  - Greetings / chit-chat → one short friendly sentence. No code.
  - "Who are you" → one short sentence about Juni Assist. No code.
  - Coding / build / fix / explain → short Juni answer; use a \`\`\`juni fence when showing code.
- Prefer project editor context (open file, selection, diagnostics) when present.
- Use only APIs from the cheat sheet. If something is impossible, say so and give the closest Juni sketch.

${juniContext}`;
}

export function autocorrectPrompt(
  source: string,
  selection: string,
  diagnostics: string
): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt() },
    {
      role: "user",
      content: `Fix the selected Juni code. Reply with ONLY the corrected selection text — no markdown fences, no explanation.

Full file (context):
\`\`\`juni
${truncate(source, 4000)}
\`\`\`

Selected text to replace:
\`\`\`juni
${truncate(selection, 1500)}
\`\`\`

Nearby compiler diagnostics (may be empty):
${diagnostics || "(none)"}`,
    },
  ];
}

export function explainDiagnosticsPrompt(source: string, diagnostics: string): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt() },
    {
      role: "user",
      content: `Explain these Juni compile errors and suggest minimal Juni fixes (not Unity/C#).

Source:
\`\`\`juni
${truncate(source, 4000)}
\`\`\`

Diagnostics:
${diagnostics}`,
    },
  ];
}

/** Few-shot anchors: greetings stay short; code only when asked. */
const CHAT_SHOTS: ChatMessage[] = [
  {
    role: "user",
    content: "hello",
  },
  {
    role: "assistant",
    content: "Hi — I'm Juni Assist. Ask me about Juni or the Juno engine anytime.",
  },
  {
    role: "user",
    content: "Who are you?",
  },
  {
    role: "assistant",
    content:
      "I'm Juni Assist, a local helper for the Juni language and Juno engine. I stick to Juni APIs — never Unity or C#.",
  },
];

function looksLikeCodingRequest(text: string): boolean {
  return /\b(code|build|make|create|write|fix|spin|mesh|scene|fn |frame|compile|error|implement|example|script|program|borrow|ref |physics|rigidbody|collider|search|anim)\b/i.test(
    text
  );
}

export function chatPrompt(
  history: ChatMessage[],
  userText: string,
  extraContext: string
): ChatMessage[] {
  // WebLLM requires exactly one system message, and it must be first.
  let system = systemPrompt();
  const rag = retrieveDocContext(userText);
  if (rag) system += `\n\nRetrieved docs:\n${rag}`;
  if (extraContext.trim()) {
    const budget = looksLikeCodingRequest(userText) ? 3500 : 1800;
    system += `\n\nProject editor context:\n${truncate(extraContext, budget)}`;
  }
  const msgs: ChatMessage[] = [{ role: "system", content: system }, ...CHAT_SHOTS];
  for (const m of history.slice(-6)) {
    if (m.role === "user" || m.role === "assistant") msgs.push(m);
  }
  const reminder = looksLikeCodingRequest(userText)
    ? "Reply with Juni/Juno only (no Unity/C#). Use open file / selection / diagnostics when relevant. Show code only if it helps.\n\n"
    : "Reply briefly. Do not paste example programs unless asked for code.\n\n";
  msgs.push({
    role: "user",
    content: `${reminder}${userText}`,
  });
  return msgs;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n…(truncated)";
}

/** Strip markdown fences from model output for apply-as-code. */
export function stripCodeFences(text: string): string {
  let t = text.trim();
  const anyFence = /```(?:juni|wasm|rust|ts|js|typescript|javascript)?\s*\n([\s\S]*?)```/i;
  const m = t.match(anyFence);
  if (m) return m[1].replace(/\s+$/, "");
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:\w+)?\n?/, "").replace(/\n?```$/, "");
  }
  return t.trimEnd();
}

/** True when the reply contains a fenced code block worth inserting. */
export function hasCodeFence(text: string): boolean {
  return /```/.test(text);
}
