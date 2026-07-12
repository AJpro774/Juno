# Assets

Juni v5 introduces a project-level **asset manifest** driven by `juni.toml` `[assets]` sections and an `assets/` directory.

## Layout

```
project/
  assets/
    sprites/hero.png
    audio/beep.wav
    meshes/ship.obj
  assets.pack.json   # generated at build time
```

## Manifest (planned fields)

```toml
[assets]
root = "assets"

[assets.sprites]
hero = "sprites/hero.png"

[assets.audio]
beep = "audio/beep.wav"

[assets.meshes]
ship = "meshes/ship.obj"
```

`juni build` scans configured paths and writes `assets.pack.json` beside the output WASM.

## Runtime APIs

| API | Purpose |
|-----|---------|
| `asset_load_str(path)` | Load a text asset (JSON, shader source) |
| `sprite_draw(id, x, y, w, h)` | Draw a packed sprite region |
| `mesh_load_obj(path)` | Load a Wavefront OBJ mesh handle |

Browser runtime resolves packed assets from the project manifest; Node stubs return safe defaults.

## Example

See `examples/projects/canvas_sprite` for a multi-module sprite demo using Canvas2D rectangles today; swap in `sprite_draw` when image assets are wired.
