import type * as Monaco from "monaco-editor";
import {
  setupCompletionLite,
  setupDiagnosticsLite,
  setupGotoDefLite,
  setupHoverLite,
} from "./completion-lite";

type LspRequest = {
  method: string;
  params: Record<string, unknown>;
};

type LspLocation = {
  uri?: string;
  file?: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  line?: number;
  col?: number;
  end_line?: number;
  end_col?: number;
};

type LspHover = {
  contents: string;
  line: number;
  col: number;
  end_line: number;
  end_col: number;
};

type LspDiagnostic = {
  severity: string;
  message: string;
  line: number;
  col: number;
  end_line: number;
  end_col: number;
  file?: string;
};

declare global {
  interface Window {
    __TAURI__?: {
      invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      core?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
    };
  }
}

function isTauri(): boolean {
  return typeof window.__TAURI__?.invoke === "function" || typeof window.__TAURI__?.core?.invoke === "function";
}

async function tauriInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
  if (!invoke) throw new Error("Tauri invoke unavailable");
  return invoke(cmd, args);
}

async function tauriLspRequest(req: LspRequest): Promise<unknown> {
  return tauriInvoke("lsp_request", { request: req });
}

function severityToMarker(
  monaco: typeof Monaco,
  severity: string
): Monaco.MarkerSeverity {
  return severity === "warning" ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error;
}

export function setupLspClient(
  monaco: typeof Monaco,
  languageId: string,
  getSource: () => string,
  getFilePath: () => string,
): Monaco.IDisposable[] {
  if (!isTauri()) {
    return [];
  }

  const syncDoc = async (uri: string, text: string) => {
    try {
      await tauriLspRequest({
        method: "textDocument/didChange",
        params: {
          textDocument: { uri },
          text,
        },
      });
    } catch {
      /* ignore */
    }
  };

  const completion = monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: [".", ":"],
    async provideCompletionItems(_model, position) {
      try {
        const uri = getFilePath();
        await syncDoc(uri, getSource());
        const result = (await tauriLspRequest({
          method: "textDocument/completion",
          params: {
            textDocument: { uri },
            position: {
              line: position.lineNumber - 1,
              character: position.column - 1,
            },
          },
        })) as { items?: Array<{ label: string; kind?: string | number; detail?: string }> } | null;

        const items = Array.isArray(result)
          ? result
          : result?.items ?? [];

        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column,
          endColumn: position.column,
        };

        return {
          suggestions: items.map((item) => ({
            label: item.label,
            kind: typeof item.kind === "number" ? item.kind : 0,
            detail: item.detail,
            insertText: item.label,
            range,
          })),
        };
      } catch {
        return { suggestions: [] };
      }
    },
  });

  const definition = monaco.languages.registerDefinitionProvider(languageId, {
    async provideDefinition(_model, position) {
      try {
        const uri = getFilePath();
        await syncDoc(uri, getSource());
        const result = (await tauriLspRequest({
          method: "textDocument/definition",
          params: {
            textDocument: { uri },
            position: {
              line: position.lineNumber - 1,
              character: position.column - 1,
            },
          },
        })) as { location?: LspLocation } | LspLocation | null;

        const loc =
          result && "location" in result
            ? (result.location as LspLocation | null)
            : (result as LspLocation | null);
        if (!loc) return null;

        if (loc.range) {
          return {
            uri: monaco.Uri.parse(loc.uri || getFilePath()),
            range: {
              startLineNumber: loc.range.start.line + 1,
              startColumn: loc.range.start.character + 1,
              endLineNumber: loc.range.end.line + 1,
              endColumn: loc.range.end.character + 1,
            },
          };
        }
        if (loc.line != null && loc.col != null) {
          return {
            uri: monaco.Uri.parse(loc.file || loc.uri || getFilePath()),
            range: {
              startLineNumber: loc.line,
              startColumn: loc.col,
              endLineNumber: loc.end_line ?? loc.line,
              endColumn: loc.end_col ?? loc.col + 1,
            },
          };
        }
        return null;
      } catch {
        return null;
      }
    },
  });

  const hover = monaco.languages.registerHoverProvider(languageId, {
    async provideHover(_model, position) {
      try {
        const uri = getFilePath();
        await syncDoc(uri, getSource());
        const result = (await tauriLspRequest({
          method: "textDocument/hover",
          params: {
            textDocument: { uri },
            position: {
              line: position.lineNumber - 1,
              character: position.column - 1,
            },
          },
        })) as { hover?: LspHover | null } | null;
        const h = result?.hover;
        if (!h?.contents) return null;
        return {
          contents: [{ value: h.contents }],
          range: {
            startLineNumber: h.line,
            startColumn: h.col,
            endLineNumber: h.end_line,
            endColumn: h.end_col,
          },
        };
      } catch {
        return null;
      }
    },
  });

  let diagTimer: ReturnType<typeof setTimeout> | null = null;
  const refreshDiagnostics = (model: Monaco.editor.ITextModel) => {
    if (diagTimer) clearTimeout(diagTimer);
    diagTimer = setTimeout(async () => {
      try {
        const uri = getFilePath();
        await syncDoc(uri, model.getValue());
        const result = (await tauriLspRequest({
          method: "textDocument/diagnostic",
          params: { textDocument: { uri } },
        })) as { items?: LspDiagnostic[] } | null;
        const items = result?.items ?? [];
        monaco.editor.setModelMarkers(
          model,
          "juni-lsp",
          items.map((d) => ({
            severity: severityToMarker(monaco, d.severity),
            message: d.message,
            startLineNumber: d.line,
            startColumn: d.col,
            endLineNumber: d.end_line || d.line,
            endColumn: Math.max(d.end_col || d.col + 1, d.col + 1),
          }))
        );
      } catch {
        /* ignore */
      }
    }, 350);
  };

  const modelDisp = monaco.editor.onDidCreateModel((model) => {
    if (model.getLanguageId() !== languageId) return;
    refreshDiagnostics(model);
    model.onDidChangeContent(() => refreshDiagnostics(model));
  });

  return [completion, definition, hover, modelDisp];
}

export function setupEditorIntelliSense(
  monaco: typeof Monaco,
  languageId: string,
  wasmApi: {
    complete_source: (source: string, line: number, col: number) => string;
    goto_def_source: (source: string, line: number, col: number) => string;
    hover_source: (source: string, line: number, col: number) => string;
    diagnostics_source: (source: string) => string;
  },
  getSource: () => string,
  getFilePath: () => string,
): Monaco.IDisposable[] {
  if (isTauri()) {
    return setupLspClient(monaco, languageId, getSource, getFilePath);
  }

  return [
    setupCompletionLite(
      monaco,
      languageId,
      wasmApi.complete_source,
      getSource,
    ),
    setupGotoDefLite(monaco, languageId, wasmApi.goto_def_source, getSource),
    setupHoverLite(monaco, languageId, wasmApi.hover_source, getSource),
    setupDiagnosticsLite(
      monaco,
      languageId,
      wasmApi.diagnostics_source,
      getSource,
    ),
  ];
}
