# Desktop IDE

Juni ships a **Tauri 2** desktop shell around the same Vite + Monaco IDE used in the browser. On desktop, project open/save and language services use native filesystem + `juni-lsp` instead of browser Folder Access / WASM completion-lite.

## Location

```
desktop/
  package.json
  app-icon.png          # source for `tauri icon`
  src-tauri/
    tauri.conf.json
    icons/              # platform icons (png / icns / ico)
```

## Development

```bash
cd ide && npm install && npm run build:wasm
cd ../desktop && npm install && npm run dev
```

`tauri dev` starts the IDE dev server and opens a native window with folder-picker integration.

## Features

- Native **Open Project** via `tauri-plugin-dialog`
- **Reliable project FS** — `load_project_files` / `read_project_file` / `write_project_file` read and write the whole tree (text + common binary assets as data URLs)
- **Richer LSP** through Tauri `lsp_request`:
  - `textDocument/completion`
  - `textDocument/definition`
  - `textDocument/hover`
  - `textDocument/diagnostic` (parse + type-check markers in Monaco)
- Browser fallback still uses **completion-lite** from in-browser WASM (`complete_source` / `goto_def_source`)

## Build (local)

```bash
cd desktop && npm run build
```

Produces a platform bundle under `desktop/src-tauri/target/release/bundle/`.

Bundle targets (see `tauri.conf.json`): **dmg** / **app** (macOS), **nsis** / **msi** (Windows), **AppImage** / **deb** (Linux).

## Multi-arch CI / GitHub Releases

Workflow: [`.github/workflows/release-desktop.yml`](../../.github/workflows/release-desktop.yml).

| Host | Arch |
|------|------|
| macOS | `aarch64-apple-darwin`, `x86_64-apple-darwin` |
| Windows | x86_64; ARM64 when `windows-11-arm` runners are available |
| Linux | x86_64 (`ubuntu-22.04`), aarch64 (`ubuntu-22.04-arm`) |

Triggers on **`v*`** tags (and manual `workflow_dispatch`). Artifacts upload to a **draft** GitHub Release via `tauri-apps/tauri-action`.

## Web download hub

The site at **`/download/`** (same IDE fonts/tokens) detects OS/arch and links to GitHub Releases asset placeholders (`/releases/latest` until a tag publishes matching files).

## Android = PWA (no APK in v9)

Install the **web IDE** as an app:

1. Open the IDE in Chrome (Android) or Safari (iOS).
2. **Add to Home Screen** / **Install app**.
3. Launch from the home-screen icon (standalone display via `manifest.webmanifest` + `sw.js`).

See the Android section on the [download page](/download/).

## Language server

For external editors, run the stdio server from a project root:

```bash
juni lsp
```

The server loads `juni.toml`, indexes `src/`, and provides completion, go-to-definition, **hover**, and **pull diagnostics**.
