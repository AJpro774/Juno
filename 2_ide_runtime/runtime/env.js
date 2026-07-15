/**
 * Shared Juni WASM env imports for Node and the browser IDE.
 * Re-exports compiled TypeScript from runtime/src.
 */

export { createEnvImports, createPrintImports, instantiateJuni } from "./dist/env.js";
