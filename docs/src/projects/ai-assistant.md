# Optional AI assistant

The Juni IDE can run a **fully optional**, **off-by-default** local coding assistant in the browser:

- **Engine:** [WebLLM](https://github.com/mlc-ai/web-llm) (WebGPU)
- **Default model:** Qwen2.5-Coder-1.5B-Instruct (MLC q4) — best Juni grounding for the download size
- **Picker:** Coder 1.5B (default), Coder 3B (stronger, larger), Instruct 1.5B (general chat)
- **RAG grounding:** keyword chunks over Juni docs/APIs (ECS, 3D/`world_draw3d`, physics, scripts, desktop LSP, assets) injected into the system prompt
- **No cloud API** — weights download from the model CDN only after you click **Enable**

Legacy 0.5B model ids are auto-upgraded to the Coder 1.5B default.

## Enable

1. Open the IDE (see `RunJuniEditor.command` or `cd ide && npm run dev`)
2. Click **AI: Off** in the toolbar
3. Pick a model (optional) → click **Enable & download**
4. Wait for the progress line to reach **Ready**

Disable anytime with **Disable** (unloads the engine and clears the enable flag).

## Features

| Feature | How |
|---------|-----|
| Chat | Ask Juni / engine questions in the AI panel (docs RAG + cheat sheet) |
| Autocorrect | Select code → lightbulb **Suggest fix (local AI)** or context menu → review Apply/Dismiss |
| Debug | After a failed compile, **Explain with AI** on the console (or in the AI panel) |
| Insert | **Insert into editor** / Replace selection / New file from fenced Juni replies |

## Requirements

- A browser with **WebGPU** (Chrome or Edge recommended)
- Enough free disk/VRAM for a ~300–800 MB quantized model (cached after first download)
- Explicit opt-in — the IDE never loads WebLLM while AI is off

## Privacy

- Inference runs **locally** in your tab
- No Juni telemetry
- Network use is limited to the **user-initiated** model download/cache via WebLLM

## Limitations

A 1.5B–3B coder model is better at Juni-only answers than tiny instruct models, but still not a substitute for the compiler. Prefer `juni check` / Run diagnostics as source of truth. The assistant is instructed never to answer with Unity/C# and not to invent host APIs; see [Engine intrinsics](../engine/intrinsics.md). If an old chat drifted off-topic, click **Clear chat** after upgrading.

## Desktop

The Tauri shell hosts the same IDE. WebGPU availability depends on the OS webview — prefer Chrome/Edge via `RunJuniEditor.command` if the desktop app reports **No WebGPU**.
