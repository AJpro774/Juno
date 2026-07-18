# Animation

Juni’s first animation slice is **sprite-sheet frames** and **discrete keyframe clips** — not skeletal / glTF skinning.

## Authoring (IDE)

1. Open the **Anim** toolbar panel (separate from Code Search).
2. Name a clip, set FPS + sheet frame indices (e.g. `0, 1, 2, 3`), optionally paste discrete keys JSON.
3. **Save clip JSON** writes `assets/anims/<name>.json`.
4. Select an entity → **Attach to entity** (or enable **SpriteAnimator** in the Inspector).
5. **Save Scene** so `.jscene` keeps the `sprite_animator` component.

### Clip JSON

```json
{
  "version": 1,
  "name": "walk",
  "fps": 8,
  "loop": true,
  "frames": [0, 1, 2, 3]
}
```

Optional discrete keys (hold until the next `t`):

```json
{
  "version": 1,
  "name": "bob",
  "loop": true,
  "keys": [
    { "t": 0, "y": 0 },
    { "t": 0.5, "y": -8 },
    { "t": 1.0, "y": 0 }
  ]
}
```

Keys may also set `frame`, 2D `x` / `rotation`, or simple 3D `tx`/`ty`/`tz`/`rx`/`ry`/`rz`.

## `.jscene` component

```json
"sprite_animator": {
  "default": "walk",
  "autoplay": true,
  "clips": [
    {
      "name": "walk",
      "fps": 8,
      "loop": true,
      "frames": [0, 1, 2, 3],
      "asset": "anims/walk.json"
    }
  ]
}
```

Inline `frames` / `keys` are enough for Play; `asset` is resolved when the host can load text assets.

## Runtime

| Call | Notes |
|------|--------|
| `anim_play(id, "walk")` | Start clip; returns `1` on success |
| `anim_stop(id)` | Stop the current clip |

`world_step` advances the playing clip (sprite frame and/or transform keys). While a SpriteAnimator clip is playing, the legacy Sprite `fps` sheet tick is skipped for that entity.

```juni
fn on_update(entity_id: i32, dt: f32) -> i32:
    if key_down(39):
        anim_play(entity_id, "walk")
    if key_down(40):
        anim_stop(entity_id)
    return 0
```

Legacy Sprite `cols` / `rows` / `fps` still works when no clip is playing — see [Assets](../projects/assets.md).
