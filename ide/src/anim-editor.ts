/**
 * Animation editor panel — sprite-sheet / discrete keyframe clips.
 * Dedicated side panel (separate from Code Search).
 */
import type { SceneStore } from "./editor/scene-store.js";
import type { ProjectState } from "./project-store.js";
import type { JSceneComponents } from "../../runtime/src/scene-loader.js";

export type AnimKeyAuthored = {
  t: number;
  frame?: number;
  x?: number;
  y?: number;
  rotation?: number;
  tx?: number;
  ty?: number;
  tz?: number;
  rx?: number;
  ry?: number;
  rz?: number;
};

export type AnimClipAuthored = {
  name: string;
  fps: number;
  loop: boolean;
  frames?: number[];
  keys?: AnimKeyAuthored[];
  asset?: string;
};

export type AnimEditorDeps = {
  getProject: () => ProjectState | null;
  getSceneStore: () => SceneStore;
  /** Write or update a project file (marks dirty). */
  writeProjectFile: (path: string, content: string) => void;
  logLine?: (text: string, kind?: string) => void;
};

type SpriteAnimatorAuthored = NonNullable<JSceneComponents["sprite_animator"]>;

function clipPath(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9_-]+/g, "_") || "clip";
  return `assets/anims/${safe}.json`;
}

function parseFrames(text: string): number[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n))
    .map((n) => n | 0);
}

function framesToText(frames: number[] | undefined): string {
  return (frames ?? []).join(", ");
}

function loadProjectClips(project: ProjectState | null): AnimClipAuthored[] {
  if (!project) return [];
  const out: AnimClipAuthored[] = [];
  for (const [path, file] of project.files) {
    if (!path.startsWith("assets/anims/") || !path.endsWith(".json")) continue;
    try {
      const data = JSON.parse(file.content) as AnimClipAuthored;
      if (!data || typeof data !== "object") continue;
      out.push({
        name: data.name || path.split("/").pop()?.replace(/\.json$/, "") || "clip",
        fps: data.fps ?? 0,
        loop: data.loop !== false,
        frames: data.frames,
        keys: data.keys,
        asset: path.replace(/^assets\//, ""),
      });
    } catch {
      /* skip bad json */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function entityAnimator(store: SceneStore): SpriteAnimatorAuthored | null {
  const e = store.getSelected();
  const anim = e?.components?.sprite_animator;
  return anim ?? null;
}

function ensureAnimator(store: SceneStore): SpriteAnimatorAuthored {
  let anim = entityAnimator(store);
  if (anim) return anim;
  store.updateSelected((e) => {
    e.components = e.components ?? {};
    e.components.sprite_animator = {
      default: "idle",
      autoplay: true,
      clips: [
        {
          name: "idle",
          fps: 1,
          loop: true,
          frames: [0],
        },
      ],
    };
  });
  anim = entityAnimator(store);
  return anim ?? { clips: [], autoplay: true, default: "" };
}

export function wireAnimEditorPanel(deps: AnimEditorDeps): {
  setOpen: (open: boolean) => void;
  refresh: () => void;
} {
  const panel = document.getElementById("anim-panel") as HTMLElement | null;
  const body = document.getElementById("anim-panel-body") as HTMLElement | null;
  if (!panel || !body) {
    return { setOpen: () => undefined, refresh: () => undefined };
  }

  let selectedClip = "";
  let isOpen = false;

  function refresh(): void {
    if (!isOpen) return;
    const store = deps.getSceneStore();
    const project = deps.getProject();
    const selected = store.getSelected();
    const library = loadProjectClips(project);
    const anim = selected?.components?.sprite_animator;
    const entityClips = (anim?.clips ?? []).map((c) => c.name ?? "").filter(Boolean);

    body!.textContent = "";

    const intro = document.createElement("p");
    intro.className = "anim-intro";
    intro.textContent =
      "Define sprite-sheet / keyframe clips. Attach to the selected entity as SpriteAnimator. Not skeletal / glTF skinning.";
    body!.appendChild(intro);

    const selInfo = document.createElement("p");
    selInfo.className = "anim-status";
    selInfo.textContent = selected
      ? `Entity: ${selected.name ?? `id ${selected.id}`} · clips: ${entityClips.length}`
      : "Select an entity in the Hierarchy to attach clips.";
    body!.appendChild(selInfo);

    // --- New / edit clip form ---
    const form = document.createElement("div");
    form.className = "anim-form";

    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Clip name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = "anim-clip-name";
    nameInput.placeholder = "walk";
    nameInput.value = selectedClip;
    nameLabel.appendChild(nameInput);
    form.appendChild(nameLabel);

    const fpsLabel = document.createElement("label");
    fpsLabel.textContent = "FPS (frame list)";
    const fpsInput = document.createElement("input");
    fpsInput.type = "number";
    fpsInput.min = "0";
    fpsInput.step = "1";
    fpsInput.value = "8";
    fpsLabel.appendChild(fpsInput);
    form.appendChild(fpsLabel);

    const loopLabel = document.createElement("label");
    loopLabel.className = "anim-check";
    const loopInput = document.createElement("input");
    loopInput.type = "checkbox";
    loopInput.checked = true;
    loopLabel.appendChild(loopInput);
    loopLabel.appendChild(document.createTextNode(" Loop"));
    form.appendChild(loopLabel);

    const framesLabel = document.createElement("label");
    framesLabel.textContent = "Sheet frames (comma-separated indices)";
    const framesInput = document.createElement("input");
    framesInput.type = "text";
    framesInput.placeholder = "0, 1, 2, 3";
    framesInput.value = "0, 1, 2, 3";
    framesLabel.appendChild(framesInput);
    form.appendChild(framesLabel);

    const keysLabel = document.createElement("label");
    keysLabel.textContent = "Optional keys JSON (discrete t → frame / pose)";
    const keysInput = document.createElement("textarea");
    keysInput.rows = 4;
    keysInput.placeholder = '[\n  { "t": 0, "y": 0 },\n  { "t": 0.5, "y": -8 }\n]';
    keysLabel.appendChild(keysInput);
    form.appendChild(keysLabel);

    function fillFromClip(clip: AnimClipAuthored): void {
      selectedClip = clip.name;
      nameInput.value = clip.name;
      fpsInput.value = String(clip.fps ?? 0);
      loopInput.checked = clip.loop !== false;
      framesInput.value = framesToText(clip.frames);
      keysInput.value = clip.keys ? JSON.stringify(clip.keys, null, 2) : "";
    }

    // Prefill from library selection or entity clip
    if (selectedClip) {
      const fromLib = library.find((c) => c.name === selectedClip);
      const fromEnt = anim?.clips?.find((c) => c.name === selectedClip);
      if (fromLib) fillFromClip(fromLib);
      else if (fromEnt) {
        fillFromClip({
          name: fromEnt.name ?? selectedClip,
          fps: fromEnt.fps ?? 0,
          loop: fromEnt.loop !== false,
          frames: fromEnt.frames,
          keys: fromEnt.keys as AnimKeyAuthored[] | undefined,
          asset: fromEnt.asset,
        });
      }
    }

    const actions = document.createElement("div");
    actions.className = "anim-actions";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "run tight";
    saveBtn.textContent = "Save clip JSON";
    saveBtn.addEventListener("click", () => {
      const name = nameInput.value.trim();
      if (!name) {
        deps.logLine?.("Anim: clip name required", "err");
        return;
      }
      let keys: AnimKeyAuthored[] | undefined;
      const keysRaw = keysInput.value.trim();
      if (keysRaw) {
        try {
          keys = JSON.parse(keysRaw) as AnimKeyAuthored[];
          if (!Array.isArray(keys)) throw new Error("keys must be an array");
        } catch (err) {
          deps.logLine?.(
            `Anim: invalid keys JSON (${err instanceof Error ? err.message : err})`,
            "err",
          );
          return;
        }
      }
      const frames = parseFrames(framesInput.value);
      const clip: AnimClipAuthored = {
        name,
        fps: Math.max(0, Number(fpsInput.value) || 0),
        loop: loopInput.checked,
      };
      if (frames.length) clip.frames = frames;
      if (keys?.length) clip.keys = keys;
      const path = clipPath(name);
      const payload = {
        version: 1,
        name: clip.name,
        fps: clip.fps,
        loop: clip.loop,
        ...(clip.frames ? { frames: clip.frames } : {}),
        ...(clip.keys ? { keys: clip.keys } : {}),
      };
      deps.writeProjectFile(path, `${JSON.stringify(payload, null, 2)}\n`);
      selectedClip = name;
      deps.logLine?.(`Anim: saved ${path}`, "meta");
      refresh();
    });

    const attachBtn = document.createElement("button");
    attachBtn.type = "button";
    attachBtn.className = "ghost tight";
    attachBtn.textContent = "Attach to entity";
    attachBtn.disabled = !selected;
    attachBtn.addEventListener("click", () => {
      if (!selected) return;
      const name = nameInput.value.trim();
      if (!name) {
        deps.logLine?.("Anim: clip name required", "err");
        return;
      }
      let keys: AnimKeyAuthored[] | undefined;
      const keysRaw = keysInput.value.trim();
      if (keysRaw) {
        try {
          keys = JSON.parse(keysRaw) as AnimKeyAuthored[];
        } catch {
          deps.logLine?.("Anim: invalid keys JSON", "err");
          return;
        }
      }
      const frames = parseFrames(framesInput.value);
      const asset = clipPath(name).replace(/^assets\//, "");
      ensureAnimator(store);
      store.updateSelected((e) => {
        const sa = e.components!.sprite_animator!;
        const clips = [...(sa.clips ?? [])];
        const next = {
          name,
          fps: Math.max(0, Number(fpsInput.value) || 0),
          loop: loopInput.checked,
          ...(frames.length ? { frames } : {}),
          ...(keys?.length ? { keys } : {}),
          asset,
        };
        const idx = clips.findIndex((c) => c.name === name);
        if (idx >= 0) clips[idx] = next;
        else clips.push(next);
        e.components!.sprite_animator = {
          ...sa,
          clips,
          default: sa.default || name,
        };
      });
      selectedClip = name;
      deps.logLine?.(`Anim: attached "${name}" to entity`, "meta");
      refresh();
    });

    const enableBtn = document.createElement("button");
    enableBtn.type = "button";
    enableBtn.className = "ghost tight";
    enableBtn.textContent = anim ? "SpriteAnimator on" : "Add SpriteAnimator";
    enableBtn.disabled = !selected;
    enableBtn.addEventListener("click", () => {
      if (!selected) return;
      ensureAnimator(store);
      refresh();
    });

    actions.append(saveBtn, attachBtn, enableBtn);
    form.appendChild(actions);
    body!.appendChild(form);

    // --- Library list ---
    const libHead = document.createElement("h4");
    libHead.className = "anim-section-title";
    libHead.textContent = "Project clips (assets/anims)";
    body!.appendChild(libHead);

    const lib = document.createElement("ul");
    lib.className = "anim-clip-list";
    if (library.length === 0) {
      const empty = document.createElement("li");
      empty.className = "anim-empty";
      empty.textContent = "No clip files yet — Save clip JSON to create one.";
      lib.appendChild(empty);
    } else {
      for (const clip of library) {
        const li = document.createElement("li");
        li.className =
          "anim-clip-item" + (clip.name === selectedClip ? " is-selected" : "");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ghost tight anim-clip-pick";
        btn.textContent = `${clip.name} (${clip.frames?.length ?? 0} frames)`;
        btn.addEventListener("click", () => {
          fillFromClip(clip);
          refresh();
        });
        li.appendChild(btn);
        lib.appendChild(li);
      }
    }
    body!.appendChild(lib);

    // --- Entity clips ---
    if (anim?.clips?.length) {
      const entHead = document.createElement("h4");
      entHead.className = "anim-section-title";
      entHead.textContent = "Entity clips";
      body!.appendChild(entHead);
      const entList = document.createElement("ul");
      entList.className = "anim-clip-list";
      for (const c of anim.clips) {
        const li = document.createElement("li");
        li.className = "anim-clip-item";
        const name = c.name ?? "?";
        const pick = document.createElement("button");
        pick.type = "button";
        pick.className = "ghost tight anim-clip-pick";
        pick.textContent = name + (anim.default === name ? " ★" : "");
        pick.addEventListener("click", () => {
          fillFromClip({
            name,
            fps: c.fps ?? 0,
            loop: c.loop !== false,
            frames: c.frames,
            keys: c.keys as AnimKeyAuthored[] | undefined,
            asset: c.asset,
          });
          refresh();
        });
        const def = document.createElement("button");
        def.type = "button";
        def.className = "ghost tight";
        def.textContent = "Default";
        def.addEventListener("click", () => {
          store.updateSelected((e) => {
            const sa = e.components?.sprite_animator;
            if (!sa) return;
            e.components!.sprite_animator = { ...sa, default: name };
          });
          refresh();
        });
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "ghost tight";
        rm.textContent = "Remove";
        rm.addEventListener("click", () => {
          store.updateSelected((e) => {
            const sa = e.components?.sprite_animator;
            if (!sa) return;
            const clips = (sa.clips ?? []).filter((x) => x.name !== name);
            e.components!.sprite_animator = {
              ...sa,
              clips,
              default: sa.default === name ? clips[0]?.name ?? "" : sa.default,
            };
          });
          refresh();
        });
        li.append(pick, def, rm);
        entList.appendChild(li);
      }
      body!.appendChild(entList);
    }

    const tip = document.createElement("p");
    tip.className = "anim-tip";
    tip.innerHTML =
      "Play: <code>anim_play(id, \"walk\")</code> / <code>anim_stop(id)</code> — see Docs → Animation.";
    body!.appendChild(tip);
  }

  return {
    setOpen: (open) => {
      isOpen = open;
      if (open) refresh();
    },
    refresh: () => {
      if (isOpen) refresh();
    },
  };
}
