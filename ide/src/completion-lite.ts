import type * as Monaco from "monaco-editor";

type CompletionItem = {
  label: string;
  kind: string;
  detail?: string;
  insertText?: string;
};

type CompleteResult = {
  items: CompletionItem[];
};

const KIND_MAP: Record<string, Monaco.languages.CompletionItemKind> = {
  function: 1,
  struct: 22,
  variable: 6,
  module: 9,
  keyword: 17,
  type: 25,
};

export function setupCompletionLite(
  monaco: typeof Monaco,
  languageId: string,
  completeFn: (source: string, line: number, col: number) => string,
  getSource: () => string,
): Monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: [".", ":"],
    provideCompletionItems(_model, position) {
      const source = getSource();
      let parsed: CompleteResult = { items: [] };
      try {
        parsed = JSON.parse(
          completeFn(source, position.lineNumber, position.column),
        ) as CompleteResult;
      } catch {
        return { suggestions: [] };
      }

      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: position.column,
        endColumn: position.column,
      };

      const suggestions: Monaco.languages.CompletionItem[] = (parsed.items ?? []).map(
        (item) => ({
          label: item.label,
          kind: KIND_MAP[item.kind] ?? 0,
          detail: item.detail,
          insertText: item.insertText ?? item.label,
          range,
        }),
      );

      return { suggestions };
    },
  });
}

type GotoDefResult = {
  location: {
    file: string;
    line: number;
    col: number;
    endLine: number;
    endCol: number;
  } | null;
};

export function setupGotoDefLite(
  monaco: typeof Monaco,
  languageId: string,
  gotoFn: (source: string, line: number, col: number) => string,
  getSource: () => string,
): Monaco.IDisposable {
  return monaco.languages.registerDefinitionProvider(languageId, {
    provideDefinition(model, position) {
      const source = getSource();
      let parsed: GotoDefResult = { location: null };
      try {
        parsed = JSON.parse(
          gotoFn(source, position.lineNumber, position.column),
        ) as GotoDefResult;
      } catch {
        return null;
      }
      const loc = parsed.location;
      if (!loc) return null;
      return {
        uri: model.uri,
        range: {
          startLineNumber: loc.line,
          startColumn: loc.col,
          endLineNumber: loc.endLine || loc.line,
          endColumn: Math.max(loc.endCol || loc.col + 1, loc.col + 1),
        },
      };
    },
  });
}

type HoverLiteResult = {
  hover: {
    contents: string;
    line: number;
    col: number;
    end_line: number;
    end_col: number;
  } | null;
};

export function setupHoverLite(
  monaco: typeof Monaco,
  languageId: string,
  hoverFn: (source: string, line: number, col: number) => string,
  getSource: () => string,
): Monaco.IDisposable {
  return monaco.languages.registerHoverProvider(languageId, {
    provideHover(_model, position) {
      const source = getSource();
      let parsed: HoverLiteResult = { hover: null };
      try {
        parsed = JSON.parse(
          hoverFn(source, position.lineNumber, position.column),
        ) as HoverLiteResult;
      } catch {
        return null;
      }
      const h = parsed.hover;
      if (!h?.contents) return null;
      return {
        contents: [{ value: h.contents }],
        range: {
          startLineNumber: h.line,
          startColumn: h.col,
          endLineNumber: h.end_line || h.line,
          endColumn: Math.max(h.end_col || h.col + 1, h.col + 1),
        },
      };
    },
  });
}

type DiagLiteItem = {
  severity: string;
  message: string;
  line: number;
  col: number;
  end_line: number;
  end_col: number;
};

type DiagLiteResult = {
  items?: DiagLiteItem[];
};

export function setupDiagnosticsLite(
  monaco: typeof Monaco,
  languageId: string,
  diagnosticsFn: (source: string) => string,
  getSource: () => string,
): Monaco.IDisposable {
  let diagTimer: ReturnType<typeof setTimeout> | null = null;

  const severityToMarker = (severity: string): Monaco.MarkerSeverity =>
    severity === "warning" ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error;

  const refresh = (model: Monaco.editor.ITextModel) => {
    if (diagTimer) clearTimeout(diagTimer);
    diagTimer = setTimeout(() => {
      try {
        const parsed = JSON.parse(diagnosticsFn(getSource())) as DiagLiteResult;
        const items = parsed.items ?? [];
        monaco.editor.setModelMarkers(
          model,
          "juni-lsp",
          items.map((d) => ({
            severity: severityToMarker(d.severity),
            message: d.message,
            startLineNumber: d.line,
            startColumn: d.col,
            endLineNumber: d.end_line || d.line,
            endColumn: Math.max(d.end_col || d.col + 1, d.col + 1),
          })),
        );
      } catch {
        /* ignore */
      }
    }, 350);
  };

  const modelDisp = monaco.editor.onDidCreateModel((model) => {
    if (model.getLanguageId() !== languageId) return;
    refresh(model);
    model.onDidChangeContent(() => refresh(model));
  });

  for (const model of monaco.editor.getModels()) {
    if (model.getLanguageId() !== languageId) continue;
    refresh(model);
    model.onDidChangeContent(() => refresh(model));
  }

  return modelDisp;
}
