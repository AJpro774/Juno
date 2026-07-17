/** Persist project files to disk (Tauri / File System Access) or download fallback. */

import { projectFromFiles, type ProjectState } from "./project-store.js";

export type WritableProjectRoot = {
  kind: "fsa" | "tauri";
  /** FSA directory handle when kind is fsa */
  dir?: FileSystemDirectoryHandle;
};

let writableRoot: WritableProjectRoot | null = null;

export function getWritableRoot(): WritableProjectRoot | null {
  return writableRoot;
}

export function setWritableRoot(root: WritableProjectRoot | null): void {
  writableRoot = root;
}

export function clearWritableRoot(): void {
  writableRoot = null;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { __TAURI__?: unknown }).__TAURI__;
}

async function invokeTauri(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const tauri = (
    window as unknown as {
      __TAURI__?: {
        invoke?: (c: string, a?: Record<string, unknown>) => Promise<unknown>;
        core?: { invoke?: (c: string, a?: Record<string, unknown>) => Promise<unknown> };
      };
    }
  ).__TAURI__;
  const invoke = tauri?.core?.invoke ?? tauri?.invoke;
  if (!invoke) throw new Error("Tauri invoke unavailable");
  return invoke(cmd, args);
}

/** Ensure nested directories exist under an FSA root, return the file handle. */
async function getOrCreateFileHandle(
  root: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemFileHandle> {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length === 0) throw new Error("empty path");
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create: true });
  }
  return dir.getFileHandle(parts[parts.length - 1], { create: true });
}

export async function writeProjectFile(relativePath: string, contents: string): Promise<"disk" | "download"> {
  const path = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");

  if (isTauri() && writableRoot?.kind === "tauri") {
    await invokeTauri("write_project_file", { relativePath: path, contents });
    return "disk";
  }

  if (isTauri()) {
    try {
      await invokeTauri("write_project_file", { relativePath: path, contents });
      writableRoot = { kind: "tauri" };
      return "disk";
    } catch {
      try {
        await invokeTauri("save_scene_file", { relativePath: path, contents });
        return "disk";
      } catch {
        /* fall through */
      }
    }
  }

  if (writableRoot?.kind === "fsa" && writableRoot.dir) {
    const handle = await getOrCreateFileHandle(writableRoot.dir, path);
    const writable = await handle.createWritable();
    await writable.write(contents);
    await writable.close();
    return "disk";
  }

  downloadTextFile(path.split("/").pop() || "file.txt", contents);
  return "download";
}

export function downloadTextFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function tryOpenTauriProject(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const root = (await invokeTauri("open_project_folder", {})) as string;
    if (!root) return null;
    writableRoot = { kind: "tauri" };
    return root;
  } catch {
    return null;
  }
}

/** Open a project via Tauri folder picker + native FS read of all files. */
export async function openProjectFromTauri(): Promise<ProjectState | null> {
  const root = await tryOpenTauriProject();
  if (!root) return null;
  const filesRaw = (await invokeTauri("load_project_files", {})) as Record<string, string>;
  const files = new Map<string, string>();
  for (const [path, content] of Object.entries(filesRaw ?? {})) {
    files.set(path.replace(/\\/g, "/"), content);
  }
  if (!files.has("juni.toml")) {
    throw new Error("Selected folder must contain juni.toml at the project root.");
  }
  const name = root.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "project";
  return projectFromFiles(name, root, files);
}

export async function readProjectFileFromTauri(relativePath: string): Promise<string | null> {
  if (!isTauri() || writableRoot?.kind !== "tauri") return null;
  try {
    return (await invokeTauri("read_project_file", { relativePath })) as string;
  } catch {
    return null;
  }
}
