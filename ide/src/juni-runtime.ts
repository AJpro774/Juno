/** Thin IDE wrapper — re-exports unified runtime from runtime/src. */

export type { FrameController, RunOptions } from "../../runtime/src/types";
export { instantiateJuni, startFrameLoop } from "../../runtime/src/browser";
