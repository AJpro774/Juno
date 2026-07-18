/** Build-time-ish keyword chunk index over docs (no embeddings). */

export type DocChunk = {
  id: string;
  title: string;
  path: string;
  text: string;
  keywords: string[];
};

/**
 * Curated static index for fast grounding.
 * Full docs dump lives in `public/ai-docs-index.json` (scripts/build-ai-docs-index.mjs).
 */
export const DOC_CHUNKS: DocChunk[] = [
  {
    id: "engine-ecs",
    title: "ECS",
    path: "engine/overview",
    text: "world_create entity_create transform2d_set sprite_set world_step world_draw scene_load entity_find_by_tag",
    keywords: ["ecs", "entity", "world", "scene", "sprite", "transform", "tag"],
  },
  {
    id: "engine-3d",
    title: "3D",
    path: "graphics/3d",
    text: "scene3d_init mesh3d_box camera3d_perspective camera3d_orbit world_draw3d mesh_load_gltf scene3d_set_ambient fog light3d_directional light3d_point material3d_color mesh3d_attach transform3d_set",
    keywords: [
      "3d",
      "mesh",
      "gltf",
      "webgpu",
      "light",
      "ambient",
      "fog",
      "draw3d",
      "camera3d",
      "orbit",
    ],
  },
  {
    id: "engine-intrinsics",
    title: "Host intrinsics",
    path: "engine/intrinsics",
    text: "print key_down mouse_x canvas_init world_draw3d prefab_spawn camera2d_follow rigidbody2d_set_vel collider2d_set rigidbody3d_set_vel collider3d_set transform3d_sync_from_2d",
    keywords: ["intrinsic", "api", "host", "builtin", "print", "input"],
  },
  {
    id: "physics-2d",
    title: "Physics 2D",
    path: "projects/physics",
    text: "rigidbody2d_set_vel grounded collision_count collider2d_set camera2d_follow prefab_spawn triggers slope aabb",
    keywords: ["physics", "collision", "rigidbody", "collider", "jump", "grounded", "prefab", "slope", "2d"],
  },
  {
    id: "physics-3d",
    title: "Physics 3D + hybrid",
    path: "projects/physics",
    text: "rigidbody3d_set_vel rigidbody3d_get_grounded collider3d_set aabb w h d solid transform3d_sync_from_2d hybrid 2D phys 3D render world_step 2D then 3D shared collision buffer on_trigger_exit",
    keywords: [
      "physics",
      "rigidbody3d",
      "collider3d",
      "aabb",
      "hybrid",
      "3d",
      "trigger",
      "grounded",
      "sync",
    ],
  },
  {
    id: "scripts",
    title: "Entity scripts",
    path: "engine/scripts",
    text: "script module handler on_update on_collision on_trigger_enter on_trigger_exit world_step export fn player_on_update WASM export registerScriptHandler bindScriptWasm",
    keywords: [
      "script",
      "handler",
      "on_update",
      "on_collision",
      "on_trigger_enter",
      "on_trigger_exit",
      "dispatch",
      "module",
      "export",
      "wasm",
    ],
  },
  {
    id: "tilemap-paint",
    title: "Tilemap paint",
    path: "engine/editor",
    text: "tilemap brush erase paint cols rows tileset tiles .jscene scene view inspector",
    keywords: ["tilemap", "tile", "paint", "brush", "erase", "grid"],
  },
  {
    id: "sprite-anim",
    title: "Sprite sheet animation",
    path: "projects/assets",
    text: "sprite sheet cols rows fps frame animate Sprite component assets.pack.json 2D renderer samples floor time fps across cols rows cells",
    keywords: ["sprite", "sheet", "animation", "anim", "cols", "rows", "fps", "frame", "spritesheet"],
  },
  {
    id: "code-search",
    title: "Code Search",
    path: "engine/editor",
    text: "Code Search panel query category filters keyword type math host.ecs host.gfx host.audio scan project .juni files jump Monaco categorical tokens",
    keywords: ["search", "code", "category", "filter", "token", "highlight", "monaco", "panel"],
  },
  {
    id: "borrow",
    title: "Borrow checking",
    path: "language/types",
    text: "ref T mut ref T immutable write exclusive mutable alias escape state checker WASM i32 pointers no runtime borrow",
    keywords: ["borrow", "ref", "mut", "alias", "reference", "immutable", "exclusive", "escape"],
  },
  {
    id: "generics",
    title: "Generics",
    path: "language/generics",
    text: "single-parameter generic fn T Ord gmin monomorphize inference one type parameter",
    keywords: ["generic", "generics", "ord", "type", "parameter", "monomorphize"],
  },
  {
    id: "desktop",
    title: "Desktop IDE",
    path: "projects/desktop",
    text: "Tauri desktop Open Project write_project_file lsp_request hover diagnostics completion definition",
    keywords: ["desktop", "tauri", "lsp", "hover", "diagnostic", "folder"],
  },
  {
    id: "ai-assistant",
    title: "AI assistant",
    path: "projects/ai-assistant",
    text: "WebLLM Qwen2.5-Coder local AI chat autocorrect Explain with AI model picker RAG optional off by default cancel unload project-aware open file diagnostics selection",
    keywords: ["ai", "webllm", "qwen", "chat", "model", "assistant", "rag"],
  },
  {
    id: "netlify",
    title: "Netlify",
    path: "projects/netlify",
    text: "netlify.toml ide dist deploy GITHUB_PAGES false export web static",
    keywords: ["netlify", "deploy", "host", "publish", "export"],
  },
  {
    id: "assets",
    title: "Assets",
    path: "projects/assets",
    text: "assets.pack.json sprite sheet cols rows fps mesh_load_gltf glTF sprite_draw asset_load_str",
    keywords: ["asset", "spritesheet", "sheet", "gltf", "pack", "png"],
  },
  {
    id: "language",
    title: "Juni language",
    path: "language/syntax",
    text: "fn main frame state i32 f32 indentation modules import export wasm",
    keywords: ["juni", "syntax", "fn", "state", "type", "module", "import"],
  },
];

const API_ALIASES: Record<string, string[]> = {
  draw3d: ["world_draw3d", "3d"],
  world_draw3d: ["draw3d", "mesh", "3d"],
  gltf: ["mesh_load_gltf", "3d"],
  spritesheet: ["sprite", "cols", "rows", "fps", "asset", "animation"],
  animation: ["sprite", "cols", "rows", "fps", "sheet"],
  anim: ["sprite", "animation", "fps"],
  lsp: ["desktop", "hover", "diagnostic"],
  rigidbody3d: ["physics", "collider3d", "3d", "hybrid"],
  collider3d: ["physics", "rigidbody3d", "aabb", "3d"],
  hybrid: ["physics", "transform3d_sync_from_2d", "2d", "3d"],
  borrow: ["ref", "mut", "alias"],
  ref: ["borrow", "mut"],
  search: ["code", "category", "token"],
  trigger: ["on_trigger_enter", "on_trigger_exit", "collision"],
  on_trigger_exit: ["trigger", "script", "collision"],
};

/** Supplemental chunks from public/ai-docs-index.json (loaded once). */
let remoteChunks: DocChunk[] | null = null;
let remoteLoad: Promise<void> | null = null;

/** Kick off a background fetch of the full docs index (safe no-op on failure). */
export function ensureDocsIndexLoaded(): void {
  if (remoteChunks !== null || remoteLoad || typeof fetch !== "function") return;
  remoteLoad = fetch("/ai-docs-index.json")
    .then(async (r) => {
      if (!r.ok) throw new Error(String(r.status));
      const data = (await r.json()) as { chunks?: DocChunk[] };
      remoteChunks = Array.isArray(data.chunks) ? data.chunks : [];
    })
    .catch(() => {
      remoteChunks = [];
    })
    .finally(() => {
      remoteLoad = null;
    });
}

function allChunks(): DocChunk[] {
  if (remoteChunks?.length) return [...DOC_CHUNKS, ...remoteChunks];
  return DOC_CHUNKS;
}

function scoreChunk(chunk: DocChunk, expanded: Set<string>, curatedBonus: boolean): number {
  let score = curatedBonus ? 1 : 0;
  for (const t of expanded) {
    if (chunk.keywords.includes(t)) score += 3;
    if (chunk.text.toLowerCase().includes(t)) score += 1;
    if (chunk.title.toLowerCase().includes(t)) score += 2;
    if (chunk.id.includes(t)) score += 1;
  }
  return score;
}

export function retrieveDocContext(query: string, k = 4): string {
  ensureDocsIndexLoaded();
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 2);
  if (!tokens.length) return "";

  const expanded = new Set<string>(tokens);
  for (const t of tokens) {
    for (const a of API_ALIASES[t] ?? []) expanded.add(a);
  }

  const curatedIds = new Set(DOC_CHUNKS.map((c) => c.id));
  const scored = allChunks()
    .map((chunk) => ({
      chunk,
      score: scoreChunk(chunk, expanded, curatedIds.has(chunk.id)),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  if (!scored.length) return "";
  return scored
    .map((s) => {
      const body = s.chunk.text.length > 400 ? s.chunk.text.slice(0, 400) + "…" : s.chunk.text;
      return `[${s.chunk.title} | ${s.chunk.path}] ${body}`;
    })
    .join("\n");
}
