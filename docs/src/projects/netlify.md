# Deploy to Netlify

Host the **Juni IDE** (or a game export) as a static site on [Netlify](https://www.netlify.com/).

## IDE (recommended)

The repo root [`netlify.toml`](../../netlify.toml) builds the IDE:

| Setting | Value |
|---------|--------|
| Base directory | *(empty)* |
| Build command | `cd ide && npm ci && npm run build` |
| Publish directory | `ide/dist` |
| Asset base path | `/` (default Vite base) |

### Connect the repo

1. New site → Import from Git → this repository
2. Netlify reads `netlify.toml` automatically
3. Deploy

Or CLI:

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

`ide/public/pkg` must contain a current `juni_wasm` build. The Netlify build does **not** run `wasm-pack` (keeps deploys fast). After compiler changes:

```bash
cd ide && npm run build:wasm
# commit ide/public/pkg, then push
```

GitHub Pages CI still runs `build:wasm` on every deploy — see [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml).

### SPA redirects

`netlify.toml` includes a `/* → /index.html` rewrite so refreshes on deep paths still serve the IDE shell.

---

## Game export on Netlify

1. In the IDE, open a `juni.toml` project → **Export Web** (downloads `index.html`, `play.js`, `game.wasm.json`), **or** run `juni export-web` (writes `dist/web/`).
2. Copy the Juni runtime next to the export (`runtime/dist` → `./runtime`), or use the CLI export which stages it.
3. Create a Netlify site with **publish directory** = that folder (no build command), **or** drag-and-drop the folder in the Netlify UI.

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
- **Compile fails in browser** — refresh `ide/public/pkg` with `npm run build:wasm`.
- **WebGPU / AI** — Chrome/Edge required; Netlify only hosts static files (inference still runs in the visitor’s browser).
