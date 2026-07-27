import type { Board } from "./types";

/** Seed board shown on first visit (no localStorage yet). */
export function createDemoBoard(): Board {
  return {
    version: 1,
    name: "Ship LuniSurge",
    camera: { x: 40, y: 20, zoom: 1 },
    nodes: [
      {
        id: "n_goal",
        type: "goal",
        title: "Ship a usable planning canvas",
        body: "Goals, steps, notes, and decisions on one board — private in the browser.",
        x: 280,
        y: 40,
      },
      {
        id: "n_decide",
        type: "decision",
        title: "Stack choice",
        body: "Vanilla Vite + custom DOM/SVG graph (no React Flow).",
        x: 40,
        y: 180,
      },
      {
        id: "n_step1",
        type: "step",
        title: "Scaffold app shell",
        body: "Header, switcher, panes, teal parchment tokens.",
        status: "done",
        x: 280,
        y: 180,
      },
      {
        id: "n_step2",
        type: "step",
        title: "Wire graph engine",
        body: "Drag nodes, connect edges, pan/zoom, persist.",
        status: "doing",
        x: 520,
        y: 180,
      },
      {
        id: "n_step3",
        type: "step",
        title: "Next-steps sidebar",
        body: "Surface incomplete steps with clear upstream deps.",
        status: "todo",
        x: 400,
        y: 340,
      },
      {
        id: "n_note",
        type: "note",
        title: "Reminder",
        body: "LunoEngine graph store + canvas under Juni at /luni/ — same origin as Kuni.",
        x: 40,
        y: 340,
      },
    ],
    edges: [
      { id: "e1", from: "n_goal", to: "n_decide" },
      { id: "e2", from: "n_goal", to: "n_step1" },
      { id: "e3", from: "n_step1", to: "n_step2" },
      { id: "e4", from: "n_step2", to: "n_step3" },
      { id: "e5", from: "n_decide", to: "n_step1" },
    ],
  };
}
