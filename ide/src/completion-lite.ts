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
