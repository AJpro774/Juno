# Visual editor

The Juni IDE includes an engine editor shell:

- **Hierarchy** — create / delete / select entities (badges for mesh / light / cam3d / sprite)
- **Inspector** — name, tag, Transform2D/3D, Sprite (incl. sheet cols/rows/fps), Mesh3D, Light3D, Camera3D, RigidBody2D, Collider2D, Camera2D, Tilemap, Prefab, Script
- **Asset browser** — drag images onto the scene view to spawn sprites
- **Scene view** — grid viewport; drag sprites to move them; **tilemap paint** (click = brush, Alt/right-click = erase, ⌘/Ctrl-drag = move); one undo step per gesture
- **Edit / Play** — Edit mutates `.jscene`; Play snapshots the scene, compiles WASM, and runs `frame`. Scenes with 3D components auto-switch to WebGPU and materialize meshes for `world_draw3d`. **Edit** restores the pre-play snapshot.
- **Undo / Redo** — toolbar or ⌘Z / ⌘⇧Z in edit mode (when focus is not in Monaco)

## Workflow

1. Open a `juni.toml` project (Chrome: prefer a writable folder; Desktop: Tauri project root)
2. Edit the scene in Hierarchy / Inspector / Scene view
3. Click **Save Scene** — writes to disk when a writable root is available, otherwise downloads the `.jscene`
4. Press **Play** (or **Run**) to execute Juni against the scene
5. Optional: enable **Hot reload** to recompile on ⌘S while playing
6. **Export Web** downloads a self-contained `*-web.zip` (HTML + WASM + `runtime/`) for itch / Netlify

A ● indicator appears beside Save Scene when the scene has unsaved edits.

Collider / camera / tilemap / prefab / script fields round-trip through Save Scene. Tilemap **tiles** arrays painted in the scene view are included. Entity **Script** bindings are dispatched each `world_step` — prefer entry-module `export fn {module}_{handler}` (WASM) so Inspector module/handler invokes Juni; see [Entity scripts](scripts.md). Game input often still lives in entry `frame` with `entity_find_by_tag`.

## Optional local AI

The toolbar **AI** panel can enable an optional in-browser model (WebLLM / Qwen2.5-Coder-1.5B):

- Chat about Juni / engine APIs
- **Suggest fix (local AI)** on a selection (Apply/Dismiss confirm)
- **Explain with AI** after compile errors
- **Insert into editor** / replace selection from chat replies (strips markdown fences)

AI is **off by default** and never downloads weights until you click Enable. See [AI assistant](../projects/ai-assistant.md).
