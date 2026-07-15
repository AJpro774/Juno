# Export for web

Ship a Juni game as a static folder (Netlify, GitHub Pages, any static host).

## IDE

1. Open a `juni.toml` project
2. Click **Export Web**
3. Save the downloaded `index.html`, `play.js`, and `game.wasm.json`
4. Place a copy of [`runtime/dist`](../../runtime/dist) beside them as `./runtime/` (ESM imports `./runtime/browser.js`)

## CLI

```bash
juni export-web
# or
juni export-web --project path/to/game --output dist/web
```

Writes `dist/web/` with:

- `index.html` — canvas shell
- `play.js` — loads WASM + assets and starts the frame loop
- `game.wasm` — compiled module
- `assets.pack.json` — asset pack when present
- `runtime/` — copied JS runtime

Serve or deploy that folder as-is (see [Deploy to Netlify](netlify.md)).

## Notes

- Uses Vite/`/` base paths (not GitHub Pages `/Juno/`).
- Prefer Chrome/Edge for WebGPU examples.
