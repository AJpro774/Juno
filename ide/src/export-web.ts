/** Export a playable static web build (HTML + WASM + assets). */

import type { AssetPack } from "../../runtime/src/types";
import type { ProjectState } from "./project-store";
import { downloadTextFile } from "./project-persist";

export type ExportWebArgs = {
  project: ProjectState | null;
  compileProject: () => Promise<{ wasmB64: string; assetPack: AssetPack | null }>;
  logLine: (text: string, cls?: string) => void;
};

function buildIndexHtml(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
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

function buildPlayJs(): string {
  return `// Minimal Juni web player — loads game.wasm + assets.pack.json
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

/** Trigger downloads for a minimal static export bundle. */
export async function exportProjectWeb(args: ExportWebArgs): Promise<void> {
  if (!args.project) throw new Error("Open a juni.toml project first.");
  args.logLine("Exporting web build…", "meta");
  const { wasmB64, assetPack } = await args.compileProject();
  const title = args.project.name || "Juni Game";
  downloadTextFile("index.html", buildIndexHtml(title));
  downloadTextFile("play.js", buildPlayJs());
  downloadTextFile(
    "game.wasm.json",
    JSON.stringify({ wasm: wasmB64, assets: assetPack }, null, 2)
  );
  args.logLine(
    "Downloaded index.html, play.js, game.wasm.json. Copy runtime/dist as ./runtime next to them (or use `juni export-web`).",
    "meta"
  );
}
