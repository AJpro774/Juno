/**
 * WebGPU helpers for Juni hosts.
 * Real clear/triangle drawing is implemented in the browser IDE runtime.
 */

export function createWebGpuStubs(options = {}) {
  const verbose = options.verbose ?? false;
  const log = (...args) => {
    if (verbose) console.log("[webgpu-stub]", ...args);
  };

  return {
    /** Generic hook imported by WASM as env.webgpu_stub(i32). */
    webgpuStub(code) {
      log(`call code=${code}`);
    },
  };
}
