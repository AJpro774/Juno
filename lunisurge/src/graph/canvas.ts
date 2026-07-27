import { BoardStore } from "./store";
import { createNodeEl, nodeAnchor } from "./nodes";
import { NODE_TYPE_LABELS, type GraphNode } from "./types";

type Point = { x: number; y: number };

export class GraphCanvas {
  private store: BoardStore;
  private root: HTMLElement;
  private viewport: HTMLElement;
  private world: HTMLElement;
  private wireSvg: SVGSVGElement;
  private nodesLayer: HTMLElement;
  private hint: HTMLElement;

  private wireFrom: string | null = null;
  private draftTo: Point | null = null;
  private panning = false;
  private panLast: Point | null = null;
  private draggingId: string | null = null;
  private dragOffset: Point | null = null;
  private spaceDown = false;

  constructor(root: HTMLElement, store: BoardStore) {
    this.root = root;
    this.store = store;

    this.root.classList.add("graph-canvas");
    this.root.innerHTML = "";
    this.root.tabIndex = 0;

    this.hint = document.createElement("p");
    this.hint.className = "canvas-hint";
    this.hint.textContent =
      "Drag nodes · ports to wire · scroll to zoom · space+drag or middle-drag to pan · Delete to remove";

    this.viewport = document.createElement("div");
    this.viewport.className = "graph-viewport";

    this.world = document.createElement("div");
    this.world.className = "graph-world";

    this.wireSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.wireSvg.classList.add("wire-layer");
    this.wireSvg.setAttribute("aria-hidden", "true");

    this.nodesLayer = document.createElement("div");
    this.nodesLayer.className = "nodes-layer";

    this.world.append(this.wireSvg, this.nodesLayer);
    this.viewport.appendChild(this.world);
    this.root.append(this.hint, this.viewport);

    this.bind();
    this.store.subscribe(() => this.render());
    this.render();
  }

  private bind(): void {
    this.viewport.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    window.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
    this.viewport.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.onWheel(e);
      },
      { passive: false },
    );

    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !isTypingTarget(e.target)) {
        this.spaceDown = true;
        this.root.classList.add("is-pan-ready");
        if (!isTypingTarget(e.target)) e.preventDefault();
      }
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !isTypingTarget(e.target)
      ) {
        e.preventDefault();
        this.store.deleteSelection();
      }
      if (e.key === "Escape") {
        this.cancelWire();
        this.store.clearSelection();
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        this.spaceDown = false;
        this.root.classList.remove("is-pan-ready");
      }
    });
  }

  private screenToWorld(clientX: number, clientY: number): Point {
    const rect = this.viewport.getBoundingClientRect();
    const { x, y, zoom } = this.store.getSnapshot().camera;
    return {
      x: (clientX - rect.left - x) / zoom,
      y: (clientY - rect.top - y) / zoom,
    };
  }

  private onPointerDown(e: PointerEvent): void {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const port = target.closest(".port") as HTMLElement | null;
    if (port) {
      e.preventDefault();
      e.stopPropagation();
      const nodeId = port.dataset.nodeId!;
      const side = port.dataset.port;
      if (side === "out") {
        this.wireFrom = nodeId;
        this.draftTo = this.screenToWorld(e.clientX, e.clientY);
        this.root.classList.add("is-wiring");
        this.renderWires();
      } else if (side === "in" && this.wireFrom) {
        this.store.connect(this.wireFrom, nodeId);
        this.cancelWire();
      }
      return;
    }

    const nodeEl = target.closest(".graph-node") as HTMLElement | null;
    if (nodeEl && !this.spaceDown && e.button === 0) {
      e.preventDefault();
      const id = nodeEl.dataset.id!;
      this.store.selectNode(id);
      const node = this.store.getSnapshot().nodes.find((n) => n.id === id);
      if (!node) return;
      const world = this.screenToWorld(e.clientX, e.clientY);
      this.draggingId = id;
      this.dragOffset = { x: world.x - node.x, y: world.y - node.y };
      this.viewport.setPointerCapture(e.pointerId);
      return;
    }

    const wire = target.closest(".wire-hit") as SVGElement | null;
    if (wire?.dataset.edgeId) {
      this.store.selectEdge(wire.dataset.edgeId);
      return;
    }

    if (e.button === 1 || this.spaceDown || (e.button === 0 && !nodeEl)) {
      e.preventDefault();
      this.panning = true;
      this.panLast = { x: e.clientX, y: e.clientY };
      this.root.classList.add("is-panning");
      if (!nodeEl) this.store.clearSelection();
      this.viewport.setPointerCapture(e.pointerId);
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.wireFrom) {
      this.draftTo = this.screenToWorld(e.clientX, e.clientY);
      this.renderWires();
      return;
    }
    if (this.draggingId && this.dragOffset) {
      const world = this.screenToWorld(e.clientX, e.clientY);
      this.store.moveNode(
        this.draggingId,
        world.x - this.dragOffset.x,
        world.y - this.dragOffset.y,
        false,
      );
      return;
    }
    if (this.panning && this.panLast) {
      const dx = e.clientX - this.panLast.x;
      const dy = e.clientY - this.panLast.y;
      this.panLast = { x: e.clientX, y: e.clientY };
      const cam = this.store.getSnapshot().camera;
      this.store.setCamera({ x: cam.x + dx, y: cam.y + dy });
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.wireFrom) {
      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const port = target?.closest(".port-in") as HTMLElement | null;
      if (port?.dataset.nodeId) {
        this.store.connect(this.wireFrom, port.dataset.nodeId);
      }
      this.cancelWire();
    }
    if (this.draggingId) {
      const id = this.draggingId;
      this.draggingId = null;
      this.dragOffset = null;
      const n = this.store.getSnapshot().nodes.find((node) => node.id === id);
      if (n) this.store.updateNode(n.id, { x: n.x, y: n.y });
    }
    if (this.panning) {
      this.panning = false;
      this.panLast = null;
      this.root.classList.remove("is-panning");
    }
  }

  private onWheel(e: WheelEvent): void {
    const cam = this.store.getSnapshot().camera;
    const rect = this.viewport.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    const next = Math.min(2.4, Math.max(0.35, cam.zoom * factor));
    const wx = (mx - cam.x) / cam.zoom;
    const wy = (my - cam.y) / cam.zoom;
    this.store.setCamera({
      zoom: next,
      x: mx - wx * next,
      y: my - wy * next,
    });
  }

  private cancelWire(): void {
    this.wireFrom = null;
    this.draftTo = null;
    this.root.classList.remove("is-wiring");
    this.renderWires();
  }

  render(): void {
    const board = this.store.getSnapshot();
    const { camera, nodes } = board;
    const selected = this.store.getSelectedId();

    this.world.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`;

    const existing = new Map<string, HTMLElement>();
    for (const child of Array.from(this.nodesLayer.children)) {
      const el = child as HTMLElement;
      if (el.dataset.id) existing.set(el.dataset.id, el);
    }

    const keep = new Set(nodes.map((n) => n.id));
    for (const [id, el] of existing) {
      if (!keep.has(id)) el.remove();
    }

    for (const node of nodes) {
      let el = existing.get(node.id);
      if (!el) {
        el = createNodeEl(node, node.id === selected);
        this.nodesLayer.appendChild(el);
      } else {
        this.syncNodeEl(el, node, node.id === selected);
      }
    }

    this.renderWires();
  }

  private syncNodeEl(el: HTMLElement, node: GraphNode, selected: boolean): void {
    el.className = `graph-node type-${node.type}${selected ? " is-selected" : ""}`;
    el.style.transform = `translate(${node.x}px, ${node.y}px)`;
    const title = el.querySelector(".node-title");
    if (title) title.textContent = node.title || "Untitled";
    const type = el.querySelector(".node-type");
    if (type) type.textContent = NODE_TYPE_LABELS[node.type];
    const meta = el.querySelector(".node-meta");
    if (meta) {
      meta.innerHTML = "";
      if (node.type === "step") {
        const badge = document.createElement("span");
        badge.className = `status-badge status-${node.status ?? "todo"}`;
        const labels: Record<string, string> = {
          todo: "To do",
          doing: "Doing",
          done: "Done",
          blocked: "Blocked",
        };
        badge.textContent = labels[node.status ?? "todo"] ?? "To do";
        meta.appendChild(badge);
      } else if (node.body.trim()) {
        const preview = document.createElement("p");
        preview.className = "node-preview";
        preview.textContent = node.body.trim().slice(0, 72);
        meta.appendChild(preview);
      }
    }
  }

  private renderWires(): void {
    const board = this.store.getSnapshot();
    const byId = new Map(board.nodes.map((n) => [n.id, n]));
    const selectedEdge = this.store.getSelectedEdgeId();
    const ns = "http://www.w3.org/2000/svg";

    while (this.wireSvg.firstChild) this.wireSvg.removeChild(this.wireSvg.firstChild);

    // Large canvas for SVG; nodes can be anywhere
    const pad = 4000;
    this.wireSvg.setAttribute("width", String(pad));
    this.wireSvg.setAttribute("height", String(pad));
    this.wireSvg.style.left = "0";
    this.wireSvg.style.top = "0";
    this.wireSvg.style.overflow = "visible";

    for (const edge of board.edges) {
      const a = byId.get(edge.from);
      const b = byId.get(edge.to);
      if (!a || !b) continue;
      const from = nodeAnchor(a, "out");
      const to = nodeAnchor(b, "in");
      const path = bezierPath(from, to);

      const hit = document.createElementNS(ns, "path");
      hit.setAttribute("d", path);
      hit.setAttribute("class", "wire-hit");
      hit.dataset.edgeId = edge.id;

      const line = document.createElementNS(ns, "path");
      line.setAttribute("d", path);
      line.setAttribute(
        "class",
        `wire-path${selectedEdge === edge.id ? " is-selected" : ""}`,
      );
      line.dataset.edgeId = edge.id;

      this.wireSvg.append(hit, line);
    }

    if (this.wireFrom && this.draftTo) {
      const a = byId.get(this.wireFrom);
      if (a) {
        const from = nodeAnchor(a, "out");
        const draft = document.createElementNS(ns, "path");
        draft.setAttribute("d", bezierPath(from, this.draftTo));
        draft.setAttribute("class", "wire-path is-draft");
        this.wireSvg.appendChild(draft);
      }
    }
  }

  /** World coords under viewport center — for placing new nodes. */
  centerWorld(): Point {
    const rect = this.viewport.getBoundingClientRect();
    return this.screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
}

function bezierPath(from: Point, to: Point): string {
  const dx = Math.max(60, Math.abs(to.x - from.x) * 0.45);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}
