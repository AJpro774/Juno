/* tslint:disable */
/* eslint-disable */

/**
 * Typecheck only; returns the same JSON shape with `wasm` always null.
 */
export function check_source(source: string): string;

/**
 * Compile Juni source. Returns JSON: `{ ok, diagnostics, wasm? }` (wasm is base64).
 */
export function compile(source: string): string;

/**
 * Compile a multi-file Juni project.
 *
 * Accepts JSON: `{ root?, files: { "juni.toml": "...", "src/main.juni": "..." } }`
 * or `{ root: "/path/to/project" }` to load from disk (native targets only).
 *
 * Returns JSON: `{ ok, diagnostics, wasm? }` with per-file diagnostics and base64 wasm.
 */
export function compile_project(json: string): string;

/**
 * Completion-lite for the browser IDE.
 *
 * Returns JSON: `{ items: [{ label, kind, detail? }] }`
 */
export function complete_source(source: string, line: number, col: number): string;

/**
 * Diagnostics for the browser IDE (parity with desktop LSP).
 *
 * Returns JSON: `{ items: [{ severity, message, line, col, end_line, end_col, file }] }`
 */
export function diagnostics_source(source: string): string;

/**
 * Go-to-definition for the browser IDE.
 *
 * Returns JSON: `{ location: { file, line, col, endLine, endCol } | null }`
 */
export function goto_def_source(source: string, line: number, col: number): string;

/**
 * Hover for the browser IDE (parity with desktop LSP).
 *
 * Returns JSON: `{ hover: { contents, line, col, end_line, end_col } | null }`
 */
export function hover_source(source: string, line: number, col: number): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly check_source: (a: number, b: number) => [number, number];
    readonly compile: (a: number, b: number) => [number, number];
    readonly compile_project: (a: number, b: number) => [number, number];
    readonly complete_source: (a: number, b: number, c: number, d: number) => [number, number];
    readonly diagnostics_source: (a: number, b: number) => [number, number];
    readonly goto_def_source: (a: number, b: number, c: number, d: number) => [number, number];
    readonly hover_source: (a: number, b: number, c: number, d: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
