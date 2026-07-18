/** Edit-mode WebGPU (or Canvas2D hybrid) viewport for mesh / light / camera. */

import type { SceneStore } from "./scene-store.js";
import { getEditorMode } from "./mode.js";
import {
  createScene3dHandlers,
  createCustomMeshFromData,
  ensureGpu,
  light3dDirectional,
  light3dPoint,
  resetSceneTables,
  syncMeshPose,
  scene3dSetAmbient,
} from "../../../runtime/src/scene3d.js";
import {
  loadSceneIntoWorld,
  materializeScene3d,
  sceneHas3d,
} from "../../../runtime/src/scene-loader.js";
import { parseGltfJson, parseGltfOrGlb, isGlbBytes } from "../../../runtime/src/gltf.js";
import { getWorld, resetWorld } from "../../../runtime/src/world.js";
import { mat4LookAt, mat4Perspective } from "../../../runtime/src/math.js";

export type SceneView3dHandle = {
  setActive: (on: boolean) => void;
  redraw: () => void;
  dispose: () => void;
};

type OrbitState = {
  yaw: number;
  pitch: number;
  dist: number;
  target: [number, number, number];
};

type PickEntry = {
  id: number;
  kind: "mesh" | "light" | "camera";
  x: number;
  y: number;
  z: number;
  radius: number;
};

function defaultOrbit(): OrbitState {
  return { yaw: 0.55, pitch: 0.4, dist: 8, target: [0, 0.5, 0] };
}

function orbitEye(o: OrbitState): [number, number, number] {
  const cp = Math.cos(o.pitch);
  return [
    o.target[0] + Math.sin(o.yaw) * cp * o.dist,
    o.target[1] + Math.sin(o.pitch) * o.dist,
    o.target[2] + Math.cos(o.yaw) * cp * o.dist,
  ];
}

function projectPoint(
  x: number,
  y: number,
  z: number,
  eye: [number, number, number],
  target: [number, number, number],
  w: number,
  h: number
): { sx: number; sy: number } | null {
  const view = mat4LookAt(eye[0], eye[1], eye[2], target[0], target[1], target[2]);
  const proj = mat4Perspective(60, w / Math.max(1, h), 0.1, 100);
  // clip = proj * view * p (column-major)
  const vx = view[0] * x + view[4] * y + view[8] * z + view[12];
  const vy = view[1] * x + view[5] * y + view[9] * z + view[13];
  const vz = view[2] * x + view[6] * y + view[10] * z + view[14];
  const vw = view[3] * x + view[7] * y + view[11] * z + view[15];
  const cx = proj[0] * vx + proj[4] * vy + proj[8] * vz + proj[12] * vw;
  const cy = proj[1] * vx + proj[5] * vy + proj[9] * vz + proj[13] * vw;
  const cw = proj[3] * vx + proj[7] * vy + proj[11] * vz + proj[15] * vw;
  if (Math.abs(cw) < 1e-5) return null;
  return {
    sx: (cx / cw * 0.5 + 0.5) * w,
    sy: (1 - (cy / cw * 0.5 + 0.5)) * h,
  };
}

/**
 * WebGPU edit preview for `.jscene` 3D components.
 * Call `setActive(false)` before Play so `world_draw3d` owns the GPU canvas.
 */
export function attachSceneView3d(
  canvas: HTMLCanvasElement,
  store: SceneStore,
  options: {
    getAssetText?: (path: string) => string | null;
    fallbackCanvas?: HTMLCanvasElement | null;
  } = {}
): SceneView3dHandle {
  const memoryRef = { current: null as WebAssembly.Memory | null };
  const handlers = createScene3dHandlers(canvas, memoryRef);
  let active = false;
  let gpuOk: boolean | null = null;
  let dirty = true;
  let building = false;
  let buildGen = 0;
  let raf = 0;
  let editorCam = 0;
  let orbit = defaultOrbit();
  let picks: PickEntry[] = [];
  const markerHandles: number[] = [];
  let dragging:
    | { mode: "orbit"; lx: number; ly: number }
    | { mode: "pan"; lx: number; ly: number }
    | { mode: "move"; id: number; ox: number; oz: number; planeY: number }
    | null = null;

  function isLive(): boolean {
    return active && getEditorMode() === "edit" && sceneHas3d(store.getScene());
  }

  function loadText(path: string): string | null {
    const get = options.getAssetText;
    if (!get) return null;
    return get(path) ?? get(`assets/${path}`);
  }

  function addMarker(sx: number, sy: number, sz: number): number {
    const id = handlers.meshBox?.(sx, sy, sz) ?? 0;
    if (id) markerHandles.push(id);
    return id;
  }

  async function rebuild(): Promise<void> {
    if (!isLive() || !dirty || building) return;
    building = true;
    const gen = ++buildGen;
    try {
      if (gpuOk === null) gpuOk = await ensureGpu(canvas);
      if (gen !== buildGen || !isLive()) return;

      if (!gpuOk) {
        dirty = false;
        canvas.hidden = true;
        canvas.style.display = "none";
        if (options.fallbackCanvas) {
          options.fallbackCanvas.hidden = false;
          options.fallbackCanvas.style.display = "block";
        }
        drawFallback();
        return;
      }

      canvas.hidden = false;
      canvas.style.display = "block";
      if (options.fallbackCanvas) {
        options.fallbackCanvas.hidden = true;
        options.fallbackCanvas.style.display = "none";
      }

      handlers.init?.(canvas.width, canvas.height);
      resetSceneTables();
      resetWorld();
      markerHandles.length = 0;
      picks = [];

      const scene = store.getScene();
      loadSceneIntoWorld(scene, { reset: true });
      scene3dSetAmbient(0.28, 0.28, 0.32);

      editorCam =
        handlers.cameraPerspective?.(60, canvas.width / Math.max(1, canvas.height), 0.1, 100) ?? 0;

      materializeScene3d(scene, {
        meshBox: (sx, sy, sz) => handlers.meshBox?.(sx, sy, sz) ?? 0,
        cameraPerspective: (fov, aspect, near, far) =>
          handlers.cameraPerspective?.(fov, aspect, near, far) ?? 0,
        cameraOrbit: (cam, tx, ty, tz, yaw, pitch, dist) =>
          handlers.cameraOrbit?.(cam, tx, ty, tz, yaw, pitch, dist),
        lightDirectional: light3dDirectional,
        lightPoint: light3dPoint,
        materialColor: (r, g, b, a) => handlers.materialColor?.(r, g, b, a) ?? 0,
        meshSetMaterial: (mesh, mat) => handlers.meshSetMaterial?.(mesh, mat),
        loadGltf: (path) => {
          const lower = path.toLowerCase();
          if (lower.endsWith(".glb")) {
            const text = loadText(path);
            if (text) {
              const bytes = new Uint8Array(text.length);
              for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
              if (isGlbBytes(bytes)) {
                const data = parseGltfOrGlb(bytes);
                if (data) return createCustomMeshFromData(data.positions, data.indices);
              }
            }
            return 0;
          }
          const text = loadText(path);
          if (!text) return 0;
          const data = parseGltfJson(text, {
            getBufferBytes: (uri) => {
              const bin = loadText(uri);
              if (!bin) return null;
              if (bin.startsWith("data:")) {
                const idx = bin.indexOf("base64,");
                if (idx < 0) return null;
                const raw = atob(bin.slice(idx + 7));
                const out = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
                return out.buffer;
              }
              return null;
            },
          });
          if (!data) return 0;
          return createCustomMeshFromData(data.positions, data.indices);
        },
        syncMeshPose,
      });

      const selected = new Set(store.getSelectedIds());
      const world = getWorld();

      for (const raw of scene.entities) {
        const id = raw.id ?? 0;
        const e = world.entities.get(id);
        const c = raw.components ?? {};

        if (e?.mesh3d && e.transform3d) {
          const t = e.transform3d;
          const size = c.mesh3d?.size ?? [1, 1, 1];
          picks.push({
            id,
            kind: "mesh",
            x: t.tx,
            y: t.ty,
            z: t.tz,
            radius: 0.5 * Math.max(size[0] * t.sx, size[1] * t.sy, size[2] * t.sz),
          });
          if (selected.has(id)) {
            const mat = handlers.materialColor?.(0.95, 0.75, 0.2, 1) ?? 0;
            if (mat) handlers.meshSetMaterial?.(e.mesh3d.meshHandle, mat);
          }
        }

        if (c.light3d) {
          const pos =
            c.light3d.type === "point"
              ? (c.light3d.position ?? [0, 2, 0])
              : [
                  -(c.light3d.direction?.[0] ?? 0.35) * 3,
                  Math.max(1, -(c.light3d.direction?.[1] ?? -1) * 3),
                  -(c.light3d.direction?.[2] ?? -0.45) * 3,
                ];
          const marker = addMarker(0.25, 0.25, 0.25);
          if (marker) {
            const col = c.light3d.color ?? [1, 0.95, 0.6];
            const mat = handlers.materialColor?.(col[0], col[1], col[2], 1) ?? 0;
            if (mat) handlers.meshSetMaterial?.(marker, mat);
            handlers.meshSetPose?.(marker, pos[0], pos[1], pos[2], 0, 0, 0);
            picks.push({ id, kind: "light", x: pos[0], y: pos[1], z: pos[2], radius: 0.4 });
          }
        }

        if (c.camera3d) {
          const target = c.camera3d.target ?? [0, 0, 0];
          const yaw = c.camera3d.orbit_yaw ?? 0.4;
          const pitch = c.camera3d.orbit_pitch ?? 0.35;
          const dist = c.camera3d.orbit_distance ?? 6;
          const cp = Math.cos(pitch);
          const eye: [number, number, number] = [
            target[0] + Math.sin(yaw) * cp * dist,
            target[1] + Math.sin(pitch) * dist,
            target[2] + Math.cos(yaw) * cp * dist,
          ];
          const marker = addMarker(0.3, 0.2, 0.35);
          if (marker) {
            const mat = handlers.materialColor?.(0.35, 0.75, 0.95, 1) ?? 0;
            if (mat) handlers.meshSetMaterial?.(marker, mat);
            handlers.meshSetPose?.(marker, eye[0], eye[1], eye[2], 0, yaw, 0);
            picks.push({ id, kind: "camera", x: eye[0], y: eye[1], z: eye[2], radius: 0.45 });
          }
        }
      }

      // RGB axis gizmo at origin.
      const ax = addMarker(0.9, 0.04, 0.04);
      const ay = addMarker(0.04, 0.9, 0.04);
      const az = addMarker(0.04, 0.04, 0.9);
      if (ax) {
        const m = handlers.materialColor?.(0.9, 0.25, 0.2, 1) ?? 0;
        if (m) handlers.meshSetMaterial?.(ax, m);
        handlers.meshSetPose?.(ax, 0.45, 0, 0, 0, 0, 0);
      }
      if (ay) {
        const m = handlers.materialColor?.(0.3, 0.85, 0.35, 1) ?? 0;
        if (m) handlers.meshSetMaterial?.(ay, m);
        handlers.meshSetPose?.(ay, 0, 0.45, 0, 0, 0, 0);
      }
      if (az) {
        const m = handlers.materialColor?.(0.3, 0.5, 0.95, 1) ?? 0;
        if (m) handlers.meshSetMaterial?.(az, m);
        handlers.meshSetPose?.(az, 0, 0, 0.45, 0, 0, 0);
      }

      dirty = false;
    } finally {
      building = false;
    }
  }

  function drawGpu(): void {
    if (!gpuOk || !editorCam) return;
    handlers.cameraOrbit?.(
      editorCam,
      orbit.target[0],
      orbit.target[1],
      orbit.target[2],
      orbit.yaw,
      orbit.pitch,
      orbit.dist
    );
    handlers.clear?.(0.05, 0.06, 0.09, 1);

    const world = getWorld();
    const ecs = new Set<number>();
    for (const e of world.entities.values()) {
      if (!e.mesh3d) continue;
      ecs.add(e.mesh3d.meshHandle);
      if (e.transform3d) {
        const t = e.transform3d;
        syncMeshPose(e.mesh3d.meshHandle, t.tx, t.ty, t.tz, t.rx, t.ry, t.rz);
      }
      handlers.draw?.(e.mesh3d.meshHandle, editorCam);
    }
    for (const id of markerHandles) {
      if (ecs.has(id)) continue;
      handlers.draw?.(id, editorCam);
    }
  }

  function drawFallback(): void {
    const fb = options.fallbackCanvas;
    const ctx = fb?.getContext("2d");
    if (!ctx || !fb) return;
    ctx.clearRect(0, 0, fb.width, fb.height);
    ctx.fillStyle = "#14161c";
    ctx.fillRect(0, 0, fb.width, fb.height);
    ctx.fillStyle = "rgba(232,225,212,0.55)";
    ctx.font = "12px JetBrains Mono, monospace";
    ctx.fillText("3D edit (Canvas2D fallback — WebGPU unavailable)", 12, 22);

    const scene = store.getScene();
    const selected = new Set(store.getSelectedIds());
    const cx = fb.width / 2;
    const cy = fb.height / 2 + 20;
    const scale = 28;
    const iso = (x: number, y: number, z: number) => ({
      x: cx + (x - z) * scale * 0.866,
      y: cy - y * scale - (x + z) * scale * 0.5,
    });

    picks = [];
    for (const ent of scene.entities) {
      const c = ent.components;
      if (!c) continue;
      const id = ent.id ?? 0;
      if (c.mesh3d) {
        const p = c.transform3d?.position ?? [0, 0, 0];
        const s = c.mesh3d.size ?? [1, 1, 1];
        const a = iso(p[0] - s[0] / 2, p[1], p[2] - s[2] / 2);
        const b = iso(p[0] + s[0] / 2, p[1] + s[1], p[2] + s[2] / 2);
        const x0 = Math.min(a.x, b.x);
        const y0 = Math.min(a.y, b.y);
        const w = Math.max(12, Math.abs(b.x - a.x));
        const h = Math.max(12, Math.abs(b.y - a.y));
        const col = c.mesh3d.color;
        ctx.fillStyle = selected.has(id)
          ? "#f0c040"
          : col
            ? `rgba(${Math.round(col[0] * 255)},${Math.round(col[1] * 255)},${Math.round(col[2] * 255)},0.85)`
            : "#6b8cae";
        ctx.fillRect(x0, y0, w, h);
        ctx.strokeStyle = selected.has(id) ? "#fff" : "rgba(255,255,255,0.25)";
        ctx.strokeRect(x0, y0, w, h);
        ctx.fillStyle = "#e8e1d4";
        ctx.fillText(ent.name ?? "mesh", x0, y0 - 4);
        picks.push({ id, kind: "mesh", x: p[0], y: p[1], z: p[2], radius: Math.max(s[0], s[1], s[2]) });
      }
      if (c.light3d) {
        const p = c.light3d.type === "point" ? (c.light3d.position ?? [0, 2, 0]) : [2, 2, 2];
        const s = iso(p[0], p[1], p[2]);
        ctx.fillStyle = "#f5d76e";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e8e1d4";
        ctx.fillText(ent.name ?? "light", s.x + 10, s.y + 4);
        picks.push({ id, kind: "light", x: p[0], y: p[1], z: p[2], radius: 0.4 });
      }
      if (c.camera3d) {
        const t = c.camera3d.target ?? [0, 0, 0];
        const s = iso(t[0], t[1] + 1, t[2]);
        ctx.fillStyle = "#5dade2";
        ctx.fillRect(s.x - 8, s.y - 6, 16, 12);
        ctx.fillStyle = "#e8e1d4";
        ctx.fillText(ent.name ?? "cam", s.x + 10, s.y + 4);
        picks.push({ id, kind: "camera", x: t[0], y: t[1], z: t[2], radius: 0.5 });
      }
    }
  }

  async function tick(): Promise<void> {
    if (!isLive()) {
      raf = 0;
      return;
    }
    await rebuild();
    if (!isLive()) {
      raf = 0;
      return;
    }
    if (gpuOk) drawGpu();
    else drawFallback();
    raf = requestAnimationFrame(() => {
      void tick();
    });
  }

  function startLoop(): void {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      void tick();
    });
  }

  function stopLoop(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function canvasPoint(clientX: number, clientY: number): { sx: number; sy: number } {
    const r = canvas.getBoundingClientRect();
    return {
      sx: ((clientX - r.left) / r.width) * canvas.width,
      sy: ((clientY - r.top) / r.height) * canvas.height,
    };
  }

  function hitTest(clientX: number, clientY: number): number | null {
    const { sx, sy } = canvasPoint(clientX, clientY);
    const eye = orbitEye(orbit);
    let best: { id: number; d: number } | null = null;
    for (const p of picks) {
      const scr = projectPoint(p.x, p.y, p.z, eye, orbit.target, canvas.width, canvas.height);
      if (!scr) continue;
      const rad = 16 + p.radius * 10;
      const d = Math.hypot(scr.sx - sx, scr.sy - sy);
      if (d <= rad && (!best || d < best.d)) best = { id: p.id, d };
    }
    return best?.id ?? null;
  }

  function groundHit(
    clientX: number,
    clientY: number,
    planeY: number
  ): { x: number; z: number } | null {
    const { sx, sy } = canvasPoint(clientX, clientY);
    const ndcX = (sx / canvas.width) * 2 - 1;
    const ndcY = 1 - (sy / canvas.height) * 2;
    const eye = orbitEye(orbit);
    const fov = (60 * Math.PI) / 180;
    const aspect = canvas.width / Math.max(1, canvas.height);
    const tanHalf = Math.tan(fov / 2);
    const forward = [
      orbit.target[0] - eye[0],
      orbit.target[1] - eye[1],
      orbit.target[2] - eye[2],
    ];
    const fl = Math.hypot(forward[0], forward[1], forward[2]) || 1;
    forward[0] /= fl;
    forward[1] /= fl;
    forward[2] /= fl;
    const right = [
      forward[1] * 0 - forward[2] * 1,
      forward[2] * 0 - forward[0] * 0,
      forward[0] * 1 - forward[1] * 0,
    ];
    const rl = Math.hypot(right[0], right[1], right[2]) || 1;
    right[0] /= rl;
    right[1] /= rl;
    right[2] /= rl;
    const up = [
      right[1] * forward[2] - right[2] * forward[1],
      right[2] * forward[0] - right[0] * forward[2],
      right[0] * forward[1] - right[1] * forward[0],
    ];
    const dir = [
      forward[0] + right[0] * ndcX * tanHalf * aspect + up[0] * ndcY * tanHalf,
      forward[1] + right[1] * ndcX * tanHalf * aspect + up[1] * ndcY * tanHalf,
      forward[2] + right[2] * ndcX * tanHalf * aspect + up[2] * ndcY * tanHalf,
    ];
    const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    dir[0] /= dl;
    dir[1] /= dl;
    dir[2] /= dl;
    if (Math.abs(dir[1]) < 1e-5) return null;
    const t = (planeY - eye[1]) / dir[1];
    if (t < 0) return null;
    return { x: eye[0] + dir[0] * t, z: eye[2] + dir[2] * t };
  }

  const onDown = (e: MouseEvent) => {
    if (!isLive()) return;
    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      dragging = { mode: e.shiftKey ? "pan" : "orbit", lx: e.clientX, ly: e.clientY };
      e.preventDefault();
      return;
    }
    const id = hitTest(e.clientX, e.clientY);
    if (id != null) {
      store.select(id, e.shiftKey);
      const ent = store.getSelected();
      const t = ent?.components?.transform3d?.position ?? [0, 0, 0];
      if (ent?.components?.mesh3d || ent?.components?.transform3d) {
        store.beginDragGesture();
        const hit = groundHit(e.clientX, e.clientY, t[1]);
        dragging = {
          mode: "move",
          id,
          ox: hit ? hit.x - t[0] : 0,
          oz: hit ? hit.z - t[2] : 0,
          planeY: t[1],
        };
      }
      dirty = true;
    } else {
      store.clearSelection();
      dragging = { mode: "orbit", lx: e.clientX, ly: e.clientY };
      dirty = true;
    }
  };

  const onMove = (e: MouseEvent) => {
    if (!isLive() || !dragging) return;
    if (dragging.mode === "orbit") {
      orbit.yaw -= (e.clientX - dragging.lx) * 0.01;
      orbit.pitch = Math.max(-1.2, Math.min(1.2, orbit.pitch + (e.clientY - dragging.ly) * 0.01));
      dragging.lx = e.clientX;
      dragging.ly = e.clientY;
      return;
    }
    if (dragging.mode === "pan") {
      const dx = e.clientX - dragging.lx;
      const dy = e.clientY - dragging.ly;
      const eye = orbitEye(orbit);
      const forward = [orbit.target[0] - eye[0], 0, orbit.target[2] - eye[2]];
      const fl = Math.hypot(forward[0], forward[2]) || 1;
      forward[0] /= fl;
      forward[2] /= fl;
      const right = [-forward[2], 0, forward[0]];
      const scale = orbit.dist * 0.002;
      orbit.target[0] -= right[0] * dx * scale - forward[0] * dy * scale;
      orbit.target[2] -= right[2] * dx * scale - forward[2] * dy * scale;
      dragging.lx = e.clientX;
      dragging.ly = e.clientY;
      return;
    }
    const hit = groundHit(e.clientX, e.clientY, dragging.planeY);
    if (!hit) return;
    store.setEntityTransform3d(dragging.id, hit.x - dragging.ox, dragging.planeY, hit.z - dragging.oz);
    // Live pose update without full GPU rebuild.
    const world = getWorld();
    const ent = world.entities.get(dragging.id);
    if (ent?.mesh3d && ent.transform3d) {
      const t = ent.transform3d;
      t.tx = hit.x - dragging.ox;
      t.ty = dragging.planeY;
      t.tz = hit.z - dragging.oz;
      syncMeshPose(ent.mesh3d.meshHandle, t.tx, t.ty, t.tz, t.rx, t.ry, t.rz);
    }
    for (const p of picks) {
      if (p.id === dragging.id && p.kind === "mesh") {
        p.x = hit.x - dragging.ox;
        p.y = dragging.planeY;
        p.z = hit.z - dragging.oz;
      }
    }
  };

  const onUp = () => {
    if (dragging?.mode === "move") {
      store.endDragGesture();
      dirty = true;
    }
    dragging = null;
  };

  const onWheel = (e: WheelEvent) => {
    if (!isLive()) return;
    e.preventDefault();
    orbit.dist = Math.max(1.5, Math.min(40, orbit.dist * (e.deltaY > 0 ? 1.08 : 0.92)));
  };

  const onContext = (e: MouseEvent) => {
    if (isLive()) e.preventDefault();
  };

  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContext);

  const unsub = store.subscribe(() => {
    if (!isLive()) return;
    // Skip full rebuild while dragging a mesh — poses update live in onMove.
    if (dragging?.mode === "move") return;
    dirty = true;
  });

  return {
    setActive(on: boolean) {
      active = on;
      if (on && sceneHas3d(store.getScene()) && getEditorMode() === "edit") {
        dirty = true;
        canvas.hidden = false;
        canvas.style.display = "block";
        startLoop();
      } else {
        stopLoop();
        dragging = null;
      }
    },
    redraw() {
      dirty = true;
      if (isLive()) startLoop();
    },
    dispose() {
      stopLoop();
      active = false;
      unsub();
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContext);
    },
  };
}
