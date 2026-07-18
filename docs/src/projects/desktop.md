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

The matrix uses `fail-fast: false`. **Signing is optional and secrets-driven**: if macOS/Windows signing secrets are absent, that OS still builds **unsigned** installers and the rest of the matrix continues.

## Code signing / notarization (GitHub secrets)

Configure secrets under the repo **Settings → Secrets and variables → Actions**. Values are operator-side (Apple Developer / cert vendor / Azure); the workflow only wires them in when present.

### macOS (codesign + notarization)

Provide a **Developer ID Application** certificate as a base64 `.p12`, plus either Apple ID or App Store Connect API auth for notarization.

| Secret | Required when | Notes |
|--------|---------------|-------|
| `APPLE_CERTIFICATE` | signing | Base64 of exported `.p12` (`openssl base64 -A -in cert.p12 -out cert.txt`) |
| `APPLE_CERTIFICATE_PASSWORD` | signing | Password used when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | optional | Keychain identity string; inferred from the cert when omitted |
| `APPLE_ID` | notarize via Apple ID | Apple ID email |
| `APPLE_PASSWORD` | notarize via Apple ID | App-specific password |
| `APPLE_TEAM_ID` | notarize via Apple ID | 10-character Team ID |
| `APPLE_API_KEY` | notarize via API key | App Store Connect Key ID |
| `APPLE_API_ISSUER` | notarize via API key | Issuer UUID |
| `APPLE_API_PRIVATE_KEY` | notarize via API key | Contents of the `.p8` private key (workflow writes `APPLE_API_KEY_PATH`) |

If only `APPLE_CERTIFICATE` (+ password) is set, the app is **signed** but not notarized. For Gatekeeper-friendly downloads, also set one notarization auth method.

See [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/).

### Windows (Authenticode)

Choose **one** of:

1. **PFX + signtool** (OV/EV code-signing cert in the runner certificate store), or
2. **Azure Trusted Signing** (cloud certificate profile).

PFX takes priority when `WINDOWS_CERTIFICATE` is set.

| Secret | Path | Notes |
|--------|------|-------|
| `WINDOWS_CERTIFICATE` | PFX | Base64 of `.pfx` (`certutil -encode certificate.pfx out.txt` or `openssl base64 -A -in certificate.pfx`) |
| `WINDOWS_CERTIFICATE_PASSWORD` | PFX | Export password for the `.pfx` |
| `WINDOWS_TIMESTAMP_URL` | PFX optional | Defaults to `http://timestamp.digicert.com` |
| `AZURE_CLIENT_ID` | Azure | App registration client ID |
| `AZURE_CLIENT_SECRET` | Azure | App registration client secret |
| `AZURE_TENANT_ID` | Azure | Directory (tenant) ID |
| `AZURE_TRUSTED_SIGNING_ACCOUNT` | Azure | Trusted Signing account name |
| `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE` | Azure | Certificate profile name |
| `AZURE_TRUSTED_SIGNING_ENDPOINT` | Azure optional | Defaults to `https://wus2.codesigning.azure.net` (use your account’s region) |

The workflow patches `desktop/src-tauri/tauri.conf.json` **only for that CI job** (thumbprint or `signCommand`); the committed config stays unsigned-friendly.

See [Tauri Windows signing](https://v2.tauri.app/distribute/sign/windows/).

### Linux

No code-signing secrets are required for AppImage/deb in this workflow.

### After secrets are configured

Push or re-run a `v*` tag (or `workflow_dispatch`) so draft release assets are rebuilt signed. Secret material never belongs in the repo or in docs — only the secret **names** above.

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
