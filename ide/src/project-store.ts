export type ProjectFile = {
  path: string;
  content: string;
  dirty: boolean;
};

export type ProjectState = {
  name: string;
  root: string;
  files: Map<string, ProjectFile>;
  entry: string | null;
};

export const DEMO_PROJECT: ProjectState = {
  name: "hello_modules",
  root: ".",
  entry: "src/main.juni",
  files: new Map([
    [
      "juni.toml",
      {
        path: "juni.toml",
        content: `[project]
name = "hello_modules"
version = "0.1.0"
entry = "src/main.juni"
`,
        dirty: false,
      },
    ],
    [
      "src/main.juni",
      {
        path: "src/main.juni",
        content: `import math

fn main() -> i32:
    return math.greet()
`,
        dirty: false,
      },
    ],
    [
      "src/math.juni",
      {
        path: "src/math.juni",
        content: `export fn greet() -> i32:
    print("from math")
    return 42
`,
        dirty: false,
      },
    ],
  ]),
};

function cloneProject(project: ProjectState): ProjectState {
  const files = new Map<string, ProjectFile>();
  for (const [path, file] of project.files) {
    files.set(path, { ...file, dirty: false });
  }
  return { ...project, files };
}

export function createDemoProject(): ProjectState {
  return cloneProject(DEMO_PROJECT);
}

function parseEntryFromToml(toml: string): string | null {
  for (const line of toml.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("entry")) {
      const match = trimmed.match(/entry\s*=\s*["']([^"']+)["']/);
      if (match) return match[1];
    }
  }
  return null;
}

export function projectFromFiles(
  name: string,
  root: string,
  files: Map<string, string>
): ProjectState {
  const projectFiles = new Map<string, ProjectFile>();
  for (const [path, content] of files) {
    const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
    projectFiles.set(normalized, {
      path: normalized,
      content,
      dirty: false,
    });
  }
  const juniToml = projectFiles.get("juni.toml")?.content ?? "";
  return {
    name,
    root,
    files: projectFiles,
    entry: parseEntryFromToml(juniToml),
  };
}

export function projectFilePaths(project: ProjectState): string[] {
  return [...project.files.keys()].sort((a, b) => a.localeCompare(b));
}

export function projectTreePaths(project: ProjectState): {
  config: string[];
  src: string[];
  assets: string[];
  other: string[];
} {
  const config: string[] = [];
  const src: string[] = [];
  const assets: string[] = [];
  const other: string[] = [];

  for (const path of projectFilePaths(project)) {
    if (path === "juni.toml" || path.endsWith(".toml")) {
      config.push(path);
    } else if (path.startsWith("src/")) {
      src.push(path);
    } else if (path.startsWith("assets/")) {
      assets.push(path);
    } else {
      other.push(path);
    }
  }

  return { config, src, assets, other };
}

export function buildCompilePayload(project: ProjectState): string {
  const files: Record<string, string> = {};
  for (const [path, file] of project.files) {
    files[path] = file.content;
  }
  return JSON.stringify({ root: project.root, files });
}

export function isProjectMode(project: ProjectState | null): boolean {
  return project !== null && project.files.has("juni.toml");
}

type FileSystemDirectoryHandle = globalThis.FileSystemDirectoryHandle;
type FileSystemFileHandle = globalThis.FileSystemFileHandle;

async function readDirectory(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: Map<string, string>
): Promise<void> {
  for await (const handle of dir.values()) {
    const rel = prefix ? `${prefix}/${handle.name}` : handle.name;
    if (handle.kind === "directory") {
      await readDirectory(handle as FileSystemDirectoryHandle, rel, out);
    } else if (handle.kind === "file") {
      const file = await (handle as FileSystemFileHandle).getFile();
      const text = await file.text();
      out.set(rel, text);
    }
  }
}

export async function openProjectFromPicker(): Promise<ProjectState | null> {
  const picker = window.showDirectoryPicker;
  if (!picker) {
    return null;
  }
  // Prefer readwrite so Save Scene can persist via File System Access.
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await picker.call(window, { mode: "readwrite" });
  } catch {
    dir = await picker.call(window, { mode: "read" });
  }
  const files = new Map<string, string>();
  await readDirectory(dir, "", files);
  if (!files.has("juni.toml")) {
    throw new Error("Selected folder must contain juni.toml at the project root.");
  }
  const { setWritableRoot } = await import("./project-persist");
  try {
    // Permission may still be needed for writes later.
    const perm = await (
      dir as FileSystemDirectoryHandle & {
        requestPermission?: (o: { mode: string }) => Promise<string>;
      }
    ).requestPermission?.({ mode: "readwrite" });
    if (perm === "granted" || perm === undefined) {
      setWritableRoot({ kind: "fsa", dir });
    }
  } catch {
    setWritableRoot({ kind: "fsa", dir });
  }
  return projectFromFiles(dir.name, ".", files);
}

async function unzipEntries(buffer: ArrayBuffer): Promise<Map<string, string>> {
  const view = new DataView(buffer);
  const files = new Map<string, string>();
  let offset = 0;

  while (offset + 30 <= view.byteLength) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;

    const compMethod = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > view.byteLength) break;

    const nameBytes = new Uint8Array(buffer, nameStart, nameLen);
    const name = new TextDecoder().decode(nameBytes).replace(/\\/g, "/");
    const dataStart = nameEnd + extraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > view.byteLength) break;

    if (!name.endsWith("/") && (name.startsWith("src/") || name === "juni.toml" || name.startsWith("assets/"))) {
      const raw = new Uint8Array(buffer, dataStart, compSize);
      let text: string;
      if (compMethod === 0) {
        text = new TextDecoder().decode(raw);
      } else if (compMethod === 8) {
        const ds = new DecompressionStream("deflate-raw");
        const blob = new Blob([raw]);
        const stream = blob.stream().pipeThrough(ds);
        const out = await new Response(stream).arrayBuffer();
        text = new TextDecoder().decode(out);
      } else {
        throw new Error(`Unsupported zip compression for ${name}`);
      }
      files.set(name, text);
    }

    offset = dataEnd;
  }

  return files;
}

export async function openProjectFromZipFile(file: File): Promise<ProjectState> {
  const buffer = await file.arrayBuffer();
  const files = await unzipEntries(buffer);
  if (!files.has("juni.toml")) {
    throw new Error("Zip must contain juni.toml at the project root.");
  }
  const name = file.name.replace(/\.zip$/i, "") || "project";
  return projectFromFiles(name, ".", files);
}

export async function openProjectFromFileInput(
  input: HTMLInputElement
): Promise<ProjectState | null> {
  return new Promise((resolve, reject) => {
    input.onchange = async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) {
        resolve(null);
        return;
      }
      try {
        if (file.name.endsWith(".zip")) {
          resolve(await openProjectFromZipFile(file));
        } else {
          reject(new Error("Choose a .zip project archive or use Open Folder."));
        }
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}
