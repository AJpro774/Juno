# Kuni

**Kuni** is a local AI chatbot built on **KunoEngine** — [WebLLM](https://webllm.mlc.ai/) + WASM model libraries, running entirely in the browser or a native shell. Default model profile targets **FP8 · ~6GB** GPU memory.

UI language matches the [Juni IDE](../ide/): parchment + forest green, Syne wordmark, JetBrains Mono for chat.

## Quick start

From the Juni IDE (recommended — one site, switch instantly):

```bash
cd /Users/caryn/Juno/ide
npm install
npm run dev
```

Open http://localhost:5173 — use the **Juni | Kuni** switcher in the header (or http://localhost:5173/kuni/).

Standalone Kuni:

```bash
cd /Users/caryn/Juno/kuni
npm install
npm run dev
```

Open http://localhost:5174 — click **Load model**, then chat. First download is ~6GB and caches in the browser.

## KunoEngine

| Piece | Role |
|-------|------|
| `src/kuno-engine/` | Engine wrapper |
| WebLLM tiers | Llama / Qwen / Gemma 2 / 70B (MLC + WebGPU) |
| GGUF tiers | **Gemma 4 E4B QAT**, **Gemma 4 12B QAT** via wllama — full multimodal (image · audio · video→frames) with `mmproj-F16.gguf` |
| Quant switch | **FP8** / **MXFP6** (independent of scale; remaps WebLLM or GGUF file) |
| Default | Llama 3.1 8B · FP8 (WebLLM) |

Picker shows **model names only**. Unsloth GGUFs download from Hugging Face on first load (E4B ~3–4GB, 12B ~6.7GB). Files over ~2GB may fail in some browsers unless Memory64 / OPFS handles them — error text explains if so.

## Downloads

Marketing page: [`public/download/`](public/download/) — **APK**, **DMG**, **EXE**.

| Target | Tooling |
|--------|---------|
| `.dmg` / `.exe` | Tauri 2 — `kuni/desktop/` |
| `.apk` | Capacitor 7 — `npx cap add android` after `npm run build` |
| Web / PWA | Vite build + `manifest.webmanifest` |

```bash
# Desktop installers
cd kuni && npm run build
cd desktop && npm install && npm run build

# Android APK (once)
cd kuni && npm run build
npx cap add android
npm run android:sync
npm run android:open   # Android Studio → Build APK
```

## Layout

```
kuni/
  src/kuno-engine/   # WebLLM engine
  src/chat.ts        # sessions + bubbles
  src/main.ts        # app shell
  public/download/   # APK · DMG · EXE page
  desktop/           # Tauri shell
```

## Requirements

- Chromium with **WebGPU** (Chrome/Edge 113+)
- ~6GB free GPU / unified memory for the default profile
