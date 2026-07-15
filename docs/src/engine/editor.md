# Visual editor

The Juni IDE includes an engine editor shell:

- **Hierarchy** — create / delete / select entities
- **Inspector** — edit name, tag, Transform2D, Sprite, RigidBody2D, Script
- **Asset browser** — drag images onto the scene view to spawn sprites
- **Scene view** — grid viewport; drag entities to move them (one undo step per drag)
- **Edit / Play** — Edit mutates `.jscene`; Play snapshots the scene, compiles WASM, and runs `frame`. **Edit** restores the pre-play snapshot.
- **Undo / Redo** — toolbar or ⌘Z / ⌘⇧Z in edit mode (when focus is not in Monaco)

## Workflow

1. Open a `juni.toml` project (Chrome: prefer a writable folder; Desktop: Tauri project root)
2. Edit the scene in Hierarchy / Inspector / Scene view
3. Click **Save Scene** — writes to disk when a writable root is available, otherwise downloads the `.jscene`
4. Press **Play** (or **Run**) to execute Juni against the scene
5. Optional: enable **Hot reload** to recompile on ⌘S while playing
6. **Export Web** downloads a static `index.html` + WASM payload for hosting

A ● indicator appears beside Save Scene when the scene has unsaved edits.

Script binding fields are stored on entities; game logic typically lives in the entry `frame` using `entity_find_by_tag`.

## Optional local AI

The toolbar **AI** panel can enable an optional in-browser model (WebLLM / Qwen2.5-Coder-1.5B):

- Chat about Juni / engine APIs
- **Suggest fix (local AI)** on a selection (Apply/Dismiss confirm)
- **Explain with AI** after compile errors
- **Insert into editor** / replace selection from chat replies (strips markdown fences)

AI is **off by default** and never downloads weights until you click Enable. See [AI assistant](../projects/ai-assistant.md).
