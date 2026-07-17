import "./style.css";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { marked } from "marked";
import { registerJuniLanguage, JUNI_LANGUAGE_ID } from "./juni-lang";
import {
  instantiateJuni,
  startFrameLoop,
  type FrameController,
  type RunOptions,
} from "./juni-runtime";
import { DOC_PAGES } from "./docs-index";
import { CREDITS_MARKDOWN } from "./credits";
import { wireTutorialPlayer, type TutorialPlayer } from "./tutorials";
import { renderFileTree } from "./file-tree";
import {
  buildCompilePayload,
  createDemoProject,
  isProjectMode,
  openProjectFromFileInput,
  openProjectFromPicker,
  projectFromFiles,
  type ProjectState,
} from "./project-store";
import { TabEditor } from "./tab-editor";
import { setupEditorIntelliSense } from "./lsp-client";
import { sceneStore } from "./editor/scene-store";
import { getEditorMode, setEditorMode, subscribeMode } from "./editor/mode";
import { renderScenePanel } from "./editor/scene-panel";
import { renderInspector } from "./editor/inspector";
import { renderAssetBrowser } from "./editor/asset-browser";
import { attachSceneView } from "./editor/scene-view";
import type { AssetPack } from "../../runtime/src/types";
import { clearWritableRoot, writeProjectFile } from "./project-persist";
import type { JScene } from "../../runtime/src/scene-loader";
import { sceneHas3d } from "../../runtime/src/scene-loader";
import {
  isAiEnabled,
  subscribeAiSettings,
  type DiagLike,
} from "./agent/agent";
import {
  explainLastDiagnostics,
  setAiUiHooks,
  updateAiStatusLabel,
  wireAiPanelDom,
} from "./agent/ui";
import { setupAiAutocorrect } from "./agent/autocorrect";
import init, { compile, compile_project, complete_source, goto_def_source } from "../public/pkg/juni_wasm.js";

self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  },
};

type Diag = {
  severity: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  message: string;
  file?: string;
};

type CompileResult = {
  ok: boolean;
  diagnostics: Diag[];
  wasm: string | null;
};

type PreviewMode = "canvas2d" | "webgpu";

const SCRATCH_FILE = "scratch.juni";

const HELLO = `fn main() -> i32:
    print("Hello, World!")
    return 0
`;

type Example = {
  source: string;
  mode?: PreviewMode;
};

const EXAMPLES: Record<string, Example> = {
  "Hello World": { source: HELLO },
  Math: {
    source: `fn main() -> i32:
    print(pow(2.0, 10.0))
    print(pi())
    print(dist2(0.0, 0.0, 3.0, 4.0))
    print(str_concat("Juni ", "v6"))
    print(iclamp(99, 0, 10))
    return 0
`,
  },
  Vec2: {
    source: `fn main() -> i32:
    print(len2(3.0, 4.0))
    print(dot2(1.0, 2.0, 3.0, 4.0))
    print(dist2(0.0, 0.0, 3.0, 4.0))
    print(str_substr("Juni v6", 5, 2))
    return 0
`,
  },
  Lines: {
    mode: "canvas2d",
    source: `fn main() -> i32:
    canvas_init(640, 360)
    canvas_clear(0.08, 0.09, 0.12, 1.0)
    canvas_draw_line(40.0, 40.0, 600.0, 320.0, 3.0, 0.2, 0.8, 0.6, 1.0)
    canvas_stroke_rect(80.0, 60.0, 200.0, 120.0, 2.0, 1.0, 0.9, 0.3, 1.0)
    canvas_fill_text("canvas lines", 40.0, 340.0, 1.0, 1.0, 1.0, 1.0)
    return 0
`,
  },
  Sprites: {
    mode: "canvas2d",
    source: `state:
    sprite_x: f32 = 200.0
    sprite_y: f32 = 160.0

fn main() -> i32:
    canvas_init(640, 360)
    return 0

fn frame(dt: f32) -> i32:
    sprite_x = sprite_x + 80.0 * dt
    if sprite_x > 560.0:
        sprite_x = 40.0
    canvas_clear(0.08, 0.09, 0.12, 1.0)
    canvas_fill_rect(sprite_x, sprite_y, 32.0, 32.0, 0.95, 0.4, 0.3, 1.0)
    canvas_stroke_rect(sprite_x - 2.0, sprite_y - 2.0, 36.0, 36.0, 1.0, 1.0, 1.0, 0.4, 1.0)
    return 0
`,
  },
  Arrays: {
    source: `fn main() -> i32:
    let xs = [1, 2, 3]
    let s = 0
    for i in 0..3:
        s = s + xs[i]
    print(s)
    return s
`,
  },
  "Canvas2D Hello": {
    mode: "canvas2d",
    source: `fn main() -> i32:
    canvas_init(640, 360)
    canvas_clear(0.08, 0.09, 0.12, 1.0)
    canvas_fill_rect(40.0, 40.0, 120.0, 80.0, 0.1, 0.7, 0.5, 1.0)
    canvas_fill_circle(320.0, 180.0, 40.0, 0.95, 0.55, 0.2, 1.0)
    canvas_fill_text("Juni 2D", 40.0, 160.0, 1.0, 1.0, 1.0, 1.0)
    return 0
`,
  },
  "Game Paddle": {
    mode: "canvas2d",
    source: `state:
    paddle_x: f32 = 280.0

fn main() -> i32:
    canvas_init(640, 360)
    return 0

fn frame(dt: f32) -> i32:
    if key_down(0) == 1:
        paddle_x = paddle_x - 280.0 * dt
    if key_down(1) == 1:
        paddle_x = paddle_x + 280.0 * dt
    if key_down(4) == 1:
        paddle_x = paddle_x - 280.0 * dt
    if key_down(5) == 1:
        paddle_x = paddle_x + 280.0 * dt
    paddle_x = clamp(paddle_x, 8.0, 536.0)
    canvas_clear(0.08, 0.09, 0.12, 1.0)
    canvas_fill_rect(paddle_x, 320.0, 96.0, 18.0, 0.15, 0.75, 0.55, 1.0)
    canvas_fill_text("arrows / A D", 20.0, 40.0, 1.0, 1.0, 1.0, 1.0)
    return 0
`,
  },
  State: {
    source: `state:
    ticks: i32 = 0

fn main() -> i32:
    print(str_len("Juni"))
    if str_eq("v6", "v6"):
        print("str_eq ok")
    print(lerp(0.0, 10.0, 0.5))
    return 0

fn frame(dt: f32) -> i32:
    ticks = ticks + 1
    return 0
`,
  },
  "WebGPU Triangle": {
    mode: "webgpu",
    source: `fn main() -> i32:
    gpu_clear(0.05, 0.06, 0.1, 1.0)
    gpu_draw_triangle()
    print("WebGPU triangle requested")
    return 0
`,
  },
  "Scene3D Cube": {
    mode: "webgpu",
    source: `state:
    cam: i32 = 0
    box: i32 = 0

fn main() -> i32:
    scene3d_init(640, 360)
    cam = camera3d_perspective(60.0, 1.777, 0.1, 100.0)
    box = mesh3d_box(1.0, 1.0, 1.0)
    mesh3d_set_pose(box, 0.0, 0.0, -4.0, 0.4, 0.6, 0.0)
    return 0

fn frame(dt: f32) -> i32:
    scene3d_clear(0.05, 0.06, 0.1, 1.0)
    mesh3d_rotate(box, dt * 0.4, dt * 0.9, 0.0)
    scene3d_draw(box, cam)
    return 0
`,
  },
  Loop: {
    source: `fn main() -> i32:
    let i = 0
    while i < 10:
        i = i + 1
    print(i)
    return i
`,
  },
  Structs: {
    source: `struct Vec2:
    x: f32
    y: f32

fn length(v: Vec2) -> f32:
    return sqrt(v.x * v.x + v.y * v.y)

fn main() -> i32:
    let p = Vec2(x=3.0, y=4.0)
    let n = length(p)
    print("length:")
    print(n)
    return 0
`,
  },
};

const consoleEl = document.getElementById("console") as HTMLPreElement;
const runBtn = document.getElementById("run") as HTMLButtonElement;
const examplesSel = document.getElementById("examples") as HTMLSelectElement;
const editorHost = document.getElementById("editor") as HTMLDivElement;
const tabBar = document.getElementById("tab-bar") as HTMLDivElement;
const fileTreeHost = document.getElementById("file-tree") as HTMLDivElement;
const openProjectBtn = document.getElementById("open-project") as HTMLButtonElement;
const demoProjectBtn = document.getElementById("demo-project") as HTMLButtonElement;
const zipInput = document.getElementById("zip-input") as HTMLInputElement;
const folderInput = document.getElementById("folder-input") as HTMLInputElement;
const workspace = document.querySelector(".workspace") as HTMLElement;
const docsPanel = document.getElementById("docs-panel") as HTMLElement;
const docsNav = document.getElementById("docs-nav") as HTMLElement;
const docsBody = document.getElementById("docs-body") as HTMLElement;
const sideTitle = document.getElementById("side-panel-title") as HTMLElement;
const docsToggle = document.getElementById("docs-toggle") as HTMLButtonElement;
const tutorialsToggle = document.getElementById("tutorials-toggle") as HTMLButtonElement;
const creditsToggle = document.getElementById("credits-toggle") as HTMLButtonElement;
const docsClose = document.getElementById("docs-close") as HTMLButtonElement;
const tutorialsClose = document.getElementById("tutorials-close") as HTMLButtonElement;
const tutorialsPanel = document.getElementById("tutorials-panel") as HTMLElement;
const aiToggle = document.getElementById("ai-toggle") as HTMLButtonElement;
const aiPanel = document.getElementById("ai-panel") as HTMLElement;
const aiClose = document.getElementById("ai-close") as HTMLButtonElement;
const tutorialPlayer: TutorialPlayer = wireTutorialPlayer({
  panel: tutorialsPanel,
  lessonSelect: document.getElementById("tutorial-lesson") as HTMLSelectElement,
  image: document.getElementById("tutorial-image") as HTMLImageElement,
  caption: document.getElementById("tutorial-caption") as HTMLElement,
  progress: document.getElementById("tutorial-progress") as HTMLElement,
  prevBtn: document.getElementById("tutorial-prev") as HTMLButtonElement,
  nextBtn: document.getElementById("tutorial-next") as HTMLButtonElement,
  speakBtn: document.getElementById("tutorial-speak") as HTMLButtonElement,
  stopBtn: document.getElementById("tutorial-stop") as HTMLButtonElement,
});
const explainErrorsBtn = document.getElementById("explain-errors") as HTMLButtonElement;
const aiFixModal = document.getElementById("ai-fix-modal") as HTMLElement;
const aiFixOriginal = document.getElementById("ai-fix-original") as HTMLPreElement;
const aiFixProposed = document.getElementById("ai-fix-proposed") as HTMLPreElement;
const aiFixApply = document.getElementById("ai-fix-apply") as HTMLButtonElement;
const aiFixDismiss = document.getElementById("ai-fix-dismiss") as HTMLButtonElement;
const mode2d = document.getElementById("mode-2d") as HTMLButtonElement;
const modeGpu = document.getElementById("mode-gpu") as HTMLButtonElement;
const canvas2d = document.getElementById("canvas2d") as HTMLCanvasElement;
const canvasGpu = document.getElementById("canvas-gpu") as HTMLCanvasElement;
const previewBody = document.getElementById("preview-body") as HTMLElement;
const scenePanelHost = document.getElementById("scene-panel") as HTMLDivElement;
const inspectorHost = document.getElementById("inspector") as HTMLDivElement;
const assetBrowserHost = document.getElementById("asset-browser") as HTMLDivElement;
const modeEditBtn = document.getElementById("mode-edit") as HTMLButtonElement;
const modePlayBtn = document.getElementById("mode-play") as HTMLButtonElement;
const saveSceneBtn = document.getElementById("save-scene") as HTMLButtonElement;
const undoSceneBtn = document.getElementById("undo-scene") as HTMLButtonElement;
const redoSceneBtn = document.getElementById("redo-scene") as HTMLButtonElement;
const sceneDirtyEl = document.getElementById("scene-dirty") as HTMLElement;
const hotReloadChk = document.getElementById("hot-reload") as HTMLInputElement;
const exportWebBtn = document.getElementById("export-web") as HTMLButtonElement;

let previewMode: PreviewMode = "canvas2d";
let panelMode: "docs" | "credits" | "ai" | "tutorials" | null = null;
let activeDocId = DOC_PAGES[0]?.id ?? "intro";
let frameCtl: FrameController | null = null;
let runGeneration = 0;
let project: ProjectState | null = null;
let tabEditor: TabEditor | null = null;
let currentAssetPack: AssetPack | null = null;
let sceneView: ReturnType<typeof attachSceneView> | null = null;
let lastDiagnostics: DiagLike[] = [];
let pendingFixApply: (() => void) | null = null;
let prePlayScene: JScene | null = null;
let hotReloadEnabled = false;

function refreshEnginePanels() {
  renderScenePanel(scenePanelHost, sceneStore);
  renderInspector(inspectorHost, sceneStore, currentAssetPack);
  renderAssetBrowser(assetBrowserHost, currentAssetPack, sceneStore);
  sceneView?.redraw();
}

function tryLoadSceneFromProject() {
  if (!project) return;
  const candidates = [
    "scenes/main.jscene",
    "scenes/level1.jscene",
    ...[...project.files.keys()].filter((p) => p.endsWith(".jscene")),
  ];
  for (const path of candidates) {
    const file = project.files.get(path);
    if (file) {
      try {
        sceneStore.load(file.content, path);
        return;
      } catch {
        /* ignore */
      }
    }
  }
}

function syncSceneIntoProject() {
  if (!project) return;
  const path = sceneStore.getPath();
  const content = sceneStore.serialize();
  const existing = project.files.get(path);
  if (existing) {
    existing.content = content;
    existing.dirty = true;
  } else {
    project.files.set(path, { path, content, dirty: true });
  }
  refreshFileTree();
}

async function persistSceneToDisk(): Promise<void> {
  syncSceneIntoProject();
  const path = sceneStore.getPath();
  const content = sceneStore.serialize();
  try {
    const how = await writeProjectFile(path, content);
    sceneStore.markSaved();
    const file = project?.files.get(path);
    if (file) file.dirty = false;
    refreshFileTree();
    updateSceneDirtyUi();
    if (how === "disk") logLine(`Saved scene ${path} to disk.`, "meta");
    else logLine(`Downloaded ${path} (no writable project folder).`, "meta");
  } catch (e) {
    logLine(`Save failed: ${e}`, "err");
  }
}

function updateSceneDirtyUi(): void {
  if (sceneDirtyEl) sceneDirtyEl.hidden = !sceneStore.isDirty();
  if (undoSceneBtn) undoSceneBtn.disabled = !sceneStore.canUndo();
  if (redoSceneBtn) redoSceneBtn.disabled = !sceneStore.canRedo();
}

function stopPlayAndRestore(): void {
  frameCtl?.stop();
  frameCtl = null;
  if (prePlayScene) {
    sceneStore.restoreScene(prePlayScene);
    prePlayScene = null;
  }
  refreshEnginePanels();
}

async function loadAssetPackFromProject(): Promise<void> {
  currentAssetPack = null;
  if (!project) return;
  const packFile = project.files.get("assets.pack.json");
  if (packFile) {
    try {
      currentAssetPack = JSON.parse(packFile.content) as AssetPack;
      return;
    } catch {
      /* fall through */
    }
  }
  // Build a lightweight pack from image embeds in the project files map.
  const assets: AssetPack["assets"] = {};
  let id = 1;
  for (const [path, file] of project.files) {
    if (!path.startsWith("assets/")) continue;
    const rel = path.slice("assets/".length);
    const lower = rel.toLowerCase();
    let kind = "blob";
    if (/\.(png|jpg|jpeg|gif|webp)$/.test(lower)) kind = "image";
    else if (lower.endsWith(".jscene")) kind = "scene";
    else if (lower.endsWith(".gltf")) kind = "gltf";
    else if (lower.endsWith(".json")) kind = "tilemap";
    else if (/\.(wav|mp3|ogg)$/.test(lower)) kind = "audio";
    assets[rel] = {
      id: id++,
      kind,
      w: 0,
      h: 0,
      path: rel,
      embed: kind !== "image" ? btoa(file.content) : undefined,
    };
  }
  if (Object.keys(assets).length) {
    currentAssetPack = { version: 1, assets };
  }
}

function logLine(text: string, cls?: string) {
  const span = document.createElement("span");
  if (cls) span.className = cls;
  span.textContent = text + "\n";
  consoleEl.appendChild(span);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function clearConsole() {
  consoleEl.textContent = "";
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function diagToMarker(d: Diag): monaco.editor.IMarkerData {
  return {
    severity:
      d.severity === "warning"
        ? monaco.MarkerSeverity.Warning
        : monaco.MarkerSeverity.Error,
    message: d.message,
    startLineNumber: d.line,
    startColumn: d.col,
    endLineNumber: d.endLine || d.line,
    endColumn: Math.max(d.endCol || d.col + 1, d.col + 1),
  };
}

function clearAllMarkers(editor: TabEditor) {
  for (const path of editor.getOpenPaths()) {
    const model = editor.getModel(path);
    if (model) monaco.editor.setModelMarkers(model, "juni", []);
  }
}

function setDiagnostics(editor: TabEditor, diags: Diag[]) {
  clearAllMarkers(editor);
  const byFile = new Map<string, monaco.editor.IMarkerData[]>();
  const active = editor.getActivePath();

  for (const d of diags) {
    const file = d.file ?? active ?? SCRATCH_FILE;
    const list = byFile.get(file) ?? [];
    list.push(diagToMarker(d));
    byFile.set(file, list);
  }

  for (const [file, markers] of byFile) {
    const model = editor.getModel(file);
    if (model) monaco.editor.setModelMarkers(model, "juni", markers);
  }
}

function refreshFileTree() {
  renderFileTree(fileTreeHost, project, tabEditor?.getActivePath() ?? null, {
    onOpenFile: (path) => tabEditor?.activateTab(path),
  });
}

function loadProject(next: ProjectState, focusPath?: string | null) {
  project = next;
  examplesSel.value = "";
  tabEditor?.loadProject(next, focusPath);
  refreshFileTree();
  clearConsole();
  logLine(`Loaded project "${next.name}".`, "meta");
  void loadAssetPackFromProject().then(() => {
    tryLoadSceneFromProject();
    refreshEnginePanels();
    updateSceneDirtyUi();
  });
}

function loadScratchExample(ex: Example) {
  project = null;
  clearWritableRoot();
  tabEditor?.openScratch(SCRATCH_FILE, ex.source);
  if (ex.mode) setPreviewMode(ex.mode);
  refreshFileTree();
  clearConsole();
  const model = tabEditor?.getModel(SCRATCH_FILE);
  if (model) monaco.editor.setModelMarkers(model, "juni", []);
}

function syncProjectFromEditor() {
  if (!project || !tabEditor) return;
  tabEditor.updateProjectFiles(project);
}

function setPreviewMode(mode: PreviewMode) {
  previewMode = mode;
  mode2d.classList.toggle("is-active", mode === "canvas2d");
  modeGpu.classList.toggle("is-active", mode === "webgpu");
  canvas2d.hidden = mode !== "canvas2d";
  canvasGpu.hidden = mode !== "webgpu";
  canvas2d.style.display = mode === "canvas2d" ? "block" : "none";
  canvasGpu.style.display = mode === "webgpu" ? "block" : "none";
}

function markPreviewUsed() {
  previewBody.classList.add("has-frame");
}

function setPanel(mode: "docs" | "credits" | "ai" | "tutorials" | null) {
  const prev = panelMode;
  panelMode = mode;
  const docsOpen = mode === "docs" || mode === "credits";
  const aiOpen = mode === "ai";
  const tutorialsOpen = mode === "tutorials";
  workspace.classList.toggle("docs-open", docsOpen);
  workspace.classList.toggle("ai-open", aiOpen);
  workspace.classList.toggle("tutorials-open", tutorialsOpen);
  docsPanel.setAttribute("aria-hidden", docsOpen ? "false" : "true");
  aiPanel.setAttribute("aria-hidden", aiOpen ? "false" : "true");
  tutorialsPanel.setAttribute("aria-hidden", tutorialsOpen ? "false" : "true");
  if (mode === "docs") {
    sideTitle.textContent = "Docs";
    docsNav.style.display = "";
    renderDoc(activeDocId);
  } else if (mode === "credits") {
    sideTitle.textContent = "Credits";
    docsNav.style.display = "none";
    docsBody.innerHTML = marked.parse(CREDITS_MARKDOWN, { async: false }) as string;
  }
  if (tutorialsOpen !== (prev === "tutorials")) {
    tutorialPlayer.setActive(tutorialsOpen);
  }
}

function showFixPreview(original: string, proposed: string, apply: () => void) {
  pendingFixApply = apply;
  aiFixOriginal.textContent = original;
  aiFixProposed.textContent = proposed;
  aiFixModal.hidden = false;
}

function hideFixPreview() {
  pendingFixApply = null;
  aiFixModal.hidden = true;
}

function currentSource(): string {
  const path = tabEditor?.getActivePath() ?? SCRATCH_FILE;
  return tabEditor?.getModel(path)?.getValue() ?? "";
}

function currentExtraContext(): string {
  const path = tabEditor?.getActivePath() ?? SCRATCH_FILE;
  const diags = formatDiagnosticsBrief(lastDiagnostics);
  return `Active file: ${path}\nLast diagnostics:\n${diags || "(none)"}`;
}

function formatDiagnosticsBrief(diags: DiagLike[]): string {
  return diags
    .slice(0, 12)
    .map((d) => {
      const where = d.file ? `${d.file}:${d.line}:${d.col}` : `${d.line}:${d.col}`;
      return `${where} ${d.message}`;
    })
    .join("\n");
}

function updateExplainButton() {
  const show = isAiEnabled() && lastDiagnostics.length > 0;
  explainErrorsBtn.hidden = !show;
}

function renderDoc(id: string) {
  const page = DOC_PAGES.find((p) => p.id === id) ?? DOC_PAGES[0];
  if (!page) return;
  activeDocId = page.id;
  for (const btn of docsNav.querySelectorAll("button")) {
    btn.classList.toggle("is-active", btn.getAttribute("data-id") === page.id);
  }
  docsBody.innerHTML = marked.parse(page.markdown, { async: false }) as string;
}

function setupSidePanel() {
  for (const page of DOC_PAGES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = page.title;
    btn.setAttribute("data-id", page.id);
    btn.addEventListener("click", () => {
      setPanel("docs");
      renderDoc(page.id);
    });
    docsNav.appendChild(btn);
  }
  docsToggle.addEventListener("click", () => {
    setPanel(panelMode === "docs" ? null : "docs");
  });
  tutorialsToggle.addEventListener("click", () => {
    setPanel(panelMode === "tutorials" ? null : "tutorials");
  });
  creditsToggle.addEventListener("click", () => {
    setPanel(panelMode === "credits" ? null : "credits");
  });
  docsClose.addEventListener("click", () => setPanel(null));
  tutorialsClose.addEventListener("click", () => setPanel(null));
  aiToggle.addEventListener("click", () => {
    setPanel(panelMode === "ai" ? null : "ai");
  });
  aiClose.addEventListener("click", () => setPanel(null));
  void tutorialPlayer.init();
  explainErrorsBtn.addEventListener("click", () => {
    void explainLastDiagnostics();
  });
  aiFixApply.addEventListener("click", () => {
    pendingFixApply?.();
    hideFixPreview();
  });
  aiFixDismiss.addEventListener("click", () => hideFixPreview());
}

async function openProjectFolderFallback(): Promise<ProjectState | null> {
  return new Promise((resolve, reject) => {
    folderInput.onchange = async () => {
      const fileList = folderInput.files;
      folderInput.value = "";
      if (!fileList || fileList.length === 0) {
        resolve(null);
        return;
      }
      try {
        const files = new Map<string, string>();
        let rootName = "project";
        for (const file of fileList) {
          const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
          if (!rel) continue;
          const normalized = rel.replace(/\\/g, "/");
          const parts = normalized.split("/");
          if (parts.length < 2) continue;
          rootName = parts[0];
          const path = parts.slice(1).join("/");
          files.set(path, await file.text());
        }
        if (!files.has("juni.toml")) {
          throw new Error("Selected folder must contain juni.toml at the project root.");
        }
        resolve(projectFromFiles(rootName, ".", files));
      } catch (e) {
        reject(e);
      }
    };
    folderInput.click();
  });
}

async function handleOpenProject() {
  try {
    // Desktop: native folder picker + full project FS load.
    const { openProjectFromTauri } = await import("./project-persist");
    const fromTauri = await openProjectFromTauri();
    if (fromTauri) {
      loadProject(fromTauri);
      return;
    }

    let next = await openProjectFromPicker();
    if (!next) {
      const useZip = window.confirm(
        "Folder picker unavailable. Open a .zip project archive?\n\nCancel to pick a folder via the legacy file input."
      );
      if (useZip) {
        next = await openProjectFromFileInput(zipInput);
      } else {
        next = await openProjectFolderFallback();
      }
    }
    if (next) loadProject(next);
  } catch (e) {
    logLine(String(e), "err");
  }
}

async function main() {
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Examples…";
  examplesSel.appendChild(placeholder);

  for (const name of Object.keys(EXAMPLES)) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    examplesSel.appendChild(opt);
  }

  setupSidePanel();
  setPreviewMode("canvas2d");

  mode2d.addEventListener("click", () => setPreviewMode("canvas2d"));
  modeGpu.addEventListener("click", () => setPreviewMode("webgpu"));

  sceneView = attachSceneView(canvas2d, sceneStore, () => currentAssetPack);
  sceneStore.subscribe(() => {
    refreshEnginePanels();
    updateSceneDirtyUi();
  });
  refreshEnginePanels();
  updateSceneDirtyUi();

  modeEditBtn.addEventListener("click", () => {
    setEditorMode("edit");
    stopPlayAndRestore();
  });
  modePlayBtn.addEventListener("click", () => {
    prePlayScene = sceneStore.cloneScene();
    if (sceneHas3d(sceneStore.getScene())) {
      setPreviewMode("webgpu");
    }
    setEditorMode("play");
    void run();
  });
  subscribeMode((mode) => {
    modeEditBtn.classList.toggle("is-active", mode === "edit");
    modePlayBtn.classList.toggle("is-active", mode === "play");
    if (mode === "edit") {
      canvas2d.hidden = false;
      canvas2d.style.display = "block";
      sceneView?.redraw();
      logLine("Edit mode.", "meta");
    }
  });

  saveSceneBtn.addEventListener("click", () => {
    void persistSceneToDisk();
  });
  undoSceneBtn?.addEventListener("click", () => {
    if (getEditorMode() !== "edit") return;
    sceneStore.undo();
  });
  redoSceneBtn?.addEventListener("click", () => {
    if (getEditorMode() !== "edit") return;
    sceneStore.redo();
  });
  window.addEventListener("keydown", (e) => {
    if (getEditorMode() !== "edit") return;
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) {
      return;
    }
    // Let Monaco handle editor-focused shortcuts.
    if (target?.closest?.(".monaco-editor")) return;
    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      sceneStore.undo();
    } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
      e.preventDefault();
      sceneStore.redo();
    }
  });
  hotReloadChk?.addEventListener("change", () => {
    hotReloadEnabled = !!hotReloadChk.checked;
    logLine(hotReloadEnabled ? "Hot reload on (saves while playing re-run)." : "Hot reload off.", "meta");
  });
  exportWebBtn?.addEventListener("click", () => {
    void exportWebBuild();
  });

  await init();
  registerJuniLanguage(monaco);

  tabEditor = new TabEditor({
    host: editorHost,
    tabBar,
    onDirtyChange: () => refreshFileTree(),
    onActiveChange: () => refreshFileTree(),
  });

  setupEditorIntelliSense(
    monaco,
    JUNI_LANGUAGE_ID,
    { complete_source, goto_def_source },
    () => {
      const path = tabEditor?.getActivePath() ?? SCRATCH_FILE;
      return tabEditor?.getModel(path)?.getValue() ?? "";
    },
    () => tabEditor?.getActivePath() ?? SCRATCH_FILE,
  );

  setAiUiHooks({
    getSource: currentSource,
    getDiagnostics: () => lastDiagnostics,
    getExtraContext: currentExtraContext,
    applySource: (source: string) => {
      const path = tabEditor?.getActivePath() ?? SCRATCH_FILE;
      const model = tabEditor?.getModel(path);
      if (!model) return;
      model.setValue(source);
      syncProjectFromEditor();
    },
    applySelection: (source: string) => {
      const ed = tabEditor?.editor;
      if (!ed) return;
      const sel = ed.getSelection();
      if (!sel) {
        logLine("No selection to replace.", "meta");
        return;
      }
      ed.executeEdits("ai-replace", [
        { range: sel, text: source, forceMoveMarkers: true },
      ]);
      syncProjectFromEditor();
    },
    openScratch: (source: string, name = "ai-snippet.juni") => {
      tabEditor?.openScratch(name, source);
    },
    logLine,
    openPanel: () => setPanel("ai"),
  });
  wireAiPanelDom();
  updateAiStatusLabel();
  updateExplainButton();
  subscribeAiSettings(() => updateExplainButton());

  setupAiAutocorrect(monaco, JUNI_LANGUAGE_ID, tabEditor.editor, {
    getSource: currentSource,
    getDiagnostics: () => lastDiagnostics,
    logLine,
    showFixPreview,
  });

  openProjectBtn.addEventListener("click", () => {
    void handleOpenProject();
  });

  demoProjectBtn.addEventListener("click", () => {
    loadProject(createDemoProject());
  });

  examplesSel.addEventListener("change", () => {
    const ex = EXAMPLES[examplesSel.value];
    if (!ex) return;
    loadScratchExample(ex);
  });

  async function run() {
    if (!tabEditor) return;
    frameCtl?.stop();
    frameCtl = null;
    const gen = ++runGeneration;

    clearConsole();
    runBtn.classList.add("is-running");
    window.setTimeout(() => runBtn.classList.remove("is-running"), 500);

    syncProjectFromEditor();

    let result: CompileResult;
    try {
      if (isProjectMode(project)) {
        result = JSON.parse(compile_project(buildCompilePayload(project!))) as CompileResult;
      } else {
        const active = tabEditor.getActivePath() ?? SCRATCH_FILE;
        const model = tabEditor.getModel(active);
        const source = model?.getValue() ?? "";
        result = JSON.parse(compile(source)) as CompileResult;
      }
    } catch (e) {
      logLine(String(e), "err");
      return;
    }

    setDiagnostics(tabEditor, result.diagnostics ?? []);
    lastDiagnostics = (result.diagnostics ?? []).map((d) => ({
      severity: d.severity,
      line: d.line,
      col: d.col,
      message: d.message,
      file: d.file,
    }));
    updateExplainButton();

    if (!result.ok || !result.wasm) {
      logLine("Compile failed.", "err");
      for (const d of result.diagnostics ?? []) {
        const where = d.file ? `${d.file}:${d.line}:${d.col}` : `${d.line}:${d.col}`;
        logLine(`${where} ${d.message}`, "err");
      }
      if (isAiEnabled()) {
        logLine("Tip: open AI panel or click Explain with AI.", "meta");
      }
      return;
    }

    try {
      const bytes = b64ToBytes(result.wasm);
      const opts: RunOptions = {
        onPrint: (text: string) => logLine(text),
        canvasEl: canvas2d,
        gpuCanvasEl: canvasGpu,
        mode: previewMode,
        getShouldStop: () => gen !== runGeneration || getEditorMode() === "edit",
        assetPack: currentAssetPack,
        initialScene: getEditorMode() === "play" ? sceneStore.getScene() : null,
        getAssetText: (path: string) => {
          if (!project) return null;
          const candidates = [`assets/${path}`, path, `scenes/${path}`];
          for (const c of candidates) {
            const f = project.files.get(c);
            if (f) return f.content;
          }
          return null;
        },
      };
      const instance = await instantiateJuni(bytes, opts);
      if (gen !== runGeneration) return;
      markPreviewUsed();
      if (previewMode === "canvas2d") {
        canvas2d.hidden = false;
        canvas2d.style.display = "block";
      } else {
        canvasGpu.hidden = false;
        canvasGpu.style.display = "block";
      }
      const exports = instance.exports as {
        main?: () => number;
        frame?: (dt: number) => number;
      };
      if (typeof exports.main === "function") {
        const ret = exports.main();
        logLine(`main() => ${ret}`, "meta");
      } else {
        logLine("no exported main()", "err");
      }
      frameCtl = startFrameLoop(instance, opts);
      if (frameCtl) {
        logLine("frame loop running (click Edit or Run again to stop).", "meta");
      }
    } catch (e) {
      logLine(String(e), "err");
    }
  }

  runBtn.addEventListener("click", () => {
    void run();
  });

  tabEditor.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    void run();
  });

  tabEditor.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    void (async () => {
      const path = tabEditor?.getActivePath();
      if (!path || !tabEditor) return;
      syncProjectFromEditor();
      const content = tabEditor.getModel(path)?.getValue() ?? "";
      if (project) {
        const file = project.files.get(path);
        if (file) {
          file.content = content;
          file.dirty = false;
        }
      }
      tabEditor.markSaved(path);
      try {
        const how = await writeProjectFile(path, content);
        logLine(how === "disk" ? `Saved ${path} to disk.` : `Downloaded ${path}.`, "meta");
      } catch (e) {
        logLine(`Saved ${path} in-memory only (${e}).`, "meta");
      }
      if (hotReloadEnabled && getEditorMode() === "play") {
        logLine("Hot reload…", "meta");
        void run();
      }
    })();
  });

  async function exportWebBuild(): Promise<void> {
    const { exportProjectWeb } = await import("./export-web");
    try {
      await exportProjectWeb({
        project,
        compileProject: async () => {
          if (!project || !isProjectMode(project)) {
            throw new Error("Open a juni.toml project first.");
          }
          const result = JSON.parse(compile_project(buildCompilePayload(project))) as CompileResult;
          if (!result.ok || !result.wasm) {
            throw new Error(result.diagnostics?.[0]?.message ?? "Compile failed");
          }
          return { wasmB64: result.wasm, assetPack: currentAssetPack };
        },
        logLine,
      });
    } catch (e) {
      logLine(String(e), "err");
    }
  }

  loadScratchExample(EXAMPLES["Hello World"]);
  refreshFileTree();
  logLine("Ready. Open a project or press Run (⌘/Ctrl+Enter).", "meta");
}

main().catch((e) => {
  clearConsole();
  logLine(String(e), "err");
});
