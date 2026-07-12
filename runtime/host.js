/**
 * Juni WASM host — loads a module and wires env imports.
 *
 * Usage: node runtime/host.js path/to/program.wasm
 */

import { readFileSync } from "fs";
import { instantiateJuni } from "./env.js";
import { createWebGpuStubs } from "./webgpu_stubs.js";

async function main() {
  const wasmPath = process.argv[2];
  if (!wasmPath) {
    console.error("usage: node runtime/host.js <file.wasm>");
    process.exit(2);
  }

  const bytes = readFileSync(wasmPath);
  const stubs = createWebGpuStubs({ verbose: false });

  const instance = await instantiateJuni(bytes, {
    onPrint: (text) => console.log(text),
    webgpuStub: (code) => stubs.webgpuStub(code),
  });

  const exports = instance.exports;
  if (typeof exports.main === "function") {
    const result = exports.main();
    if (result !== undefined) {
      console.log("main() =>", result);
      process.exit(typeof result === "number" ? result & 0xff : 0);
    }
    process.exit(0);
  } else {
    console.error("no exported main()");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
