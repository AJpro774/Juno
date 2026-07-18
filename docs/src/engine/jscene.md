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
        "collider2d": { "type": "aabb", "w": 28, "h": 28, "solid": true, "slope": 0 },
        "camera2d": { "x": 0, "y": 0, "zoom": 1, "active": true, "follow_target": 0, "smooth": 0.12 },
        "script": { "module": "player", "handler": "on_update" },
        "prefab": { "path": "prefabs/coin.jscene", "offset": [0, 0] }
      }
    }
  ]
}
```

## Components (2D)

| Component | Fields |
|-----------|--------|
| `transform2d` | `x`, `y`, `rotation`, `scale`, `z_index` |
| `sprite` | `asset` / `tex`, `w`, `h`, `cols`, `rows`, `fps` |
| `rigidbody2d` | `vx`, `vy`, `ax`, `ay`, `gravity` |
| `collider2d` | `type` (`aabb`\|`circle`), `w`, `h`, `radius`, `solid`, `slope` (degrees) |
| `camera2d` | `x`, `y`, `zoom`, `active`, `follow_target`, `smooth` |
| `tilemap` | `tile_size`, `cols`, `rows`, `tiles`, `tileset` |
| `script` | `module`, `handler` — see [Entity scripts](scripts.md) |
| `prefab` | `path`, `offset` — spawn-point authoring; runtime spawn via `prefab_spawn` |
| `sprite_animator` | `default`, `autoplay`, `clips[]` — sprite / keyframe clips; see [Animation](animation.md) |

## Components (3D)

| Component | Fields |
|-----------|--------|
| `transform3d` | `position`, `rotation`, `scale` (each `[x,y,z]`) |
| `mesh3d` | `primitive` (`box`\|`gltf`), `size`, `gltf`, `color`, optional `mesh` handle |
| `rigidbody3d` | `vx`, `vy`, `vz`, `gravity` — see [Physics](../projects/physics.md) |
| `collider3d` | `type` (`aabb`), `w`, `h`, `d`, `solid` |
| `camera3d` | `active`, `fov`, `aspect`, `near`, `far`, `orbit_yaw`, `orbit_pitch`, `orbit_distance`, `target` |
| `light3d` | `type` (`directional`\|`point`), `direction`, `position`, `color`, `range` |

**Hybrid 2D-in-3D:** keep `rigidbody2d`/`collider2d`/`transform2d` for physics and add `transform3d`/`mesh3d` for drawing. `world_step` syncs `x,y` → `tx,ty` automatically (or call `transform3d_sync_from_2d`).

Play mode materializes GPU mesh/camera/light handles and draws with `world_draw3d(cam)` — see [3D](../graphics/3d.md).

## Loading

- From Juni: `scene_load("scenes/level1.jscene")`
- From the IDE Play mode: the open scene is injected as `initialScene` before `main()`
- Asset packs include `*.jscene` files (embedded as text)

## `juni.toml`

```toml
[scene]
default = "scenes/level1.jscene"
```
