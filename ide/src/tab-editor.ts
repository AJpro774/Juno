import * as monaco from "monaco-editor";
import {
  JUNI_LANGUAGE_ID,
  JUNI_THEME_CLASSIC,
  juniThemeForAppearance,
} from "./juni-lang";
import type { ProjectState } from "./project-store";
import { getUiAppearance } from "./ui-theme";

export type TabEditorOptions = {
  host: HTMLElement;
  tabBar: HTMLElement;
  onDirtyChange?: (path: string, dirty: boolean) => void;
  onActiveChange?: (path: string | null) => void;
};

const EDITOR_OPTS: monaco.editor.IStandaloneEditorConstructionOptions = {
  language: JUNI_LANGUAGE_ID,
  theme: JUNI_THEME_CLASSIC,
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 14,
  minimap: { enabled: false },
  automaticLayout: true,
  scrollBeyondLastLine: false,
  padding: { top: 16 },
  renderLineHighlight: "line",
  tabSize: 4,
  insertSpaces: true,
};

export class TabEditor {
  readonly editor: monaco.editor.IStandaloneCodeEditor;
  private readonly host: HTMLElement;
  private readonly tabBar: HTMLElement;
  private readonly models = new Map<string, monaco.editor.ITextModel>();
  private readonly savedContent = new Map<string, string>();
  private activePath: string | null = null;
  private onDirtyChange?: (path: string, dirty: boolean) => void;
  private onActiveChange?: (path: string | null) => void;
  private changeDisposable: monaco.IDisposable | null = null;

  constructor(opts: TabEditorOptions) {
    this.host = opts.host;
    this.tabBar = opts.tabBar;
    this.onDirtyChange = opts.onDirtyChange;
    this.onActiveChange = opts.onActiveChange;
    this.editor = monaco.editor.create(this.host, {
      ...EDITOR_OPTS,
      theme: juniThemeForAppearance(getUiAppearance()),
      value: "",
    });
  }

  getActivePath(): string | null {
    return this.activePath;
  }

  getModel(path: string): monaco.editor.ITextModel | undefined {
    return this.models.get(path);
  }

  getOpenPaths(): string[] {
    return [...this.models.keys()];
  }

  isDirty(path: string): boolean {
    const model = this.models.get(path);
    if (!model) return false;
    const saved = this.savedContent.get(path) ?? "";
    return model.getValue() !== saved;
  }

  loadProject(project: ProjectState, focusPath?: string | null): void {
    this.clearTabs();
    const paths = [...project.files.keys()].sort((a, b) => a.localeCompare(b));
    for (const path of paths) {
      const file = project.files.get(path);
      if (!file) continue;
      this.openFile(path, file.content, false);
      file.dirty = false;
    }
    const entry = focusPath ?? project.entry ?? paths[0] ?? null;
    if (entry && this.models.has(entry)) {
      this.activateTab(entry);
    } else if (paths[0]) {
      this.activateTab(paths[0]);
    }
  }

  openScratch(name: string, content: string): void {
    this.clearTabs();
    this.openFile(name, content, true);
    this.activateTab(name);
  }

  openFile(path: string, content: string, activate = true): void {
    let model = this.models.get(path);
    if (!model) {
      const lang = path.endsWith(".toml") ? "ini" : JUNI_LANGUAGE_ID;
      const uri = monaco.Uri.parse(`file:///${path}`);
      model = monaco.editor.getModel(uri) ?? monaco.editor.createModel(content, lang, uri);
      this.models.set(path, model);
      this.savedContent.set(path, content);
    } else {
      model.setValue(content);
      this.savedContent.set(path, content);
    }
    this.renderTabs();
    if (activate) this.activateTab(path);
  }

  activateTab(path: string): void {
    const model = this.models.get(path);
    if (!model) return;
    this.activePath = path;
    this.editor.setModel(model);
    this.renderTabs();
    this.onActiveChange?.(path);
    this.attachChangeListener();
  }

  closeTab(path: string): void {
    const model = this.models.get(path);
    if (!model) return;
    model.dispose();
    this.models.delete(path);
    this.savedContent.delete(path);

    if (this.activePath === path) {
      const remaining = [...this.models.keys()];
      const next = remaining[remaining.length - 1] ?? null;
      if (next) {
        this.activateTab(next);
      } else {
        this.activePath = null;
        this.editor.setModel(monaco.editor.createModel("", JUNI_LANGUAGE_ID));
        this.onActiveChange?.(null);
      }
    }
    this.renderTabs();
  }

  markSaved(path: string): void {
    const model = this.models.get(path);
    if (!model) return;
    this.savedContent.set(path, model.getValue());
    this.renderTabs();
    this.onDirtyChange?.(path, false);
  }

  updateProjectFiles(project: ProjectState): void {
    for (const [path, file] of project.files) {
      const model = this.models.get(path);
      if (model) {
        file.content = model.getValue();
        file.dirty = this.isDirty(path);
      }
    }
  }

  dispose(): void {
    this.changeDisposable?.dispose();
    this.editor.dispose();
    for (const model of this.models.values()) model.dispose();
    this.models.clear();
  }

  private clearTabs(): void {
    this.changeDisposable?.dispose();
    for (const model of this.models.values()) model.dispose();
    this.models.clear();
    this.savedContent.clear();
    this.activePath = null;
    this.tabBar.textContent = "";
  }

  private attachChangeListener(): void {
    this.changeDisposable?.dispose();
    this.changeDisposable = this.editor.onDidChangeModelContent(() => {
      if (!this.activePath) return;
      const dirty = this.isDirty(this.activePath);
      this.renderTabs();
      this.onDirtyChange?.(this.activePath, dirty);
    });
  }

  private renderTabs(): void {
    this.tabBar.textContent = "";
    for (const path of [...this.models.keys()].sort((a, b) => a.localeCompare(b))) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "editor-tab";
      if (path === this.activePath) tab.classList.add("is-active");
      if (this.isDirty(path)) tab.classList.add("is-dirty");

      const label = document.createElement("span");
      label.className = "editor-tab-label";
      label.textContent = path.split("/").pop() ?? path;
      tab.title = path;
      tab.appendChild(label);

      const close = document.createElement("span");
      close.className = "editor-tab-close";
      close.textContent = "×";
      close.setAttribute("aria-label", `Close ${path}`);
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeTab(path);
      });
      tab.appendChild(close);

      tab.addEventListener("click", () => this.activateTab(path));
      this.tabBar.appendChild(tab);
    }
  }
}
