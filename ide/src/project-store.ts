import {
  ensureJuniTomlProvenance,
  juniNoticeFileBody,
} from "./juni-notice";

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

/** Ensure juni.toml + JUNI.NOTICE carry Required Notice (mutates in place). */
export function ensureProjectProvenance(project: ProjectState): boolean {
  let changed = false;
  const toml = project.files.get("juni.toml");
  if (toml) {
    const next = ensureJuniTomlProvenance(toml.content);
    if (next.changed) {
      toml.content = next.content;
      toml.dirty = true;
      changed = true;
    }
  }
  const notice = project.files.get("JUNI.NOTICE");
  const body = juniNoticeFileBody();
  if (!notice) {
    project.files.set("JUNI.NOTICE", {
      path: "JUNI.NOTICE",
      content: body,
      dirty: true,
    });
    changed = true;
  } else if (!notice.content.includes("Required Notice:")) {
    notice.content = body;
    notice.dirty = true;
    changed = true;
  }
  return changed;
}

export function createDemoProject(): ProjectState {
  const p = cloneProject(DEMO_PROJECT);
  ensureProjectProvenance(p);
  for (const f of p.files.values()) f.dirty = false;
  return p;
}

/** In-memory platformer_3d vertical slice (pure 3D phys + world_draw3d). */
export const PLATFORMER_3D_DEMO: ProjectState = {
  name: "platformer_3d",
  root: ".",
  entry: "src/main.juni",
  files: new Map([
    [
      "juni.toml",
      {
        path: "juni.toml",
        content: `[project]
name = "platformer_3d"
version = "0.1.0"
entry = "src/main.juni"

[scene]
default = "scenes/level1.jscene"
`,
        dirty: false,
      },
    ],
    [
      "src/main.juni",
      {
        path: "src/main.juni",
        content: `state:
    player: i32 = 0
    cam: i32 = 0
    goal: i32 = 0
    hazard: i32 = 0
    coin: i32 = 0
    won: i32 = 0
    dead: i32 = 0
    spawn_x: f32 = -4.0
    spawn_y: f32 = 1.5
    spawn_z: f32 = 0.0
    hazard_t: f32 = 0.0
    cam_yaw: f32 = 0.55

export fn hazard_on_update(entity_id: i32, dt: f32) -> i32:
    hazard_t = hazard_t + dt
    let x = sin(hazard_t * 1.6) * 2.2
    transform3d_set(entity_id, x, 0.35, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0)
    return 0

export fn coin_on_trigger_enter(entity_id: i32, other_id: i32, dt: f32) -> i32:
    if coin != 0 and entity_id == coin and other_id == player:
        print("coin enter")
    return 0

export fn coin_on_trigger_exit(entity_id: i32, other_id: i32, dt: f32) -> i32:
    if coin != 0 and entity_id == coin and other_id == player:
        entity_destroy(coin)
        coin = 0
        print("coin exit — collected!")
    return 0

fn restart() -> i32:
    dead = 0
    won = 0
    rigidbody3d_set_vel(player, 0.0, 0.0, 0.0)
    transform3d_set(player, spawn_x, spawn_y, spawn_z, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0)
    return 0

fn main() -> i32:
    scene3d_init(640, 360)
    world_create()
    scene3d_set_ambient(0.16, 0.18, 0.22)
    scene3d_set_fog(0.15)
    let loaded = scene_load("scenes/level1.jscene")
    player = entity_find_by_tag("player")
    goal = entity_find_by_tag("goal")
    hazard = entity_find_by_tag("hazard")
    cam = camera3d_perspective(60.0, 1.777, 0.1, 100.0)
    camera3d_orbit(cam, 0.0, 1.0, 0.0, cam_yaw, 0.4, 12.0)
    let _light = light3d_directional(0.35, -1.0, -0.45, 1.0, 0.95, 0.85)
    if player == 0:
        player = entity_create()
        entity_set_tag(player, "player")
        let mesh = mesh3d_box(0.7, 0.7, 0.7)
        mesh3d_set_material(mesh, material3d_color(0.35, 0.75, 1.0, 1.0))
        mesh3d_attach(player, mesh)
        transform3d_set(player, spawn_x, spawn_y, spawn_z, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0)
        collider3d_set(player, 0, 0.7, 0.7, 0.7, 1)
        rigidbody3d_set_vel(player, 0.0, 0.0, 0.0)
    coin = prefab_spawn("prefabs/coin.jscene", 0.0, 0.0)
    if coin != 0:
        transform3d_set(coin, -1.0, 1.1, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0)
        let coin_mesh = mesh3d_box(0.35, 0.35, 0.35)
        mesh3d_set_material(coin_mesh, material3d_color(1.0, 0.85, 0.2, 1.0))
        mesh3d_attach(coin, coin_mesh)
    print("platformer_3d vertical slice ready")
    let _ignore = loaded
    return 0

fn frame(dt: f32) -> i32:
    if won == 1 or dead == 1:
        if key_down(8) == 1:
            let _r = restart()
        world_step(dt)
        camera3d_orbit(cam, 0.0, 1.0, 0.0, cam_yaw, 0.4, 12.0)
        world_draw3d(cam)
        return 0

    let mx = 0.0
    let mz = 0.0
    if key_down(0) == 1 or key_down(4) == 1:
        mx = mx - 1.0
    if key_down(1) == 1 or key_down(5) == 1:
        mx = mx + 1.0
    if key_down(6) == 1:
        mz = mz - 1.0
    if key_down(7) == 1:
        mz = mz + 1.0
    let stick_x = gamepad_axis(0, 0)
    let stick_y = gamepad_axis(0, 1)
    if abs(stick_x) > 0.2:
        mx = stick_x
    if abs(stick_y) > 0.2:
        mz = stick_y

    let vx = mx * 5.5
    let vz = mz * 5.5
    let grounded = rigidbody3d_get_grounded(player)
    if grounded == 1:
        if key_down(2) == 1 or key_down(8) == 1:
            rigidbody3d_set_vel(player, vx, 8.5, vz)
        else:
            rigidbody3d_set_vel(player, vx, 0.0, vz)
    else:
        rigidbody3d_set_vel(player, vx, 1000000.0, vz)

    world_step(dt)

    let n = collision_count()
    let i = 0
    while i < n:
        let a = collision_entity_a(i)
        let b = collision_entity_b(i)
        if (a == player and b == goal) or (b == player and a == goal):
            won = 1
            print("goal!")
        if (a == player and b == hazard) or (b == player and a == hazard):
            dead = 1
            print("ouch — press Space to restart")
        i = i + 1

    cam_yaw = cam_yaw + dt * 0.08
    camera3d_orbit(cam, 0.0, 1.0, 0.0, cam_yaw, 0.4, 12.0)
    world_draw3d(cam)
    return 0
`,
        dirty: false,
      },
    ],
    [
      "scenes/level1.jscene",
      {
        path: "scenes/level1.jscene",
        content: `{
  "version": 1,
  "gravity": 20,
  "entities": [
    {
      "id": 1,
      "name": "Camera",
      "tag": "camera",
      "components": {
        "camera3d": {
          "active": true,
          "fov": 60,
          "aspect": 1.777,
          "near": 0.1,
          "far": 100,
          "orbit_yaw": 0.55,
          "orbit_pitch": 0.4,
          "orbit_distance": 12,
          "target": [0, 1, 0]
        }
      }
    },
    {
      "id": 2,
      "name": "Sun",
      "tag": "sun",
      "components": {
        "light3d": {
          "type": "directional",
          "direction": [0.35, -1.0, -0.45],
          "color": [1.0, 0.95, 0.85]
        }
      }
    },
    {
      "id": 3,
      "name": "Ground",
      "tag": "ground",
      "components": {
        "transform3d": { "position": [0, -0.25, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
        "mesh3d": { "primitive": "box", "size": [14, 0.5, 6], "color": [0.28, 0.42, 0.32, 1] },
        "collider3d": { "type": "aabb", "w": 14, "h": 0.5, "d": 6, "solid": true }
      }
    },
    {
      "id": 4,
      "name": "Player",
      "tag": "player",
      "components": {
        "transform3d": { "position": [-4, 1.5, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
        "mesh3d": { "primitive": "box", "size": [0.7, 0.7, 0.7], "color": [0.35, 0.75, 1.0, 1] },
        "rigidbody3d": { "vx": 0, "vy": 0, "vz": 0, "gravity": 20 },
        "collider3d": { "type": "aabb", "w": 0.7, "h": 0.7, "d": 0.7, "solid": true }
      }
    },
    {
      "id": 5,
      "name": "Platform",
      "tag": "plat1",
      "components": {
        "transform3d": { "position": [1.5, 1.2, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
        "mesh3d": { "primitive": "box", "size": [2.4, 0.3, 1.6], "color": [0.55, 0.48, 0.38, 1] },
        "collider3d": { "type": "aabb", "w": 2.4, "h": 0.3, "d": 1.6, "solid": true }
      }
    },
    {
      "id": 6,
      "name": "Goal",
      "tag": "goal",
      "components": {
        "transform3d": { "position": [4.5, 2.2, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
        "mesh3d": { "primitive": "box", "size": [0.6, 0.6, 0.6], "color": [0.35, 0.9, 0.45, 1] },
        "collider3d": { "type": "aabb", "w": 0.6, "h": 0.6, "d": 0.6, "solid": false }
      }
    },
    {
      "id": 7,
      "name": "Hazard",
      "tag": "hazard",
      "components": {
        "transform3d": { "position": [0, 0.35, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
        "mesh3d": { "primitive": "box", "size": [1.2, 0.35, 1.2], "color": [0.9, 0.25, 0.2, 1] },
        "collider3d": { "type": "aabb", "w": 1.2, "h": 0.35, "d": 1.2, "solid": false },
        "script": { "module": "hazard", "handler": "on_update" }
      }
    }
  ]
}
`,
        dirty: false,
      },
    ],
    [
      "prefabs/coin.jscene",
      {
        path: "prefabs/coin.jscene",
        content: `{
  "version": 1,
  "entities": [
    {
      "id": 1,
      "name": "Coin",
      "tag": "coin",
      "components": {
        "transform3d": { "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
        "collider3d": { "type": "aabb", "w": 0.4, "h": 0.4, "d": 0.4, "solid": false },
        "script": { "module": "coin", "handler": "on_update" }
      }
    }
  ]
}
`,
        dirty: false,
      },
    ],
  ]),
};

export function createPlatformer3dDemoProject(): ProjectState {
  const p = cloneProject(PLATFORMER_3D_DEMO);
  ensureProjectProvenance(p);
  for (const f of p.files.values()) f.dirty = false;
  return p;
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
  const project: ProjectState = {
    name,
    root,
    files: projectFiles,
    entry: parseEntryFromToml(juniToml),
  };
  ensureProjectProvenance(project);
  return project;
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
