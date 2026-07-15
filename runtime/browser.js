/**
 * Browser-facing Juni runtime helpers.
 * Re-exports shared env wiring for the IDE.
 */

export { createEnvImports, createPrintImports, instantiateJuni } from "./dist/env.js";
export { instantiateJuni as instantiateJuniBrowser, startFrameLoop } from "./dist/browser.js";
