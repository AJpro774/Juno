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
| `src/kuno-engine/` | Engine wrapper around `@mlc-ai/web-llm` |
| Default model | `Llama-3.1-8B-Instruct-q4f32_1-MLC` (~6101 MB) |
| Runtime | WebGPU + WASM (MLC model libs) |

WebLLM’s public catalog does not yet ship native FP8 WebGPU builds; the default maps to the closest **~6GB** prebuilt. Swap `DEFAULT_MODEL_ID` in `src/kuno-engine/models.ts` when FP8 records land.

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
