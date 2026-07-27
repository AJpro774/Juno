import "./style.css";
import { GraphCanvas } from "./graph/canvas";
import { BoardStore, statusLabel } from "./graph/store";
import {
  NODE_TYPE_LABELS,
  STEP_STATUSES,
  type NodeType,
  type StepStatus,
} from "./graph/types";

function must<T>(el: T | null, name: string): T {
  if (!el) throw new Error(`LuniSurge shell missing #${name}`);
  return el;
}

const store = new BoardStore();

const canvasHost = must(document.querySelector<HTMLElement>("#canvas-host"), "canvas-host");
const boardNameInput = must(
  document.querySelector<HTMLInputElement>("#board-name"),
  "board-name",
);
const inspectorEmpty = must(
  document.querySelector<HTMLElement>("#inspector-empty"),
  "inspector-empty",
);
const inspectorForm = must(
  document.querySelector<HTMLElement>("#inspector-form"),
  "inspector-form",
);
const fieldTitle = must(document.querySelector<HTMLInputElement>("#field-title"), "field-title");
const fieldBody = must(document.querySelector<HTMLTextAreaElement>("#field-body"), "field-body");
const fieldType = must(document.querySelector<HTMLSelectElement>("#field-type"), "field-type");
const fieldStatus = must(
  document.querySelector<HTMLSelectElement>("#field-status"),
  "field-status",
);
const statusRow = must(document.querySelector<HTMLElement>("#status-row"), "status-row");
const nextList = must(document.querySelector<HTMLElement>("#next-list"), "next-list");
const btnDelete = must(
  document.querySelector<HTMLButtonElement>("#btn-delete-node"),
  "btn-delete-node",
);
const btnClear = must(document.querySelector<HTMLButtonElement>("#btn-clear"), "btn-clear");
const btnDemo = must(document.querySelector<HTMLButtonElement>("#btn-demo"), "btn-demo");
const addMenu = must(document.querySelector<HTMLElement>("#add-menu"), "add-menu");
const btnAdd = must(document.querySelector<HTMLButtonElement>("#btn-add"), "btn-add");

const canvas = new GraphCanvas(canvasHost, store);

function fillTypeSelect(): void {
  fieldType.innerHTML = "";
  for (const [value, label] of Object.entries(NODE_TYPE_LABELS)) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    fieldType.appendChild(opt);
  }
  fieldStatus.innerHTML = "";
  for (const s of STEP_STATUSES) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = statusLabel(s);
    fieldStatus.appendChild(opt);
  }
}

fillTypeSelect();

function renderSide(): void {
  const board = store.getSnapshot();
  if (document.activeElement !== boardNameInput) {
    boardNameInput.value = board.name;
  }

  const node = store.getSelectedNode();
  if (!node) {
    inspectorEmpty.hidden = false;
    inspectorForm.hidden = true;
  } else {
    inspectorEmpty.hidden = true;
    inspectorForm.hidden = false;
    if (document.activeElement !== fieldTitle) fieldTitle.value = node.title;
    if (document.activeElement !== fieldBody) fieldBody.value = node.body;
    if (document.activeElement !== fieldType) fieldType.value = node.type;
    statusRow.hidden = node.type !== "step";
    if (node.type === "step" && document.activeElement !== fieldStatus) {
      fieldStatus.value = node.status ?? "todo";
    }
  }

  const next = store.nextSteps();
  nextList.innerHTML = "";
  if (next.length === 0) {
    const empty = document.createElement("li");
    empty.className = "next-empty";
    empty.textContent = "No open steps — add a step or mark one as to-do.";
    nextList.appendChild(empty);
  } else {
    for (const n of next) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "next-item";
      btn.innerHTML = `<span class="next-status status-${n.status ?? "todo"}">${statusLabel(n.status)}</span><span class="next-title"></span>`;
      btn.querySelector(".next-title")!.textContent = n.title;
      btn.addEventListener("click", () => store.selectNode(n.id));
      li.appendChild(btn);
      nextList.appendChild(li);
    }
  }
}

store.subscribe(renderSide);
renderSide();

boardNameInput.addEventListener("input", () => {
  store.setName(boardNameInput.value);
});

fieldTitle.addEventListener("input", () => {
  const n = store.getSelectedNode();
  if (n) store.updateNode(n.id, { title: fieldTitle.value });
});

fieldBody.addEventListener("input", () => {
  const n = store.getSelectedNode();
  if (n) store.updateNode(n.id, { body: fieldBody.value });
});

fieldType.addEventListener("change", () => {
  const n = store.getSelectedNode();
  if (n) store.updateNode(n.id, { type: fieldType.value as NodeType });
});

fieldStatus.addEventListener("change", () => {
  const n = store.getSelectedNode();
  if (n) store.updateNode(n.id, { status: fieldStatus.value as StepStatus });
});

btnDelete.addEventListener("click", () => store.deleteSelection());

btnClear.addEventListener("click", () => {
  if (confirm("Clear this board? This cannot be undone.")) store.clearBoard();
});

btnDemo.addEventListener("click", () => {
  if (confirm("Replace the board with the demo?")) store.resetDemo();
});

function closeAddMenu(): void {
  addMenu.hidden = true;
  btnAdd.setAttribute("aria-expanded", "false");
}

function openAddMenu(): void {
  addMenu.hidden = false;
  btnAdd.setAttribute("aria-expanded", "true");
}

btnAdd.addEventListener("click", (e) => {
  e.stopPropagation();
  if (addMenu.hidden) openAddMenu();
  else closeAddMenu();
});

addMenu.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-add-type]");
  if (!btn) return;
  const type = btn.dataset.addType as NodeType;
  const at = canvas.centerWorld();
  store.addNode(type, { x: at.x - 100, y: at.y - 44 });
  closeAddMenu();
});

document.querySelectorAll<HTMLButtonElement>("[data-toolbar-type]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.toolbarType as NodeType;
    const at = canvas.centerWorld();
    store.addNode(type, { x: at.x - 100, y: at.y - 44 });
  });
});

document.addEventListener("click", (e) => {
  if (!addMenu.hidden && !(e.target as HTMLElement).closest(".add-wrap")) {
    closeAddMenu();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !addMenu.hidden) closeAddMenu();
});

// Ensure closed on boot even if CSS/UA mishandles the attribute
closeAddMenu();
