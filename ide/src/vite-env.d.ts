/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare module "*.juni?raw" {
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
    input?:
      | RequestInfo
      | URL
      | Response
      | BufferSource
      | WebAssembly.Module
      | { module_or_path?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module }
  ): Promise<unknown>;
  export function compile(source: string): string;
  export function compile_project(json: string): string;
  export function check_source(source: string): string;
}

interface Window {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
  }) => Promise<FileSystemDirectoryHandle>;
}

interface FileSystemHandle {
  readonly kind: "file" | "directory";
  readonly name: string;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  readonly kind: "directory";
  values(): AsyncIterableIterator<FileSystemHandle>;
}

interface FileSystemFileHandle extends FileSystemHandle {
  readonly kind: "file";
  getFile(): Promise<File>;
}
