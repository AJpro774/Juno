# Desktop IDE

Juni v6 ships a **Tauri 2** desktop shell around the same Vite + Monaco IDE used in the browser.

## Location

```
desktop/
  package.json
  src-tauri/
```

## Development

```bash
cd ide && npm install && npm run build:wasm
cd ../desktop && npm install && npm run dev
```

`tauri dev` starts the IDE dev server and opens a native window with folder-picker integration.

## Features

- Native **Open Project** via `tauri-plugin-dialog`
- **LSP client hook** — desktop Monaco talks to `juni-lsp` through Tauri commands (`lsp_request`)
- Browser fallback uses **completion-lite** from in-browser WASM (`complete_source` / `goto_def_source`)

## Build

```bash
cd desktop && npm run build
```

Produces a platform bundle under `desktop/src-tauri/target/release/bundle/`.

## Language server

For external editors, run the stdio server from a project root:

```bash
juni lsp
```

The server loads `juni.toml`, indexes `src/`, and provides `textDocument/completion` and `textDocument/definition`.
