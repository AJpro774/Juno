import { NODE_TYPE_LABELS, NODE_H, NODE_W, type GraphNode } from "./types";
import { statusLabel } from "./store";

export function createNodeEl(node: GraphNode, selected: boolean): HTMLElement {
  const el = document.createElement("article");
  el.className = `graph-node type-${node.type}${selected ? " is-selected" : ""}`;
  el.dataset.id = node.id;
  el.dataset.type = node.type;
  el.style.width = `${NODE_W}px`;
  el.style.minHeight = `${NODE_H}px`;
  el.style.transform = `translate(${node.x}px, ${node.y}px)`;
  el.setAttribute("role", "button");
  el.tabIndex = 0;
  el.setAttribute("aria-label", `${NODE_TYPE_LABELS[node.type]}: ${node.title}`);

  const type = document.createElement("span");
  type.className = "node-type";
  type.textContent = NODE_TYPE_LABELS[node.type];

  const title = document.createElement("h3");
  title.className = "node-title";
  title.textContent = node.title || "Untitled";

  const meta = document.createElement("div");
  meta.className = "node-meta";
  if (node.type === "step") {
    const badge = document.createElement("span");
    badge.className = `status-badge status-${node.status ?? "todo"}`;
    badge.textContent = statusLabel(node.status);
    meta.appendChild(badge);
  } else if (node.body.trim()) {
    const preview = document.createElement("p");
    preview.className = "node-preview";
    preview.textContent = node.body.trim().slice(0, 72);
    meta.appendChild(preview);
  }

  const inPort = document.createElement("button");
  inPort.type = "button";
  inPort.className = "port port-in";
  inPort.dataset.port = "in";
  inPort.dataset.nodeId = node.id;
  inPort.title = "Connect here";
  inPort.setAttribute("aria-label", "Input port");

  const outPort = document.createElement("button");
  outPort.type = "button";
  outPort.className = "port port-out";
  outPort.dataset.port = "out";
  outPort.dataset.nodeId = node.id;
  outPort.title = "Drag to connect";
  outPort.setAttribute("aria-label", "Output port");

  el.append(type, title, meta, inPort, outPort);
  return el;
}

export function nodeAnchor(
  node: GraphNode,
  side: "in" | "out",
): { x: number; y: number } {
  const cy = node.y + NODE_H / 2;
  if (side === "in") return { x: node.x, y: cy };
  return { x: node.x + NODE_W, y: cy };
}
