# Juno / Juni

**Juni** is a systems language that feels like Python and performs like C++: statically typed, no GC, explicit memory and refs, compiling natively to **WebAssembly** — with **Canvas2D**, a small **3D** API on WebGPU, frame loops, and input for games and simulations.

**Juno** is this repository. Author: **Alexander James Patton**. See [CREDITS.md](CREDITS.md).

## Try it online

Hosted IDE (same build):

- **[junoengine.vercel.app](https://junoengine.vercel.app/)** — Vercel (canonical / latest)
- **[junoengine.netlify.app](https://junoengine.netlify.app/)** — Netlify mirror

**[Open Kuni](https://junoengine.vercel.app/kuni/)** — local AI chatbot on KunoEngine (WebLLM + WASM). Also at [junoengine.netlify.app/kuni/](https://junoengine.netlify.app/kuni/).

Deploy via root [`vercel.json`](vercel.json) or [`netlify.toml`](netlify.toml) (build `ide/`, publish `ide/dist`). See [docs/src/projects/netlify.md](docs/src/projects/netlify.md).

## Status (v12.0.0)

- **Language:** runtime array / `str_substr` bounds traps; named borrow diagnostics; `array_len`
- **IDE:** resizable panes; themes; Cat Coffee; trap console remapping for OOB
- **Authoring:** entity scripts + Open/Stub; tilemap paint; **3D Edit**; **Code Search**; **Anim** editor
- **Engine:** ECS / `.jscene`; 2D + **3D AABB physics** + hybrid 2D→3D; collision / trigger events; `world_draw3d`
- **Optional AI:** WebLLM — deeper RAG / project-aware chat — **off by default**
- **Projects:** flat `ide/` / `crates/` / `docs/` / `examples/` / `runtime/`; Netlify flat-only; `juni export-web`
- **Examples:** `platformer_3d`, platformer, scene3d_lit, paddle, audio, modules
- **CI:** tests + example checks; desktop multi-arch release with optional macOS notarization / Windows signing

## Browser IDE (local)

Double-click [`RunJuniEditor.command`](RunJuniEditor.command), or:

```bash
cd ide && npm run build:wasm
cd ide && npm install && npm run dev
```

Open http://localhost:5173 — **Run** (⌘/Ctrl+Enter) compiles and executes; starts `frame` when exported.

**Kuni** (same origin): header switcher **Juni | Kuni**, or http://localhost:5173/kuni/

## CLI quick start

```bash
cd examples/projects/hello_modules
cargo run -p juni-cli -- build
node ../../runtime/host.js hello_modules.wasm
```

Check all samples:

```bash
bash scripts/check-examples.sh
bash scripts/check-projects.sh
```

## Desktop IDE

```bash
cd ide && npm run build:wasm
cd desktop && npm install && npm run dev
```

## Layout

| Path | Role |
|------|------|
| `crates/*` | Compiler (syntax, check, codegen, driver, lsp, CLI, wasm) |
| `ide/` | Vite + Monaco browser IDE |
| `kuni/` | Kuni local AI chatbot (KunoEngine / WebLLM) |
| `desktop/` | Tauri 2 native shell |
| `runtime/` | JS host + stubs |
| `examples/` | Single-file `.juni` programs |
| `examples/projects/` | Multi-module `juni.toml` projects |
| `docs/` | Language + project docs |
| `CHANGELOG.md` | Release notes |
| `CREDITS.md` | People, models, and software per version |

## Publish (hosted IDE)

| Host | URL |
|------|-----|
| **Vercel** (canonical / latest) | https://junoengine.vercel.app/ |
| **Netlify** (mirror) | https://junoengine.netlify.app/ |

- Vercel: root [`vercel.json`](vercel.json) — Framework **Other**, install `npm install --prefix ide`, build `cd ide && npm run build`, output `ide/dist`, `NODE_VERSION=20`.
- Netlify: root [`netlify.toml`](netlify.toml) — import the repo, or `npx netlify deploy --build --prod` from a full clone. See [docs/src/projects/netlify.md](docs/src/projects/netlify.md).

```bash
git remote add origin https://github.com/AJpro774/Juno.git
git push -u origin main
git push origin v6.0.0
```

### Optional: GitHub Pages (legacy)

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) can still publish a Pages build (`GITHUB_PAGES=true`, Vite base `/Juno/`). Enable **Settings → Pages → Build and deployment → GitHub Actions** if you want that mirror. Prefer **Vercel** (`junoengine.vercel.app`) for the latest hosted IDE.

## Docs

See [docs/src/intro.md](docs/src/intro.md), or open **Docs** in the IDE.

## License

Juni is under the [Juni Software License and Commercial Contract 1.0](LICENSE) (modified [PolyForm Small Business 1.0.0](https://polyformproject.org/licenses/small-business/1.0.0)) plus the [EULA](EULA.md). **Binding contract** on use/accept.

- **Free:** personal/hobby, and companies under PolyForm Small Business limits (<100 workers, <$1M USD 2019 CPI-adjusted prior-year revenue)
- **Required above that:** **USD $200/month**, paid directly to Alexander James Patton (AJpro774)
- Games you create remain yours (export exception in `LICENSE`)
