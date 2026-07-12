/// <reference types="vite/client" />

declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare module "*?worker" {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}

declare module "../public/pkg/juni_wasm.js" {
  export default function init(
    input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module
  ): Promise<unknown>;
  export function compile(source: string): string;
  export function check_source(source: string): string;
}
