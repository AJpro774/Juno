/**
 * Monaco CodeAction provider: suggest Juni fixes via local AI (confirm before apply).
 */

import type * as Monaco from "monaco-editor";
import { isAiEnabled, suggestFix, type DiagLike } from "./agent";

export type AutocorrectDeps = {
  getSource: () => string;
  getDiagnostics: () => DiagLike[];
  logLine: (text: string, cls?: string) => void;
  showFixPreview: (original: string, proposed: string, apply: () => void) => void;
};

const COMMAND_ID = "juni.ai.fixSelection";

export function setupAiAutocorrect(
  monaco: typeof Monaco,
  languageId: string,
  editor: Monaco.editor.IStandaloneCodeEditor,
  deps: AutocorrectDeps
): Monaco.IDisposable[] {
  const disposables: Monaco.IDisposable[] = [];

  disposables.push(
    monaco.editor.registerCommand(COMMAND_ID, async () => {
      if (!isAiEnabled()) {
        deps.logLine("Enable the AI assistant first (AI panel).", "meta");
        return;
      }
      const model = editor.getModel();
      if (!model) return;
      const sel = editor.getSelection();
      if (!sel) return;
      let range: Monaco.IRange = sel;
      if (sel.isEmpty()) {
        const line = sel.startLineNumber;
        range = new monaco.Range(line, 1, line, model.getLineMaxColumn(line));
      }
      const selectionText = model.getValueInRange(range);
      if (!selectionText.trim()) {
        deps.logLine("Select some Juni code to fix.", "meta");
        return;
      }
      deps.logLine("AI: suggesting fix…", "meta");
      try {
        const proposed = await suggestFix(
          deps.getSource(),
          selectionText,
          deps.getDiagnostics()
        );
        if (!proposed.trim()) {
          deps.logLine("AI returned an empty fix.", "err");
          return;
        }
        deps.showFixPreview(selectionText, proposed, () => {
          editor.executeEdits("juni-ai-fix", [
            {
              range,
              text: proposed,
            },
          ]);
          deps.logLine("Applied AI fix.", "meta");
        });
      } catch (e) {
        deps.logLine(String(e), "err");
      }
    })
  );

  disposables.push(
    monaco.languages.registerCodeActionProvider(languageId, {
      provideCodeActions() {
        if (!isAiEnabled()) return { actions: [], dispose() {} };
        return {
          actions: [
            {
              title: "Suggest fix (local AI)",
              kind: "quickfix",
              command: {
                id: COMMAND_ID,
                title: "Suggest fix (local AI)",
              },
            },
          ],
          dispose() {},
        };
      },
    })
  );

  disposables.push(
    editor.addAction({
      id: "juni-ai-fix-selection-action",
      label: "Juni: Fix selection with local AI",
      contextMenuGroupId: "modification",
      contextMenuOrder: 1.5,
      run: () => {
        editor.trigger("juni-ai", COMMAND_ID, null);
      },
    })
  );

  return disposables;
}
