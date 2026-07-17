# Export for web

Ship a Juni **game** as a self-contained static folder or ZIP (itch HTML, Netlify, GitHub Pages, drag-and-drop hosts).

The export always includes the Juni JS runtime under `./runtime/` and uses **relative** asset paths (`./play.js`, `./runtime/browser.js`) so itch embeds and nested publish URLs work.

## IDE

1. Open a `juni.toml` project
2. Click **Export Web**
3. Save the downloaded `*-web.zip`

The ZIP is complete — unzip and serve, or upload the ZIP to itch as an HTML game. You do **not** need to copy `runtime/dist` yourself.

Contents:

| Path | Role |
|------|------|
| `index.html` | Canvas shell |
| `play.js` | Loads WASM + assets, starts the frame loop |
| `game.wasm.json` | Base64 WASM + embedded asset pack |
| `runtime/*.js` | Juni browser runtime (ESM) |
| `netlify.toml` | Optional static-site helper |

## CLI

```bash
# Self-contained folder (default: <project>/dist/web)
juni export-web
juni export-web --project path/to/game --output dist/web

# Same folder + itch-ready ZIP next to it (e.g. dist/platformer-web.zip)
juni export-web --zip
```

Requires a built runtime (`cd runtime && npm run build`) so `runtime/dist/*.js` exists.

Writes:

| Path | Role |
|------|------|
| `index.html` | Canvas shell |
| `play.js` | Loads WASM + assets |
| `game.wasm` | Compiled module (binary) |
| `assets.pack.json` | Asset pack |
| `runtime/*.js` | Copied from `runtime/dist` |
| `netlify.toml` | Optional static-site helper |

Helper script (zips an existing `dist/web` folder):

```bash
./scripts/package-itch-game.sh examples/projects/platformer/dist/web
```

## Upload a game to itch.io

This is for a **playable game export**, not the Juni IDE.

1. Produce a ZIP via **Export Web** in the IDE, or `juni export-web --zip`, or `./scripts/package-itch-game.sh …`
2. On [itch.io](https://itch.io) → **Upload new project** (or edit one)
3. Upload the `*-web.zip`
4. Set kind to **HTML**
5. Check **This file will be played in the browser**
6. Embed size: try **640 × 360** (or fullscreen) to match the default canvas
7. Save → **Run game**

The ZIP must have **`index.html` at the archive root** (not nested inside an extra folder).

For uploading the **Juni IDE** itself to itch, see the local `itchupload/HOW_TO_UPLOAD.md` pattern (IDE build with `--base ./`), which is separate from game exports.

## Deploy the game on Netlify

Unzip the export (or use the CLI `dist/web/` folder) and set **publish directory** to that folder — no build command needed. See [Deploy to Netlify](netlify.md).

## Notes

- Relative `./` paths — safe for itch embeds (not GitHub Pages `/Juno/` IDE base)
- Prefer Chrome/Edge for WebGPU examples
- Rebuild `runtime/dist` after runtime source changes before exporting from the CLI
