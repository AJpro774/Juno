# juni.toml projects

A Juni **project** is a directory with `juni.toml`, a `src/` tree of `.juni` modules, and optional `assets/`.

## Minimal manifest

```toml
[project]
name = "hello_modules"
version = "0.1.0"
entry = "src/main.juni"
```

| Field | Meaning |
|-------|---------|
| `name` | Project / output WASM base name |
| `version` | Semantic version string |
| `entry` | Path to the entry module (must define `main`) |

## Module overrides (optional)

```toml
[modules]
math = "src/lib/math.juni"
```

Maps a logical module name to a specific path when the default `src/<name>.juni` layout does not apply.

## CLI

From the project root (or with `--project`):

```bash
juni check
juni build
juni build -o dist/game.wasm
```

Without a file argument, the CLI loads `juni.toml` in the current directory.

## IDE

The browser IDE can open a project folder (File System Access API) or a zip archive. Multi-tab editing compiles the full module graph through `compile_project`.

## Layout convention

```
my_game/
  juni.toml
  src/
    main.juni
    player.juni
    physics.juni
  assets/
    sprites/
    audio/
```

See [assets](assets.md) for the asset manifest pipeline.
