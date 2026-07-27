export type NodeType = "goal" | "step" | "note" | "decision";
export type StepStatus = "todo" | "doing" | "done" | "blocked";

export interface GraphNode {
  id: string;
  type: NodeType;
  title: string;
  body: string;
  status?: StepStatus;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Board {
  version: 1;
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  camera: Camera;
}

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  goal: "Goal",
  step: "Step",
  note: "Note",
  decision: "Decision",
};

export const STEP_STATUSES: StepStatus[] = ["todo", "doing", "done", "blocked"];

export const STORAGE_KEY = "luni.board.v1";

export const NODE_W = 200;
export const NODE_H = 88;
