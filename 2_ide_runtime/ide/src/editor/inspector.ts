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
        e.components = e.components ?? {};
        e.components.transform2d = { ...(e.components.transform2d ?? {}), x: v };
      })
    )
  );
  section2d.appendChild(
    numInput("Y", t2.y ?? 0, (v) =>
      store.updateSelected((e) => {
        e.components = e.components ?? {};
        e.components.transform2d = { ...(e.components.transform2d ?? {}), y: v };
      })
    )
  );
  section2d.appendChild(
    numInput("Rotation", t2.rotation ?? 0, (v) =>
      store.updateSelected((e) => {
        e.components = e.components ?? {};
        e.components.transform2d = { ...(e.components.transform2d ?? {}), rotation: v };
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
        e.components = e.components ?? {};
        e.components.sprite = { ...(e.components.sprite ?? {}), asset: v || undefined };
      })
    )
  );
  sectionSprite.appendChild(
    numInput("W", sprite.w ?? 32, (v) =>
      store.updateSelected((e) => {
        e.components = e.components ?? {};
        e.components.sprite = { ...(e.components.sprite ?? {}), w: v };
      })
    )
  );
  sectionSprite.appendChild(
    numInput("H", sprite.h ?? 32, (v) =>
      store.updateSelected((e) => {
        e.components = e.components ?? {};
        e.components.sprite = { ...(e.components.sprite ?? {}), h: v };
      })
    )
  );
  host.appendChild(sectionSprite);

  const body = c.rigidbody2d;
  const sectionBody = document.createElement("div");
  sectionBody.className = "inspector-section";
  sectionBody.innerHTML = "<h4>RigidBody2D</h4>";
  const hasBody = document.createElement("label");
  hasBody.className = "inspector-field";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = !!body;
  cb.addEventListener("change", () => {
    store.updateSelected((e) => {
      e.components = e.components ?? {};
      if (cb.checked) e.components.rigidbody2d = { vx: 0, vy: 0, gravity: 900 };
      else delete e.components.rigidbody2d;
    });
  });
  hasBody.append("Enabled", cb);
  sectionBody.appendChild(hasBody);
  host.appendChild(sectionBody);

  const script = c.script ?? { module: "", handler: "on_update" };
  const sectionScript = document.createElement("div");
  sectionScript.className = "inspector-section";
  sectionScript.innerHTML = "<h4>Script</h4>";
  sectionScript.appendChild(
    textInput("Module", script.module ?? "", (v) =>
      store.updateSelected((e) => {
        e.components = e.components ?? {};
        e.components.script = { ...(e.components.script ?? {}), module: v };
      })
    )
  );
  sectionScript.appendChild(
    textInput("Handler", script.handler ?? "on_update", (v) =>
      store.updateSelected((e) => {
        e.components = e.components ?? {};
        e.components.script = { ...(e.components.script ?? {}), handler: v };
      })
    )
  );
  host.appendChild(sectionScript);
}
