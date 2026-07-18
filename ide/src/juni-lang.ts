import type * as Monaco from "monaco-editor";
import type { UiAppearance } from "./ui-theme";

export const JUNI_LANGUAGE_ID = "juni";

/** Token category ids used by Monarch + Code Search filters. */
export const JUNI_TOKEN_CATEGORIES = [
  "keyword",
  "type",
  "math",
  "string",
  "host.input",
  "host.gfx",
  "host.audio",
  "host.ecs",
] as const;

export type JuniTokenCategory = (typeof JUNI_TOKEN_CATEGORIES)[number];

export const JUNI_CATEGORY_LABELS: Record<JuniTokenCategory, string> = {
  keyword: "Keyword",
  type: "Type",
  math: "Math",
  string: "String / print",
  "host.input": "Host · input",
  "host.gfx": "Host · gfx",
  "host.audio": "Host · audio",
  "host.ecs": "Host · ECS",
};

/** Monaco theme ids for Juni categorical highlighting. */
export const JUNI_THEME_CLASSIC = "juni-classic";
export const JUNI_THEME_MODERN = "juni-modern";

export const KEYWORDS = [
  "fn",
  "struct",
  "let",
  "state",
  "if",
  "else",
  "while",
  "for",
  "in",
  "break",
  "continue",
  "return",
  "new",
  "delete",
  "ref",
  "mut",
  "true",
  "false",
  "and",
  "or",
  "not",
  "import",
  "from",
  "export",
  "as",
  "frame",
] as const;

export const TYPE_KEYWORDS = ["i32", "i64", "f32", "f64", "bool", "void", "str"] as const;

export const MATH_BUILTINS = [
  "sqrt",
  "sin",
  "cos",
  "tan",
  "abs",
  "floor",
  "ceil",
  "min",
  "max",
  "rand",
  "now",
  "clamp",
  "lerp",
  "pow",
  "sign",
  "fmod",
  "smoothstep",
  "deg_to_rad",
  "rad_to_deg",
  "dist2",
  "pi",
  "len2",
  "dot2",
  "abs_i32",
  "imin",
  "imax",
  "iclamp",
  "as_i32",
  "as_f32",
] as const;

export const STRING_BUILTINS = [
  "print",
  "str_len",
  "str_eq",
  "str_concat",
  "str_substr",
] as const;

export const HOST_INPUT = [
  "key_down",
  "mouse_x",
  "mouse_y",
  "mouse_down",
  "gamepad_axis",
  "gamepad_button",
] as const;

export const HOST_GFX = [
  "canvas_init",
  "canvas_clear",
  "canvas_fill_rect",
  "canvas_fill_circle",
  "canvas_fill_text",
  "canvas_draw_line",
  "canvas_stroke_rect",
  "asset_load_str",
  "sprite_draw",
  "mesh_load_obj",
  "mesh_load_gltf",
  "gpu_clear",
  "gpu_draw_triangle",
  "aabb_overlap",
  "aabb_resolve_x",
  "aabb_resolve_y",
  "scene3d_init",
  "scene3d_clear",
  "scene3d_draw",
  "scene3d_create_node",
  "scene3d_set_parent",
  "scene3d_set_ambient",
  "scene3d_set_fog",
  "camera3d_perspective",
  "camera3d_look_at",
  "camera3d_orbit",
  "mesh3d_box",
  "mesh3d_custom",
  "mesh3d_set_pose",
  "mesh3d_rotate",
  "material3d_color",
  "material3d_texture",
  "mesh3d_set_material",
  "light3d_directional",
  "light3d_point",
] as const;

export const HOST_AUDIO = [
  "audio_load",
  "audio_play",
  "audio_play_loop",
  "audio_set_volume",
  "audio_stop",
  "audio_set_bus_volume",
] as const;

export const HOST_ECS = [
  "world_create",
  "world_step",
  "world_draw",
  "world_draw3d",
  "entity_create",
  "entity_destroy",
  "entity_set_tag",
  "entity_find_by_tag",
  "transform2d_set",
  "transform3d_set",
  "sprite_set",
  "mesh3d_attach",
  "scene_load",
  "camera2d_set",
  "camera2d_follow",
  "tilemap_load",
  "tilemap_attach",
  "prefab_spawn",
  "rigidbody2d_set_vel",
  "rigidbody2d_get_grounded",
  "collider2d_set",
  "rigidbody3d_set_vel",
  "rigidbody3d_get_grounded",
  "collider3d_set",
  "transform3d_sync_from_2d",
  "anim_play",
  "anim_stop",
  "collision_count",
  "collision_entity_a",
  "collision_entity_b",
  "collision_is_trigger",
] as const;

const CATEGORY_WORDS: Record<JuniTokenCategory, readonly string[]> = {
  keyword: KEYWORDS,
  type: TYPE_KEYWORDS,
  math: MATH_BUILTINS,
  string: STRING_BUILTINS,
  "host.input": HOST_INPUT,
  "host.gfx": HOST_GFX,
  "host.audio": HOST_AUDIO,
  "host.ecs": HOST_ECS,
};

/** Monarch token name for each category (theme rules target these). */
export const CATEGORY_TOKEN: Record<JuniTokenCategory, string> = {
  keyword: "keyword",
  type: "type",
  math: "juni.math",
  string: "juni.string",
  "host.input": "juni.host.input",
  "host.gfx": "juni.host.gfx",
  "host.audio": "juni.host.audio",
  "host.ecs": "juni.host.ecs",
};

export function wordsForCategories(categories: readonly JuniTokenCategory[]): string[] {
  const out = new Set<string>();
  for (const cat of categories) {
    for (const w of CATEGORY_WORDS[cat]) out.add(w);
  }
  return [...out];
}

export function categoryOfIdent(name: string): JuniTokenCategory | null {
  for (const cat of JUNI_TOKEN_CATEGORIES) {
    if ((CATEGORY_WORDS[cat] as readonly string[]).includes(name)) return cat;
  }
  return null;
}

type ThemeColors = {
  base: "vs" | "vs-dark";
  rules: Monaco.editor.ITokenThemeRule[];
  colors: Monaco.editor.IColors;
};

const CLASSIC_THEME: ThemeColors = {
  base: "vs",
  colors: {
    "editor.background": "#faf7f1",
    "editor.foreground": "#1c1915",
    "editorLineHighlight.background": "#efe8dc",
    "editorCursor.foreground": "#0f6e56",
    "editor.selectionBackground": "#c8e6d8",
    "editorLineNumber.foreground": "#9a9184",
    "editorLineNumber.activeForeground": "#1c1915",
  },
  rules: [
    { token: "comment", foreground: "7a7164", fontStyle: "italic" },
    { token: "string", foreground: "8a4b2a" },
    { token: "number", foreground: "0b5f8a" },
    { token: "number.float", foreground: "0b5f8a" },
    { token: "keyword", foreground: "8b1e3f", fontStyle: "bold" },
    { token: "type", foreground: "5b4a9e" },
    { token: "juni.math", foreground: "0f6e56" },
    { token: "juni.string", foreground: "b45309" },
    { token: "juni.host.input", foreground: "0369a1" },
    { token: "juni.host.gfx", foreground: "c2410c" },
    { token: "juni.host.audio", foreground: "7c3aed" },
    { token: "juni.host.ecs", foreground: "0e7490" },
    { token: "identifier", foreground: "1c1915" },
    { token: "operator", foreground: "4b5563" },
    { token: "delimiter", foreground: "6b645a" },
  ],
};

const MODERN_THEME: ThemeColors = {
  base: "vs-dark",
  colors: {
    "editor.background": "#121820",
    "editor.foreground": "#e8eef6",
    "editorLineHighlight.background": "#1a2330",
    "editorCursor.foreground": "#5eead4",
    "editor.selectionBackground": "#1e3a4f",
    "editorLineNumber.foreground": "#64748b",
    "editorLineNumber.activeForeground": "#e8eef6",
  },
  rules: [
    { token: "comment", foreground: "64748b", fontStyle: "italic" },
    { token: "string", foreground: "fbbf24" },
    { token: "number", foreground: "7dd3fc" },
    { token: "number.float", foreground: "7dd3fc" },
    { token: "keyword", foreground: "f472b6", fontStyle: "bold" },
    { token: "type", foreground: "c4b5fd" },
    { token: "juni.math", foreground: "5eead4" },
    { token: "juni.string", foreground: "fdba74" },
    { token: "juni.host.input", foreground: "38bdf8" },
    { token: "juni.host.gfx", foreground: "fb923c" },
    { token: "juni.host.audio", foreground: "a78bfa" },
    { token: "juni.host.ecs", foreground: "2dd4bf" },
    { token: "identifier", foreground: "e8eef6" },
    { token: "operator", foreground: "94a3b8" },
    { token: "delimiter", foreground: "64748b" },
  ],
};

/** Map UI chrome appearance → Juni Monaco theme. */
export function juniThemeForAppearance(appearance: UiAppearance): string {
  switch (appearance) {
    case "modern":
    case "cosmic":
    case "hacker":
      return JUNI_THEME_MODERN;
    default:
      return JUNI_THEME_CLASSIC;
  }
}

export function registerJuniThemes(monaco: typeof Monaco): void {
  monaco.editor.defineTheme(JUNI_THEME_CLASSIC, {
    base: CLASSIC_THEME.base,
    inherit: true,
    rules: CLASSIC_THEME.rules,
    colors: CLASSIC_THEME.colors,
  });
  monaco.editor.defineTheme(JUNI_THEME_MODERN, {
    base: MODERN_THEME.base,
    inherit: true,
    rules: MODERN_THEME.rules,
    colors: MODERN_THEME.colors,
  });
}

export function applyJuniEditorTheme(
  monaco: typeof Monaco,
  appearance: UiAppearance,
): void {
  monaco.editor.setTheme(juniThemeForAppearance(appearance));
}

export function registerJuniLanguage(monaco: typeof Monaco): void {
  monaco.languages.register({ id: JUNI_LANGUAGE_ID });
  registerJuniThemes(monaco);

  monaco.languages.setMonarchTokensProvider(JUNI_LANGUAGE_ID, {
    keywords: [...KEYWORDS],
    typeKeywords: [...TYPE_KEYWORDS],
    mathBuiltins: [...MATH_BUILTINS],
    stringBuiltins: [...STRING_BUILTINS],
    hostInput: [...HOST_INPUT],
    hostGfx: [...HOST_GFX],
    hostAudio: [...HOST_AUDIO],
    hostEcs: [...HOST_ECS],
    tokenizer: {
      root: [
        [/#.*$/, "comment"],
        [/"(?:\\.|[^"\\])*"/, "string"],
        [/\b\d+\.\d+\b/, "number.float"],
        [/\b\d+\b/, "number"],
        [
          /[a-zA-Z_][\w]*/,
          {
            cases: {
              "@keywords": CATEGORY_TOKEN.keyword,
              "@typeKeywords": CATEGORY_TOKEN.type,
              "@mathBuiltins": CATEGORY_TOKEN.math,
              "@stringBuiltins": CATEGORY_TOKEN.string,
              "@hostInput": CATEGORY_TOKEN["host.input"],
              "@hostGfx": CATEGORY_TOKEN["host.gfx"],
              "@hostAudio": CATEGORY_TOKEN["host.audio"],
              "@hostEcs": CATEGORY_TOKEN["host.ecs"],
              "@default": "identifier",
            },
          },
        ],
        [/[{}()\[\]]/, "@brackets"],
        [/[<>]=?|[!=]=|[-+*/%=]/, "operator"],
        [/[:.,]/, "delimiter"],
        [/\s+/, "white"],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration(JUNI_LANGUAGE_ID, {
    comments: { lineComment: "#" },
    brackets: [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ],
    autoClosingPairs: [
      { open: "(", close: ")" },
      { open: '"', close: '"' },
    ],
  });
}
