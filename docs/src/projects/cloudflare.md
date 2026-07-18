# Deploy to Cloudflare Workers

Host the **Juni IDE** as a static SPA on [Cloudflare Workers](https://developers.cloudflare.com/workers/static-assets/) (git-connected **Workers Builds**). Root [`wrangler.toml`](../../wrangler.toml) points assets at `ide/dist` with SPA `not_found_handling`.

## Dashboard build settings

Worker name: **`juno`** (or match `name` in `wrangler.toml`).

| Setting | Value |
|--------|--------|
| Root directory | `/` (repo root) |
| Build command | `(cp -f sitemap.xml ide/public/sitemap.xml \|\| true) && cd ide && npm install && npm run build` |
| Deploy command | `npx wrangler deploy` |
| Preview deploy | `npx wrangler versions upload` (default is fine) |

**Do not** use `wrangler pages deploy` or `npm run build:wasm` on Cloudflare CI — `wasm-pack` is not installed. Commit `ide/public/pkg` after compiler changes (same as Netlify).

## Local deploy

```bash
# from repo root
(cp -f sitemap.xml ide/public/sitemap.xml || true) && (cd ide && npm install && npm run build)
npx wrangler deploy
# first time: npx wrangler login
```

## SPA / download hub

[`ide/public/_redirects`](../../ide/public/_redirects) is copied into `ide/dist` by Vite. Workers also use `assets.not_found_handling = "single-page-application"` in `wrangler.toml`.

## Alongside Netlify

Netlify can stay on `*.netlify.app`; point your custom domain at Cloudflare when ready. Both can build from the same `main` push.
