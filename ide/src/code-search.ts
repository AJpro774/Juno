/**
 * Code Search panel — query + category filters across project `.juni` files.
 */
import {
  JUNI_CATEGORY_LABELS,
  JUNI_TOKEN_CATEGORIES,
  categoryOfIdent,
  wordsForCategories,
  type JuniTokenCategory,
} from "./juni-lang";

export type CodeSearchHit = {
  path: string;
  line: number;
  col: number;
  endCol: number;
  text: string;
  category: JuniTokenCategory | null;
};

export type CodeSearchDeps = {
  /** All searchable .juni path → content (project + open buffers). */
  getJuniFiles: () => Map<string, string>;
  jumpTo: (path: string, line: number, col: number, endCol: number) => void;
};

const IDENT_RE = /[a-zA-Z_][\w]*/g;

export function searchJuniFiles(
  files: Map<string, string>,
  query: string,
  categories: readonly JuniTokenCategory[],
): CodeSearchHit[] {
  const q = query.trim().toLowerCase();
  const catSet = new Set(categories);
  const filterByCat = catSet.size > 0;
  const categoryWords = filterByCat
    ? new Set(wordsForCategories(categories).map((w) => w.toLowerCase()))
    : null;

  if (!q && !filterByCat) return [];

  const hits: CodeSearchHit[] = [];

  for (const [path, content] of files) {
    if (!path.endsWith(".juni")) continue;
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i] ?? "";
      IDENT_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = IDENT_RE.exec(lineText)) !== null) {
        const word = m[0];
        const wordLower = word.toLowerCase();
        const cat = categoryOfIdent(word);

        if (filterByCat) {
          if (!cat || !catSet.has(cat)) continue;
          if (categoryWords && !categoryWords.has(wordLower)) continue;
        }

        if (q && !wordLower.includes(q)) continue;

        hits.push({
          path,
          line: i + 1,
          col: m.index + 1,
          endCol: m.index + 1 + word.length,
          text: lineText.trim(),
          category: cat,
        });

        if (hits.length >= 500) return hits;
      }

      // Non-identifier substring match when no category filter (or query is free text).
      if (q && !filterByCat) {
        const lower = lineText.toLowerCase();
        let from = 0;
        while (from < lower.length) {
          const idx = lower.indexOf(q, from);
          if (idx < 0) break;
          // Skip if already covered by an identifier hit on this span.
          const already = hits.some(
            (h) =>
              h.path === path &&
              h.line === i + 1 &&
              h.col <= idx + 1 &&
              h.endCol >= idx + 1 + q.length,
          );
          if (!already) {
            hits.push({
              path,
              line: i + 1,
              col: idx + 1,
              endCol: idx + 1 + q.length,
              text: lineText.trim(),
              category: null,
            });
            if (hits.length >= 500) return hits;
          }
          from = idx + Math.max(q.length, 1);
        }
      }
    }
  }

  return hits;
}

export function wireCodeSearchPanel(deps: CodeSearchDeps): {
  setOpen: (open: boolean) => void;
  refresh: () => void;
} {
  const panel = document.getElementById("search-panel") as HTMLElement | null;
  const queryInput = document.getElementById("search-query") as HTMLInputElement | null;
  const catsHost = document.getElementById("search-categories") as HTMLElement | null;
  const resultsHost = document.getElementById("search-results") as HTMLElement | null;
  const statusEl = document.getElementById("search-status") as HTMLElement | null;
  const runBtn = document.getElementById("search-run") as HTMLButtonElement | null;

  if (!panel || !queryInput || !catsHost || !resultsHost || !statusEl) {
    return { setOpen: () => undefined, refresh: () => undefined };
  }

  const selected = new Set<JuniTokenCategory>();

  catsHost.textContent = "";
  for (const cat of JUNI_TOKEN_CATEGORIES) {
    const label = document.createElement("label");
    label.className = "search-cat";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = cat;
    cb.addEventListener("change", () => {
      if (cb.checked) selected.add(cat);
      else selected.delete(cat);
      runSearch();
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(JUNI_CATEGORY_LABELS[cat]));
    catsHost.appendChild(label);
  }

  function renderResults(hits: CodeSearchHit[]): void {
    resultsHost!.textContent = "";
    if (hits.length === 0) {
      const empty = document.createElement("p");
      empty.className = "search-empty";
      empty.textContent = "No matches.";
      resultsHost!.appendChild(empty);
      return;
    }
    for (const hit of hits) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "search-hit";
      const loc = document.createElement("span");
      loc.className = "search-hit-loc";
      loc.textContent = `${hit.path}:${hit.line}`;
      const cat = document.createElement("span");
      cat.className = "search-hit-cat";
      cat.textContent = hit.category ? JUNI_CATEGORY_LABELS[hit.category] : "text";
      const preview = document.createElement("span");
      preview.className = "search-hit-text";
      preview.textContent = hit.text;
      btn.appendChild(loc);
      btn.appendChild(cat);
      btn.appendChild(preview);
      btn.title = hit.text;
      btn.addEventListener("click", () => {
        deps.jumpTo(hit.path, hit.line, hit.col, hit.endCol);
      });
      resultsHost!.appendChild(btn);
    }
  }

  function runSearch(): void {
    const files = deps.getJuniFiles();
    if (files.size === 0) {
      statusEl!.textContent = "Open a project (or scratch) with .juni files.";
      resultsHost!.textContent = "";
      return;
    }
    const cats = [...selected];
    const q = queryInput!.value;
    if (!q.trim() && cats.length === 0) {
      statusEl!.textContent = "Enter a query and/or select categories.";
      resultsHost!.textContent = "";
      return;
    }
    const hits = searchJuniFiles(files, q, cats);
    statusEl!.textContent = `${hits.length} match${hits.length === 1 ? "" : "es"} in ${files.size} file${files.size === 1 ? "" : "s"}`;
    renderResults(hits);
  }

  let debounce: ReturnType<typeof setTimeout> | null = null;
  queryInput.addEventListener("input", () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(runSearch, 180);
  });
  queryInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runSearch();
    }
  });
  runBtn?.addEventListener("click", () => runSearch());

  return {
    setOpen: (open: boolean) => {
      if (open) {
        runSearch();
        queryInput.focus();
      }
    },
    refresh: runSearch,
  };
}
