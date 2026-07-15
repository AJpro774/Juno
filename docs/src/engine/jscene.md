# `.jscene` scene files

Scenes are JSON documents (usually under `scenes/`) that describe entities and components.

## Schema

```json
{
  "version": 1,
  "gravity": 900,
  "entities": [
    {
      "id": 1,
      "name": "Player",
      "tag": "player",
      "components": {
        "transform2d": { "x": 100, "y": 200, "rotation": 0, "scale": [1, 1], "z_index": 0 },
        "sprite": { "asset": "sprites/player.png", "w": 32, "h": 32 },
        "rigidbody2d": { "vx": 0, "vy": 0, "gravity": 1200 },
        "collider2d": { "type": "aabb", "w": 28, "h": 28, "solid": true },
        "camera2d": { "x": 0, "y": 0, "zoom": 1, "active": true },
        "script": { "module": "player", "handler": "on_update" }
      }
    }
  ]
}
```

## Loading

- From Juni: `scene_load("scenes/level1.jscene")`
- From the IDE Play mode: the open scene is injected as `initialScene` before `main()`
- Asset packs include `*.jscene` files (embedded as text)

## `juni.toml`

```toml
[scene]
default = "scenes/level1.jscene"
```
