/** Property inspector for the selected scene entity. */

import type { SceneStore } from "./scene-store.js";
import type { AssetPack } from "../../../runtime/src/types.js";

function numInput(
  label: string,
  value: number,
  onChange: (v: number) => void
): HTMLLabelElement {
  const wrap = document.createElement("label");
  wrap.className = "inspector-field";
  wrap.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.step = "any";
  input.value = String(value);
  input.addEventListener("change", () => onChange(Number(input.value)));
  wrap.appendChild(input);
  return wrap;
}

function textInput(
  label: string,
  value: string,
  onChange: (v: string) => void
): HTMLLabelElement {
  const wrap = document.createElement("label");
  wrap.className = "inspector-field";
  wrap.textContent = label;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.addEventListener("change", () => onChange(input.value));
  wrap.appendChild(input);
  return wrap;
}

function selectInput(
  label: string,
  value: string,
  options: string[],
  onChange: (v: string) => void
): HTMLLabelElement {
  const wrap = document.createElement("label");
  wrap.className = "inspector-field";
  wrap.textContent = label;
  const select = document.createElement("select");
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt || "(none)";
    if (opt === value) o.selected = true;
    select.appendChild(o);
  }
  select.addEventListener("change", () => onChange(select.value));
  wrap.appendChild(select);
  return wrap;
}

function checkboxInput(
  label: string,
  checked: boolean,
  onChange: (v: boolean) => void
): HTMLLabelElement {
  const wrap = document.createElement("label");
  wrap.className = "inspector-field inspector-field-check";
  wrap.textContent = label;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  wrap.appendChild(input);
  return wrap;
}

function ensureComponents(e: { components?: Record<string, unknown> }): void {
  e.components = e.components ?? {};
}

export function renderInspector(
  host: HTMLElement,
  store: SceneStore,
  assetPack: AssetPack | null
): void {
  host.innerHTML = "";
  const entity = store.getSelected();
  if (!entity) {
    const empty = document.createElement("p");
    empty.className = "inspector-empty";
    empty.textContent = "Select an entity in the hierarchy.";
    host.appendChild(empty);
    return;
  }

  const title = document.createElement("div");
  title.className = "inspector-title";
  title.textContent = entity.name ?? `Entity_${entity.id}`;
  host.appendChild(title);

  host.appendChild(
    textInput("Name", entity.name ?? "", (v) => {
      store.updateSelected((e) => {
        e.name = v;
      });
    })
  );
  host.appendChild(
    textInput("Tag", entity.tag ?? "", (v) => {
      store.updateSelected((e) => {
        e.tag = v;
      });
    })
  );

  const c = entity.components ?? {};
  const t2 = c.transform2d ?? { x: 0, y: 0, rotation: 0, scale: [1, 1] as [number, number] };
  const section2d = document.createElement("div");
  section2d.className = "inspector-section";
  section2d.innerHTML = "<h4>Transform2D</h4>";
  section2d.appendChild(
    numInput("X", t2.x ?? 0, (v) =>
      store.updateSelected((e) => {
        ensureComponents(e);
        e.components!.transform2d = { ...(e.components!.transform2d ?? {}), x: v };
      })
    )
  );
  section2d.appendChild(
    numInput("Y", t2.y ?? 0, (v) =>
      store.updateSelected((e) => {
        ensureComponents(e);
        e.components!.transform2d = { ...(e.components!.transform2d ?? {}), y: v };
      })
    )
  );
  section2d.appendChild(
    numInput("Rotation", t2.rotation ?? 0, (v) =>
      store.updateSelected((e) => {
        ensureComponents(e);
        e.components!.transform2d = { ...(e.components!.transform2d ?? {}), rotation: v };
      })
    )
  );
  section2d.appendChild(
    numInput("Scale X", t2.scale?.[0] ?? 1, (v) =>
      store.updateSelected((e) => {
        ensureComponents(e);
        const prev = e.components!.transform2d ?? {};
        const sy = prev.scale?.[1] ?? 1;
        e.components!.transform2d = { ...prev, scale: [v, sy] };
      })
    )
  );
  section2d.appendChild(
    numInput("Scale Y", t2.scale?.[1] ?? 1, (v) =>
      store.updateSelected((e) => {
        ensureComponents(e);
        const prev = e.components!.transform2d ?? {};
        const sx = prev.scale?.[0] ?? 1;
        e.components!.transform2d = { ...prev, scale: [sx, v] };
      })
    )
  );
  section2d.appendChild(
    numInput("Z index", t2.z_index ?? 0, (v) =>
      store.updateSelected((e) => {
        ensureComponents(e);
        e.components!.transform2d = { ...(e.components!.transform2d ?? {}), z_index: v };
      })
    )
  );
  host.appendChild(section2d);

  const sprite = c.sprite ?? {};
  const sectionSprite = document.createElement("div");
  sectionSprite.className = "inspector-section";
  sectionSprite.innerHTML = "<h4>Sprite</h4>";
  const assetPaths = assetPack ? Object.keys(assetPack.assets) : [];
  sectionSprite.appendChild(
    selectInput("Asset", sprite.asset ?? "", [""].concat(assetPaths), (v) =>
      store.updateSelected((e) => {
        ensureComponents(e);
        e.components!.sprite = { ...(e.components!.sprite ?? {}), asset: v || undefined };
      })
    )
  );
  sectionSprite.appendChild(
    numInput("W", sprite.w ?? 32, (v) =>
      store.updateSelected((e) => {
        ensureComponents(e);
        e.components!.sprite = { ...(e.components!.sprite ?? {}), w: v };
      })
    )
  );
  sectionSprite.appendChild(
    numInput("H", sprite.h ?? 32, (v) =>
      store.updateSelected((e) => {
        ensureComponents(e);
        e.components!.sprite = { ...(e.components!.sprite ?? {}), h: v };
      })
    )
  );
  sectionSprite.appendChild(
    numInput("Sheet cols", sprite.cols ?? 1, (v) =>
      store.updateSelected((e) => {
        ensureComponents(e);
        e.components!.sprite = { ...(e.components!.sprite ?? {}), cols: Math.max(1, v | 0) };
      })
    )
  );
  sectionSprite.appendChild(
    numInput("Sheet rows", sprite.rows ?? 1, (v) =>
      store.updateSelected((e) => {
        ensureComponents(e);
        e.components!.sprite = { ...(e.components!.sprite ?? {}), rows: Math.max(1, v | 0) };
      })
    )
  );
  sectionSprite.appendChild(
    numInput("FPS", sprite.fps ?? 0, (v) =>
      store.updateSelected((e) => {
        ensureComponents(e);
        e.components!.sprite = { ...(e.components!.sprite ?? {}), fps: Math.max(0, v) };
      })
    )
  );
  host.appendChild(sectionSprite);

  const body = c.rigidbody2d;
  const sectionBody = document.createElement("div");
  sectionBody.className = "inspector-section";
  sectionBody.innerHTML = "<h4>RigidBody2D</h4>";
  sectionBody.appendChild(
    checkboxInput("Enabled", !!body, (on) => {
      store.updateSelected((e) => {
        ensureComponents(e);
        if (on) e.components!.rigidbody2d = { vx: 0, vy: 0, gravity: 900 };
        else delete e.components!.rigidbody2d;
      });
    })
  );
  if (body) {
    sectionBody.appendChild(
      numInput("Gravity", body.gravity ?? 0, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.rigidbody2d = { ...(e.components!.rigidbody2d ?? {}), gravity: v };
        })
      )
    );
    sectionBody.appendChild(
      numInput("VX", body.vx ?? 0, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.rigidbody2d = { ...(e.components!.rigidbody2d ?? {}), vx: v };
        })
      )
    );
    sectionBody.appendChild(
      numInput("VY", body.vy ?? 0, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.rigidbody2d = { ...(e.components!.rigidbody2d ?? {}), vy: v };
        })
      )
    );
  }
  host.appendChild(sectionBody);

  const col = c.collider2d;
  const sectionCol = document.createElement("div");
  sectionCol.className = "inspector-section";
  sectionCol.innerHTML = "<h4>Collider2D</h4>";
  sectionCol.appendChild(
    checkboxInput("Enabled", !!col, (on) => {
      store.updateSelected((e) => {
        ensureComponents(e);
        if (on) {
          e.components!.collider2d = {
            type: "aabb",
            w: 32,
            h: 32,
            radius: 16,
            solid: true,
            slope: 0,
          };
        } else delete e.components!.collider2d;
      });
    })
  );
  if (col) {
    const kind = col.type === "circle" ? "circle" : "aabb";
    sectionCol.appendChild(
      selectInput("Shape", kind, ["aabb", "circle"], (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.collider2d = { ...(e.components!.collider2d ?? {}), type: v };
        })
      )
    );
    if (kind === "circle") {
      sectionCol.appendChild(
        numInput("Radius", col.radius ?? 16, (v) =>
          store.updateSelected((e) => {
            ensureComponents(e);
            e.components!.collider2d = { ...(e.components!.collider2d ?? {}), radius: v };
          })
        )
      );
    } else {
      sectionCol.appendChild(
        numInput("W", col.w ?? 32, (v) =>
          store.updateSelected((e) => {
            ensureComponents(e);
            e.components!.collider2d = { ...(e.components!.collider2d ?? {}), w: v };
          })
        )
      );
      sectionCol.appendChild(
        numInput("H", col.h ?? 32, (v) =>
          store.updateSelected((e) => {
            ensureComponents(e);
            e.components!.collider2d = { ...(e.components!.collider2d ?? {}), h: v };
          })
        )
      );
    }
    sectionCol.appendChild(
      checkboxInput("Solid", col.solid !== false, (on) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.collider2d = { ...(e.components!.collider2d ?? {}), solid: on };
        })
      )
    );
    sectionCol.appendChild(
      numInput("Slope °", col.slope ?? 0, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.collider2d = { ...(e.components!.collider2d ?? {}), slope: v };
        })
      )
    );
  }
  host.appendChild(sectionCol);

  const cam = c.camera2d;
  const sectionCam = document.createElement("div");
  sectionCam.className = "inspector-section";
  sectionCam.innerHTML = "<h4>Camera2D</h4>";
  sectionCam.appendChild(
    checkboxInput("Enabled", !!cam, (on) => {
      store.updateSelected((e) => {
        ensureComponents(e);
        if (on) {
          e.components!.camera2d = {
            x: 0,
            y: 0,
            zoom: 1,
            active: true,
            follow_target: 0,
            smooth: 0.12,
          };
        } else delete e.components!.camera2d;
      });
    })
  );
  if (cam) {
    sectionCam.appendChild(
      numInput("X", cam.x ?? 0, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.camera2d = { ...(e.components!.camera2d ?? {}), x: v };
        })
      )
    );
    sectionCam.appendChild(
      numInput("Y", cam.y ?? 0, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.camera2d = { ...(e.components!.camera2d ?? {}), y: v };
        })
      )
    );
    sectionCam.appendChild(
      numInput("Zoom", cam.zoom ?? 1, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.camera2d = { ...(e.components!.camera2d ?? {}), zoom: v };
        })
      )
    );
    sectionCam.appendChild(
      checkboxInput("Active", cam.active !== false, (on) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.camera2d = { ...(e.components!.camera2d ?? {}), active: on };
        })
      )
    );
    sectionCam.appendChild(
      numInput("Follow id", cam.follow_target ?? 0, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.camera2d = {
            ...(e.components!.camera2d ?? {}),
            follow_target: v | 0,
          };
        })
      )
    );
    sectionCam.appendChild(
      numInput("Smooth", cam.smooth ?? 1, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.camera2d = { ...(e.components!.camera2d ?? {}), smooth: v };
        })
      )
    );
  }
  host.appendChild(sectionCam);

  const tm = c.tilemap;
  const sectionTm = document.createElement("div");
  sectionTm.className = "inspector-section";
  sectionTm.innerHTML = "<h4>Tilemap</h4>";
  sectionTm.appendChild(
    checkboxInput("Enabled", !!tm, (on) => {
      store.updateSelected((e) => {
        ensureComponents(e);
        if (on) {
          e.components!.tilemap = {
            tile_size: 32,
            cols: 8,
            rows: 4,
            tiles: [],
            tileset: 0,
          };
        } else delete e.components!.tilemap;
      });
    })
  );
  if (tm) {
    sectionTm.appendChild(
      numInput("Tile size", tm.tile_size ?? 32, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.tilemap = { ...(e.components!.tilemap ?? {}), tile_size: v };
        })
      )
    );
    sectionTm.appendChild(
      numInput("Cols", tm.cols ?? 0, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.tilemap = { ...(e.components!.tilemap ?? {}), cols: v | 0 };
        })
      )
    );
    sectionTm.appendChild(
      numInput("Rows", tm.rows ?? 0, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.tilemap = { ...(e.components!.tilemap ?? {}), rows: v | 0 };
        })
      )
    );
    sectionTm.appendChild(
      numInput("Tileset", tm.tileset ?? 0, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.tilemap = { ...(e.components!.tilemap ?? {}), tileset: v | 0 };
        })
      )
    );
    const tilesStr = Array.isArray(tm.tiles) ? tm.tiles.join(",") : "";
    sectionTm.appendChild(
      textInput("Tiles CSV", tilesStr, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          const tiles = v
            .split(/[,\s]+/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => Number(s))
            .filter((n) => Number.isFinite(n));
          e.components!.tilemap = { ...(e.components!.tilemap ?? {}), tiles };
        })
      )
    );
  }
  host.appendChild(sectionTm);

  const prefab = c.prefab;
  const sectionPrefab = document.createElement("div");
  sectionPrefab.className = "inspector-section";
  sectionPrefab.innerHTML = "<h4>Prefab</h4>";
  sectionPrefab.appendChild(
    checkboxInput("Enabled", !!prefab, (on) => {
      store.updateSelected((e) => {
        ensureComponents(e);
        if (on) e.components!.prefab = { path: "prefabs/entity.jscene", offset: [0, 0] };
        else delete e.components!.prefab;
      });
    })
  );
  if (prefab) {
    sectionPrefab.appendChild(
      textInput("Path", prefab.path ?? "", (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.prefab = { ...(e.components!.prefab ?? {}), path: v };
        })
      )
    );
    const ox = prefab.offset?.[0] ?? prefab.x ?? 0;
    const oy = prefab.offset?.[1] ?? prefab.y ?? 0;
    sectionPrefab.appendChild(
      numInput("Offset X", ox, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          const prev = e.components!.prefab ?? {};
          const py = prev.offset?.[1] ?? prev.y ?? 0;
          e.components!.prefab = { ...prev, offset: [v, py] };
        })
      )
    );
    sectionPrefab.appendChild(
      numInput("Offset Y", oy, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          const prev = e.components!.prefab ?? {};
          const px = prev.offset?.[0] ?? prev.x ?? 0;
          e.components!.prefab = { ...prev, offset: [px, v] };
        })
      )
    );
  }
  host.appendChild(sectionPrefab);

  const t3 = c.transform3d ?? {
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number],
  };
  const section3d = document.createElement("div");
  section3d.className = "inspector-section";
  section3d.innerHTML = "<h4>Transform3D</h4>";
  section3d.appendChild(
    checkboxInput("Enabled", !!c.transform3d || !!c.mesh3d || !!c.camera3d || !!c.light3d, (on) => {
      store.updateSelected((e) => {
        ensureComponents(e);
        if (on) {
          e.components!.transform3d = {
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          };
        } else {
          delete e.components!.transform3d;
        }
      });
    })
  );
  if (c.transform3d || c.mesh3d || c.camera3d || c.light3d) {
    const axes: Array<{ label: string; vec: "position" | "rotation" | "scale"; i: number }> = [
      { label: "X", vec: "position", i: 0 },
      { label: "Y", vec: "position", i: 1 },
      { label: "Z", vec: "position", i: 2 },
      { label: "RX", vec: "rotation", i: 0 },
      { label: "RY", vec: "rotation", i: 1 },
      { label: "RZ", vec: "rotation", i: 2 },
      { label: "SX", vec: "scale", i: 0 },
      { label: "SY", vec: "scale", i: 1 },
      { label: "SZ", vec: "scale", i: 2 },
    ];
    for (const a of axes) {
      const defaults = a.vec === "scale" ? [1, 1, 1] : [0, 0, 0];
      const cur = (t3[a.vec] ?? defaults)[a.i] ?? defaults[a.i];
      section3d.appendChild(
        numInput(a.label, cur, (v) =>
          store.updateSelected((e) => {
            ensureComponents(e);
            const prev = e.components!.transform3d ?? {
              position: [0, 0, 0],
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
            };
            const vec = [...(prev[a.vec] ?? defaults)] as [number, number, number];
            vec[a.i] = v;
            e.components!.transform3d = { ...prev, [a.vec]: vec };
          })
        )
      );
    }
  }
  host.appendChild(section3d);

  const mesh = c.mesh3d;
  const sectionMesh = document.createElement("div");
  sectionMesh.className = "inspector-section";
  sectionMesh.innerHTML = "<h4>Mesh3D</h4>";
  sectionMesh.appendChild(
    checkboxInput("Enabled", !!mesh, (on) => {
      store.updateSelected((e) => {
        ensureComponents(e);
        if (on) {
          e.components!.mesh3d = {
            primitive: "box",
            size: [1, 1, 1],
            color: [0.85, 0.55, 0.3, 1],
          };
          if (!e.components!.transform3d) {
            e.components!.transform3d = {
              position: [0, 0, 0],
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
            };
          }
        } else delete e.components!.mesh3d;
      });
    })
  );
  if (mesh) {
    sectionMesh.appendChild(
      selectInput("Primitive", mesh.primitive === "gltf" ? "gltf" : "box", ["box", "gltf"], (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.mesh3d = {
            ...(e.components!.mesh3d ?? {}),
            primitive: v,
          };
        })
      )
    );
    if ((mesh.primitive ?? "box") === "box") {
      for (let i = 0; i < 3; i++) {
        const labels = ["Size X", "Size Y", "Size Z"];
        sectionMesh.appendChild(
          numInput(labels[i], mesh.size?.[i] ?? 1, (v) =>
            store.updateSelected((e) => {
              ensureComponents(e);
              const prev = e.components!.mesh3d ?? {};
              const size = [...(prev.size ?? [1, 1, 1])] as [number, number, number];
              size[i] = v;
              e.components!.mesh3d = { ...prev, size, primitive: "box" };
            })
          )
        );
      }
    } else {
      const gltfPaths = assetPaths.filter((p) => p.toLowerCase().endsWith(".gltf"));
      sectionMesh.appendChild(
        selectInput("glTF", mesh.gltf ?? "", [""].concat(gltfPaths), (v) =>
          store.updateSelected((e) => {
            ensureComponents(e);
            e.components!.mesh3d = {
              ...(e.components!.mesh3d ?? {}),
              gltf: v || undefined,
              primitive: "gltf",
            };
          })
        )
      );
    }
    for (let i = 0; i < 3; i++) {
      const labels = ["Color R", "Color G", "Color B"];
      sectionMesh.appendChild(
        numInput(labels[i], mesh.color?.[i] ?? 0.8, (v) =>
          store.updateSelected((e) => {
            ensureComponents(e);
            const prev = e.components!.mesh3d ?? {};
            const color = [...(prev.color ?? [0.8, 0.8, 0.85, 1])] as [
              number,
              number,
              number,
              number,
            ];
            color[i] = v;
            e.components!.mesh3d = { ...prev, color };
          })
        )
      );
    }
  }
  host.appendChild(sectionMesh);

  const light = c.light3d;
  const sectionLight = document.createElement("div");
  sectionLight.className = "inspector-section";
  sectionLight.innerHTML = "<h4>Light3D</h4>";
  sectionLight.appendChild(
    checkboxInput("Enabled", !!light, (on) => {
      store.updateSelected((e) => {
        ensureComponents(e);
        if (on) {
          e.components!.light3d = {
            type: "directional",
            direction: [0.35, -1, -0.45],
            position: [0, 2, 2],
            color: [1, 0.95, 0.85],
            range: 10,
          };
        } else delete e.components!.light3d;
      });
    })
  );
  if (light) {
    sectionLight.appendChild(
      selectInput("Type", light.type === "point" ? "point" : "directional", ["directional", "point"], (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.light3d = { ...(e.components!.light3d ?? {}), type: v };
        })
      )
    );
    if (light.type === "point") {
      for (let i = 0; i < 3; i++) {
        sectionLight.appendChild(
          numInput(["Pos X", "Pos Y", "Pos Z"][i], light.position?.[i] ?? 0, (v) =>
            store.updateSelected((e) => {
              ensureComponents(e);
              const prev = e.components!.light3d ?? {};
              const position = [...(prev.position ?? [0, 0, 0])] as [number, number, number];
              position[i] = v;
              e.components!.light3d = { ...prev, position };
            })
          )
        );
      }
      sectionLight.appendChild(
        numInput("Range", light.range ?? 10, (v) =>
          store.updateSelected((e) => {
            ensureComponents(e);
            e.components!.light3d = { ...(e.components!.light3d ?? {}), range: v };
          })
        )
      );
    } else {
      for (let i = 0; i < 3; i++) {
        sectionLight.appendChild(
          numInput(["Dir X", "Dir Y", "Dir Z"][i], light.direction?.[i] ?? 0, (v) =>
            store.updateSelected((e) => {
              ensureComponents(e);
              const prev = e.components!.light3d ?? {};
              const direction = [...(prev.direction ?? [0, -1, 0])] as [number, number, number];
              direction[i] = v;
              e.components!.light3d = { ...prev, direction };
            })
          )
        );
      }
    }
    for (let i = 0; i < 3; i++) {
      sectionLight.appendChild(
        numInput(["R", "G", "B"][i], light.color?.[i] ?? 1, (v) =>
          store.updateSelected((e) => {
            ensureComponents(e);
            const prev = e.components!.light3d ?? {};
            const color = [...(prev.color ?? [1, 1, 1])] as [number, number, number];
            color[i] = v;
            e.components!.light3d = { ...prev, color };
          })
        )
      );
    }
  }
  host.appendChild(sectionLight);

  const cam3 = c.camera3d;
  const sectionCam3 = document.createElement("div");
  sectionCam3.className = "inspector-section";
  sectionCam3.innerHTML = "<h4>Camera3D</h4>";
  sectionCam3.appendChild(
    checkboxInput("Enabled", !!cam3, (on) => {
      store.updateSelected((e) => {
        ensureComponents(e);
        if (on) {
          e.components!.camera3d = {
            active: true,
            fov: 60,
            aspect: 1.777,
            near: 0.1,
            far: 100,
            orbit_yaw: 0.4,
            orbit_pitch: 0.35,
            orbit_distance: 6,
            target: [0, 0, 0],
          };
        } else delete e.components!.camera3d;
      });
    })
  );
  if (cam3) {
    sectionCam3.appendChild(
      checkboxInput("Active", cam3.active !== false, (on) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.camera3d = { ...(e.components!.camera3d ?? {}), active: on };
        })
      )
    );
    sectionCam3.appendChild(
      numInput("FOV", cam3.fov ?? 60, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.camera3d = { ...(e.components!.camera3d ?? {}), fov: v };
        })
      )
    );
    sectionCam3.appendChild(
      numInput("Orbit yaw", cam3.orbit_yaw ?? 0.4, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.camera3d = { ...(e.components!.camera3d ?? {}), orbit_yaw: v };
        })
      )
    );
    sectionCam3.appendChild(
      numInput("Orbit pitch", cam3.orbit_pitch ?? 0.35, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.camera3d = { ...(e.components!.camera3d ?? {}), orbit_pitch: v };
        })
      )
    );
    sectionCam3.appendChild(
      numInput("Distance", cam3.orbit_distance ?? 6, (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.camera3d = { ...(e.components!.camera3d ?? {}), orbit_distance: v };
        })
      )
    );
  }
  host.appendChild(sectionCam3);

  const script = c.script ?? { module: "", handler: "on_update" };
  const sectionScript = document.createElement("div");
  sectionScript.className = "inspector-section";
  sectionScript.innerHTML = "<h4>Script</h4>";
  sectionScript.appendChild(
    checkboxInput("Enabled", !!c.script, (on) => {
      store.updateSelected((e) => {
        ensureComponents(e);
        if (on) e.components!.script = { module: "", handler: "on_update" };
        else delete e.components!.script;
      });
    })
  );
  if (c.script) {
    sectionScript.appendChild(
      textInput("Module", script.module ?? "", (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.script = { ...(e.components!.script ?? {}), module: v };
        })
      )
    );
    sectionScript.appendChild(
      textInput("Handler", script.handler ?? "on_update", (v) =>
        store.updateSelected((e) => {
          ensureComponents(e);
          e.components!.script = { ...(e.components!.script ?? {}), handler: v };
        })
      )
    );
  }
  host.appendChild(sectionScript);
}
