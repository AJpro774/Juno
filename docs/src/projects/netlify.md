# Deploy to Netlify

Host the **Juni IDE** (or a game export) as a static site on [Netlify](https://www.netlify.com/).

## IDE (recommended)

The repo root [`netlify.toml`](../../netlify.toml) builds the IDE. It supports **two layouts** (flat wins when both exist):

| Layout | When | Build | Publish |
|--------|------|-------|---------|
| **Flat** (canonical) | `ide/package.json` at repo root | `cd ide && npm install && npm run build` | `ide/dist` |
| **Nested** (legacy upload batches) | only if flat `ide/` is missing: `1_` / `2_` / `3_` folders | Sync CREDITS + docs into `2_ide_runtime`, build that `ide/`, copy dist → `ide/dist` | `ide/dist` |

Always publishes **`ide/dist`**. Prefer flat so Netlify does not ship a stale nested `2_ide_runtime` copy.

| Setting | Value |
|---------|--------|
| Base directory | *(empty)* |
| Build command | *(see `netlify.toml` — layout-aware)* |
| Publish directory | `ide/dist` |
| Asset base path | `/` (default Vite base) |

### Connect the repo

1. New site → Import from Git → this repository
2. Netlify reads `netlify.toml` automatically
3. Deploy

Or CLI (flat layout, from a full local clone):

```bash
# from repo root
npx netlify deploy --build --prod
```

### Base path vs GitHub Pages

| Host | Env | Vite `base` |
|------|-----|-------------|
| Netlify / local / `juni export-web` | unset / `GITHUB_PAGES=false` | `/` |
| GitHub Pages | `GITHUB_PAGES=true` | `/Juno/` |

Do **not** set `GITHUB_PAGES=true` on Netlify.

### WASM package

`ide/public/pkg` must contain a current `juni_wasm` build (under nested upload: `2_ide_runtime/ide/public/pkg`). The Netlify build does **not** run `wasm-pack` (keeps deploys fast). After compiler changes:

```bash
cd ide && npm run build:wasm
# commit ide/public/pkg, then push
```

GitHub Pages CI still runs `build:wasm` on every deploy — see [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml).

### SPA redirects

`netlify.toml` includes a `/* → /index.html` rewrite so refreshes on deep paths still serve the IDE shell. If you add a root `sitemap.xml`, the build copies it into `ide/public` so `/sitemap.xml` is a real static file (not swallowed by the SPA rewrite).

---

## Game export on Netlify

1. In the IDE, open a `juni.toml` project → **Export Web** (downloads a self-contained `*-web.zip` with `runtime/` included), **or** run `juni export-web` (writes `dist/web/` with runtime copied).
2. Unzip if needed. Create a Netlify site with **publish directory** = that folder (no build command), **or** drag-and-drop the folder in the Netlify UI.
3. For itch HTML game uploads (not the IDE), see [Export for web](export-web.md).

Minimal `netlify.toml` for a game-only site:

```toml
[build]
  publish = "."
  command = "echo 'static export'"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

## Troubleshooting

- **Blank IDE / wrong asset URLs** — confirm `GITHUB_PAGES` is not `true` in Netlify env.
- **Build can't find `ide/`** — flat clones need root `ide/`; batch uploads need the three `*_` folders so the nested branch of `netlify.toml` can run.
- **Compile fails in browser** — refresh `ide/public/pkg` with `npm run build:wasm`.
- **WebGPU / AI** — Chrome/Edge required; Netlify only hosts static files (inference still runs in the visitor’s browser).
