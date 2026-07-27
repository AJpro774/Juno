/**
 * LunoEngine board store — graph model, selection, wiring, next-steps, localStorage.
 * Parallel to KunoEngine (Kuni) / JunoEngine (Juni).
 */
import {
  type Board,
  type Camera,
  type GraphEdge,
  type GraphNode,
  type NodeType,
  type StepStatus,
  STORAGE_KEY,
} from "./types";
import { createDemoBoard } from "./demo";

export type BoardListener = () => void;

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function cloneBoard(board: Board): Board {
  return structuredClone(board);
}

export class BoardStore {
  private board: Board;
  private listeners = new Set<BoardListener>();
  private selectedId: string | null = null;
  private selectedEdgeId: string | null = null;

  constructor(initial?: Board) {
    this.board = initial ? cloneBoard(initial) : loadOrDemo();
  }

  subscribe(fn: BoardListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
    this.persist();
  }

  getSnapshot(): Board {
    return this.board;
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  getSelectedEdgeId(): string | null {
    return this.selectedEdgeId;
  }

  getSelectedNode(): GraphNode | null {
    if (!this.selectedId) return null;
    return this.board.nodes.find((n) => n.id === this.selectedId) ?? null;
  }

  setName(name: string): void {
    this.board.name = name;
    this.emit();
  }

  setCamera(camera: Partial<Camera>): void {
    this.board.camera = { ...this.board.camera, ...camera };
    this.emit();
  }

  selectNode(id: string | null): void {
    this.selectedId = id;
    this.selectedEdgeId = null;
    this.emit();
  }

  selectEdge(id: string | null): void {
    this.selectedEdgeId = id;
    this.selectedId = null;
    this.emit();
  }

  clearSelection(): void {
    this.selectedId = null;
    this.selectedEdgeId = null;
    this.emit();
  }

  addNode(type: NodeType, at?: { x: number; y: number }): GraphNode {
    const cam = this.board.camera;
    const x = at?.x ?? -cam.x / cam.zoom + 120 + this.board.nodes.length * 12;
    const y = at?.y ?? -cam.y / cam.zoom + 80 + this.board.nodes.length * 10;
    const node: GraphNode = {
      id: uid("n"),
      type,
      title: defaultTitle(type),
      body: "",
      status: type === "step" ? "todo" : undefined,
      x,
      y,
    };
    this.board.nodes.push(node);
    this.selectedId = node.id;
    this.selectedEdgeId = null;
    this.emit();
    return node;
  }

  updateNode(
    id: string,
    patch: Partial<Pick<GraphNode, "title" | "body" | "type" | "status" | "x" | "y">>,
  ): void {
    const node = this.board.nodes.find((n) => n.id === id);
    if (!node) return;
    if (patch.title !== undefined) node.title = patch.title;
    if (patch.body !== undefined) node.body = patch.body;
    if (patch.type !== undefined) {
      node.type = patch.type;
      if (patch.type === "step" && !node.status) node.status = "todo";
      if (patch.type !== "step") delete node.status;
    }
    if (patch.status !== undefined && node.type === "step") {
      node.status = patch.status;
    }
    if (patch.x !== undefined) node.x = patch.x;
    if (patch.y !== undefined) node.y = patch.y;
    this.emit();
  }

  moveNode(id: string, x: number, y: number, persist = true): void {
    const node = this.board.nodes.find((n) => n.id === id);
    if (!node) return;
    node.x = x;
    node.y = y;
    if (persist) this.emit();
    else for (const fn of this.listeners) fn();
  }

  deleteNode(id: string): void {
    this.board.nodes = this.board.nodes.filter((n) => n.id !== id);
    this.board.edges = this.board.edges.filter((e) => e.from !== id && e.to !== id);
    if (this.selectedId === id) this.selectedId = null;
    this.emit();
  }

  connect(from: string, to: string): GraphEdge | null {
    if (from === to) return null;
    if (this.board.edges.some((e) => e.from === from && e.to === to)) return null;
    if (wouldCreateCycle(this.board, from, to)) return null;
    const edge: GraphEdge = { id: uid("e"), from, to };
    this.board.edges.push(edge);
    this.emit();
    return edge;
  }

  deleteEdge(id: string): void {
    this.board.edges = this.board.edges.filter((e) => e.id !== id);
    if (this.selectedEdgeId === id) this.selectedEdgeId = null;
    this.emit();
  }

  deleteSelection(): void {
    if (this.selectedId) {
      this.deleteNode(this.selectedId);
      return;
    }
    if (this.selectedEdgeId) this.deleteEdge(this.selectedEdgeId);
  }

  clearBoard(): void {
    this.board = {
      version: 1,
      name: "Untitled board",
      nodes: [],
      edges: [],
      camera: { x: 0, y: 0, zoom: 1 },
    };
    this.selectedId = null;
    this.selectedEdgeId = null;
    this.emit();
  }

  resetDemo(): void {
    this.board = createDemoBoard();
    this.selectedId = null;
    this.selectedEdgeId = null;
    this.emit();
  }

  /** Incomplete steps with no incomplete upstream prerequisites, then by depth. */
  nextSteps(): GraphNode[] {
    const { nodes, edges } = this.board;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const incomplete = (n: GraphNode) =>
      n.type === "step" && n.status !== "done";

    const preds = new Map<string, string[]>();
    for (const e of edges) {
      const list = preds.get(e.to) ?? [];
      list.push(e.from);
      preds.set(e.to, list);
    }

    const depth = (id: string, seen = new Set<string>()): number => {
      if (seen.has(id)) return 0;
      seen.add(id);
      const ps = preds.get(id) ?? [];
      if (ps.length === 0) return 0;
      return 1 + Math.max(...ps.map((p) => depth(p, seen)));
    };

    const ready = nodes.filter((n) => {
      if (!incomplete(n)) return false;
      const upstream = preds.get(n.id) ?? [];
      return upstream.every((pid) => {
        const p = byId.get(pid);
        if (!p) return true;
        if (p.type === "step") return p.status === "done";
        return true;
      });
    });

    return ready.sort((a, b) => depth(a.id) - depth(b.id) || a.title.localeCompare(b.title));
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.board));
    } catch {
      /* quota / private mode */
    }
  }
}

function defaultTitle(type: NodeType): string {
  switch (type) {
    case "goal":
      return "New goal";
    case "step":
      return "New step";
    case "note":
      return "New note";
    case "decision":
      return "New decision";
  }
}

function wouldCreateCycle(board: Board, from: string, to: string): boolean {
  const adj = new Map<string, string[]>();
  for (const e of board.edges) {
    const list = adj.get(e.from) ?? [];
    list.push(e.to);
    adj.set(e.from, list);
  }
  const stack = [to];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === from) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const n of adj.get(cur) ?? []) stack.push(n);
  }
  return false;
}

function loadOrDemo(): Board {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Board;
      if (parsed?.version === 1 && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
        return {
          version: 1,
          name: parsed.name || "Board",
          nodes: parsed.nodes,
          edges: parsed.edges,
          camera: parsed.camera ?? { x: 0, y: 0, zoom: 1 },
        };
      }
    }
  } catch {
    /* ignore */
  }
  return createDemoBoard();
}

export function statusLabel(status: StepStatus | undefined): string {
  switch (status) {
    case "doing":
      return "Doing";
    case "done":
      return "Done";
    case "blocked":
      return "Blocked";
    case "todo":
    default:
      return "To do";
  }
}
