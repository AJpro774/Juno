# Desktop IDE

Juni ships a **Tauri 2** desktop shell around the same Vite + Monaco IDE used in the browser. On desktop, project open/save and language services use native filesystem + `juni-lsp` instead of browser Folder Access / WASM completion-lite.

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
- **Reliable project FS** — `load_project_files` / `read_project_file` / `write_project_file` read and write the whole tree (text + common binary assets as data URLs)
- **Richer LSP** through Tauri `lsp_request`:
  - `textDocument/completion`
  - `textDocument/definition`
  - `textDocument/hover`
  - `textDocument/diagnostic` (parse + type-check markers in Monaco)
- Browser fallback still uses **completion-lite** from in-browser WASM (`complete_source` / `goto_def_source`)

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

The server loads `juni.toml`, indexes `src/`, and provides completion, go-to-definition, **hover**, and **pull diagnostics**.
