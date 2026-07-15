import type * as Monaco from "monaco-editor";
import { setupCompletionLite, setupGotoDefLite } from "./completion-lite";

type LspRequest = {
  method: string;
  params: Record<string, unknown>;
};

type LspLocation = {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
};

declare global {
  interface Window {
    __TAURI__?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
  }
}

function isTauri(): boolean {
  return typeof window.__TAURI__?.invoke === "function";
}

async function tauriLspRequest(req: LspRequest): Promise<unknown> {
  return window.__TAURI__!.invoke("lsp_request", { request: req });
}

export function setupLspClient(
  monaco: typeof Monaco,
  languageId: string,
  _getSource: () => string,
  getFilePath: () => string,
): Monaco.IDisposable[] {
  if (!isTauri()) {
    return [];
  }

  const completion = monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: [".", ":"],
    async provideCompletionItems(_model, position) {
      try {
        const result = (await tauriLspRequest({
          method: "textDocument/completion",
          params: {
            textDocument: { uri: getFilePath() },
            position: {
              line: position.lineNumber - 1,
              character: position.column - 1,
            },
          },
        })) as { items?: Array<{ label: string; kind?: number; detail?: string }> } | null;

        const items = Array.isArray(result)
          ? result
          : (result as { items?: Array<{ label: string; kind?: number; detail?: string }> })?.items ?? [];

        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column,
          endColumn: position.column,
        };

        return {
          suggestions: items.map((item) => ({
            label: item.label,
            kind: item.kind ?? 0,
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
        const result = (await tauriLspRequest({
          method: "textDocument/definition",
          params: {
            textDocument: { uri: getFilePath() },
            position: {
              line: position.lineNumber - 1,
              character: position.column - 1,
            },
          },
        })) as LspLocation | LspLocation[] | null;

        const loc = Array.isArray(result) ? result[0] : result;
        if (!loc?.range) return null;

        return {
          uri: monaco.Uri.parse(loc.uri),
          range: {
            startLineNumber: loc.range.start.line + 1,
            startColumn: loc.range.start.character + 1,
            endLineNumber: loc.range.end.line + 1,
            endColumn: loc.range.end.character + 1,
          },
        };
      } catch {
        return null;
      }
    },
  });

  return [completion, definition];
}

export function setupEditorIntelliSense(
  monaco: typeof Monaco,
  languageId: string,
  wasmApi: {
    complete_source: (source: string, line: number, col: number) => string;
    goto_def_source: (source: string, line: number, col: number) => string;
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
  ];
}
