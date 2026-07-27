# LuniSurge (Luni)

**LuniSurge** (short name **Luni**) is a node-based project planning canvas **built on LunoEngine** — goals, steps, notes, and decisions with wires, statuses, and a next-steps sidebar. Boards persist in the browser (`localStorage`).

UI language matches the [Juni IDE](../ide/) ecosystem: parchment glow, Syne wordmark, JetBrains Mono for chrome — with a deep teal/cyan accent so Luni reads as a planning surface, not a clone of Kuni’s forest green.

## Quick start

From the Juni IDE (recommended — one site, switch instantly):

```bash
cd /Users/caryn/Juno/ide
npm install
npm run dev
```

Open http://localhost:5173 — use the **Juni | Kuni | Luni** switcher (hover **Luni** to see **LuniSurge**), or http://localhost:5173/luni/.

Standalone Luni:

```bash
cd /Users/caryn/Juno/lunisurge
npm install
npm run dev
```

Open http://localhost:5175.

## LunoEngine

| Piece | Role |
|-------|------|
| `src/graph/store.ts` | Board model, selection, wires, next-steps, `luni.board.v1` persistence |
| `src/graph/canvas.ts` | Pan/zoom viewport, drag, port wiring, SVG bezier edges |
| `src/graph/nodes.ts` | DOM node chrome by type (goal / step / note / decision) |
| `src/graph/types.ts` | Node / edge / camera types + step statuses |

**LunoEngine** is the local graph runtime for LuniSurge — parallel to **KunoEngine** (Kuni) and **JunoEngine** (Juni).

## Layout

```
lunisurge/
  src/graph/     # LunoEngine — store, canvas, nodes
  src/main.ts    # shell: inspector + next steps
  src/style.css  # parchment + teal tokens
```

## Nest under Juni

Production embed uses `LUNI_BASE=/luni/` (`npm run build:nested`), copied into `ide/dist/luni` via `ide`’s `embed:luni` script.
