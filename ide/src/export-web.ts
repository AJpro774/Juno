/** Export a self-contained playable static web build (ZIP with runtime). */

import type { AssetPack } from "../../runtime/src/types";
import type { ProjectState } from "./project-store";
import { ensureProjectProvenance } from "./project-store";
import {
  JUNI_BUILT_WITH,
  JUNI_REQUIRED_NOTICE,
  juniNoticeFileBody,
} from "./juni-notice";
import { buildZip, downloadBlob, textToBytes, type ZipEntry } from "./zip-write";

export type ExportWebArgs = {
  project: ProjectState | null;
  compileProject: () => Promise<{ wasmB64: string; assetPack: AssetPack | null }>;
  logLine: (text: string, cls?: string) => void;
};

/** Built runtime ESM modules (from runtime/dist) — bundled into the IDE for export. */
const runtimeDistModules = import.meta.glob("../../runtime/dist/*.js", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function runtimeZipEntries(): ZipEntry[] {
  const entries: ZipEntry[] = [];
  for (const [modPath, source] of Object.entries(runtimeDistModules)) {
    const base = modPath.split("/").pop();
    if (!base || !base.endsWith(".js")) continue;
    entries.push({ path: `runtime/${base}`, data: textToBytes(source) });
  }
  if (!entries.some((e) => e.path === "runtime/browser.js")) {
    throw new Error(
      "Export runtime missing (runtime/dist/browser.js). Run `cd runtime && npm run build`."
    );
  }
  return entries;
}

function buildIndexHtml(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <!-- ${JUNI_REQUIRED_NOTICE} -->
  <!-- ${JUNI_BUILT_WITH} -->
  <title>${escapeHtml(title)}</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0e0f12; color: #e8e1d4; font-family: system-ui, sans-serif; }
    #wrap { display: grid; place-items: center; min-height: 100%; padding: 1rem; }
    canvas { max-width: 100%; background: #000; box-shadow: 0 12px 40px rgba(0,0,0,.4); }
    #log { max-width: 40rem; margin: 1rem auto; font: 12px/1.4 ui-monospace, monospace; white-space: pre-wrap; opacity: .7; }
  </style>
</head>
<body>
  <div id="wrap">
    <canvas id="c2d" width="640" height="360"></canvas>
    <canvas id="cgpu" width="640" height="360" hidden></canvas>
  </div>
  <pre id="log"></pre>
  <script type="module" src="./play.js"></script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildPlayJs(): string {
  return `// ${JUNI_REQUIRED_NOTICE}
// ${JUNI_BUILT_WITH}
// Juni web player — self-contained (relative paths for itch / Netlify)
import { instantiateJuni, startFrameLoop } from "./runtime/browser.js";

const logEl = document.getElementById("log");
const log = (t) => { if (logEl) logEl.textContent += t + "\\n"; };

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const res = await fetch("./game.wasm.json");
const { wasm, assets } = await res.json();
const bytes = b64ToBytes(wasm);
const canvas2d = document.getElementById("c2d");
const canvasGpu = document.getElementById("cgpu");
const opts = {
  onPrint: log,
  canvasEl: canvas2d,
  gpuCanvasEl: canvasGpu,
  mode: "canvas2d",
  assetPack: assets,
  getAssetText: (path) => {
    const a = assets?.assets?.[path];
    if (!a?.embed) return null;
    try { return atob(a.embed); } catch { return null; }
  },
};
const instance = await instantiateJuni(bytes, opts);
const exports = instance.exports;
if (typeof exports.main === "function") log("main() => " + exports.main());
startFrameLoop(instance, opts);
log("Running.");
`;
}

function buildNetlifyToml(): string {
  return `[build]
  publish = "."
  command = "echo static"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`;
}

function safeZipName(name: string): string {
  const base = (name || "juni-game").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base || "juni-game"}-web.zip`;
}

/** Download a self-contained ZIP (index + play + wasm + runtime/). */
export async function exportProjectWeb(args: ExportWebArgs): Promise<void> {
  if (!args.project) throw new Error("Open a juni.toml project first.");
  ensureProjectProvenance(args.project);
  args.logLine("Exporting web build…", "meta");
  const { wasmB64, assetPack } = await args.compileProject();
  const title = args.project.name || "Juni Game";
  const runtimeEntries = runtimeZipEntries();

  const entries: ZipEntry[] = [
    { path: "index.html", data: textToBytes(buildIndexHtml(title)) },
    { path: "play.js", data: textToBytes(buildPlayJs()) },
    {
      path: "game.wasm.json",
      data: textToBytes(
        JSON.stringify(
          {
            wasm: wasmB64,
            assets: assetPack,
            juni: {
              engine: "Juni",
              notice: JUNI_REQUIRED_NOTICE,
              builtWith: JUNI_BUILT_WITH,
            },
          },
          null,
          2
        )
      ),
    },
    { path: "NOTICE.txt", data: textToBytes(juniNoticeFileBody()) },
    { path: "netlify.toml", data: textToBytes(buildNetlifyToml()) },
    ...runtimeEntries,
  ];

  const zip = await buildZip(entries);
  const filename = safeZipName(title);
  downloadBlob(filename, zip);
  args.logLine(
    `Downloaded ${filename} (${entries.length} files, runtime included). Upload the ZIP to itch (HTML) or unzip for Netlify.`,
    "meta"
  );
}
