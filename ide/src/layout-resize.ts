/** Drag-resize for main IDE columns + side panel width. */

const STORAGE_KEY = "juni.layout.v101";

type LayoutState = {
  /** Fractional column weights for engine-row: files, editor, preview, hierarchy */
  cols: [number, number, number, number];
  /** Side panel width in px */
  sideW: number;
  /** Console pane height in px */
  consoleH: number;
};

const DEFAULTS: LayoutState = {
  cols: [0.55, 1.15, 1.05, 0.75],
  sideW: 360,
  consoleH: 160,
};

function load(): LayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS, cols: [...DEFAULTS.cols] as LayoutState["cols"] };
    const p = JSON.parse(raw) as Partial<LayoutState>;
    const cols: LayoutState["cols"] =
      Array.isArray(p.cols) && p.cols.length === 4
        ? [
            Math.max(0.25, Number(p.cols[0]) || 0.5),
            Math.max(0.25, Number(p.cols[1]) || 0.5),
            Math.max(0.25, Number(p.cols[2]) || 0.5),
            Math.max(0.25, Number(p.cols[3]) || 0.5),
          ]
        : ([...DEFAULTS.cols] as LayoutState["cols"]);
    return {
      cols,
      sideW: Math.min(640, Math.max(240, Number(p.sideW) || DEFAULTS.sideW)),
      consoleH: Math.min(420, Math.max(96, Number(p.consoleH) || DEFAULTS.consoleH)),
    };
  } catch {
    return { ...DEFAULTS, cols: [...DEFAULTS.cols] as LayoutState["cols"] };
  }
}

function save(state: LayoutState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

let state = load();

function applyColumns(): void {
  const row = document.querySelector(".main-row") as HTMLElement | null;
  if (!row) return;
  const [a, b, c, d] = state.cols;
  // Keep 4 tracks so modern CSS `order` and classic layouts stay intact.
  // Resize handles are absolutely positioned on pane edges (not grid items).
  row.style.gridTemplateColumns = `minmax(7rem, ${a}fr) minmax(0, ${b}fr) minmax(10rem, ${c}fr) minmax(9rem, ${d}fr)`;
}

function applySide(): void {
  document.documentElement.style.setProperty("--docs-w", `${state.sideW}px`);
}

function applyConsole(): void {
  const consolePane = document.querySelector(".console-pane") as HTMLElement | null;
  const stage = document.querySelector(".stage") as HTMLElement | null;
  if (!consolePane) return;
  consolePane.style.flex = "none";
  consolePane.style.height = `${state.consoleH}px`;
  if (stage) {
    stage.style.gridTemplateRows = `minmax(0, 1fr) ${state.consoleH}px`;
  }
}

function makeHandle(axis: "x" | "y", onDelta: (dx: number, dy: number) => void): HTMLElement {
  const h = document.createElement("div");
  h.className = axis === "x" ? "layout-resize-x" : "layout-resize-y";
  h.title = "Drag to resize";
  h.setAttribute("role", "separator");
  h.tabIndex = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    onDelta(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("is-resizing");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    save(state);
  };
  h.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    document.body.classList.add("is-resizing");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
  return h;
}

function insertColumnHandles(): void {
  const row = document.querySelector(".main-row");
  if (!row || row.querySelector(".layout-resize-x")) return;
  const kids = [...row.children].filter((el) => el instanceof HTMLElement) as HTMLElement[];
  // Expect: files, editor, preview, engine-side
  if (kids.length < 4) return;
  const pairs: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [2, 3],
  ];
  for (const [leftIdx, rightIdx] of pairs) {
    const left = kids[leftIdx];
    if (getComputedStyle(left).position === "static") {
      left.style.position = "relative";
    }
    const handle = makeHandle("x", (dx) => {
      const total = state.cols[leftIdx] + state.cols[rightIdx];
      const rowEl = document.querySelector(".main-row") as HTMLElement | null;
      if (!rowEl) return;
      const w = rowEl.getBoundingClientRect().width || 1;
      const dFr = (dx / w) * (state.cols[0] + state.cols[1] + state.cols[2] + state.cols[3]);
      let leftW = state.cols[leftIdx] + dFr;
      let rightW = state.cols[rightIdx] - dFr;
      const min = 0.35;
      if (leftW < min) {
        rightW -= min - leftW;
        leftW = min;
      }
      if (rightW < min) {
        leftW -= min - rightW;
        rightW = min;
      }
      if (leftW + rightW > 0) {
        const scale = total / (leftW + rightW);
        leftW *= scale;
        rightW *= scale;
      }
      state.cols[leftIdx] = leftW;
      state.cols[rightIdx] = rightW;
      applyColumns();
    });
    handle.classList.add("layout-resize-pane");
    left.appendChild(handle);
  }
}

function insertSideHandle(): void {
  const workspace = document.querySelector(".workspace");
  if (!workspace || workspace.querySelector(".layout-resize-side")) return;
  const handle = makeHandle("x", (dx) => {
    // Side panel is on the right; dragging left grows panel
    state.sideW = Math.min(640, Math.max(240, state.sideW - dx));
    applySide();
  });
  handle.classList.add("layout-resize-side");
  workspace.appendChild(handle);
}

function insertConsoleHandle(): void {
  const stage = document.querySelector(".stage");
  const consolePane = document.querySelector(".console-pane");
  if (!stage || !consolePane || stage.querySelector(".layout-resize-y")) return;
  const handle = makeHandle("y", (_dx, dy) => {
    state.consoleH = Math.min(420, Math.max(96, state.consoleH - dy));
    applyConsole();
  });
  consolePane.before(handle);
}

export function wireLayoutResize(): void {
  applyColumns();
  applySide();
  applyConsole();
  insertColumnHandles();
  insertSideHandle();
  insertConsoleHandle();
}
