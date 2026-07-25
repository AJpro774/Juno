# Build a 2D platformer

Walk through a small Juni platformer: scene, player, movement, gravity, camera, and a goal. The finished shape matches [`examples/projects/platformer`](../../examples/projects/platformer).

Open the [Juni IDE](https://junoengine.netlify.app/) (Chrome works best) or follow along in the desktop app.

Related: [Making a level](../engine/level.md), [`.jscene` scenes](../engine/jscene.md), [Entity scripts](../engine/scripts.md), [Visual editor](../engine/editor.md), [Physics](../projects/physics.md). For screenshot lessons in the IDE, see [Visual tutorials](../projects/tutorials.md).

## What you will build

- A `.jscene` with camera, ground, player, platform, and goal
- `main` that loads the scene, wires tags, and sets a sprite
- `frame` that reads input, applies velocity, steps physics, and draws
- Optional: coin pickup via `on_trigger_enter`, a moving hazard, Space to restart

## 1. Open or create a project

**Fastest path:** clone or download the repo and **Open Project** on `examples/projects/platformer` (folder with `juni.toml`).

**From scratch:** create a folder with:

```toml
[project]
name = "platformer"
version = "0.1.0"
entry = "src/main.juni"

[scene]
default = "scenes/level1.jscene"

[assets]
root = "assets"
include = ["**/*.png", "**/*.jscene", "**/*.json"]
```

Add `src/main.juni`, `scenes/level1.jscene`, and put sprites under `assets/sprites/` (for example `player.png`). In the IDE, **Open Project** on that folder. Files appear in the Project pane; the default scene loads into Edit mode.

See [juni.toml](../projects/juni-toml.md) and [Assets](../projects/assets.md).

## 2. Author the scene and player

Stay in **Edit**. Use Hierarchy to create entities and Inspector to set tags and components. Or write `scenes/level1.jscene` directly:

```json
{
  "version": 1,
  "gravity": 1200,
  "entities": [
    {
      "id": 1,
      "name": "Camera",
      "tag": "camera",
      "components": {
        "camera2d": { "x": 160, "y": 100, "zoom": 1, "active": true }
      }
    },
    {
      "id": 2,
      "name": "Ground",
      "tag": "ground",
      "components": {
        "transform2d": { "x": 160, "y": 220, "scale": [1, 1], "z_index": 0 },
        "collider2d": { "type": "aabb", "w": 400, "h": 40, "solid": true }
      }
    },
    {
      "id": 3,
      "name": "Player",
      "tag": "player",
      "components": {
        "transform2d": { "x": 80, "y": 160, "scale": [1, 1], "z_index": 10 },
        "sprite": { "asset": "sprites/player.png", "w": 32, "h": 32 },
        "rigidbody2d": { "vx": 0, "vy": 0, "gravity": 1200 },
        "collider2d": { "type": "aabb", "w": 28, "h": 28, "solid": true }
      }
    },
    {
      "id": 4,
      "name": "Platform",
      "tag": "plat1",
      "components": {
        "transform2d": { "x": 260, "y": 140, "scale": [1, 1], "z_index": 1 },
        "collider2d": { "type": "aabb", "w": 80, "h": 16, "solid": true }
      }
    },
    {
      "id": 5,
      "name": "Goal",
      "tag": "goal",
      "components": {
        "transform2d": { "x": 300, "y": 100, "scale": [1, 1], "z_index": 2 },
        "collider2d": { "type": "aabb", "w": 24, "h": 24, "solid": false }
      }
    }
  ]
}
```

Notes:

- **Tags** (`player`, `camera`, `goal`) are how `main` finds entities with `entity_find_by_tag`.
- Ground and platforms need **solid** `collider2d` AABBs so the player stands on them.
- The goal uses `solid: false` — a **trigger** (overlap only, no resolution).
- Scene `gravity` and `rigidbody2d.gravity` both use `1200` in the sample.

Click **Save Scene** after inspector edits. Enable **Show colliders** in Edit to verify shapes.

## 3. Sprite and visuals

The scene can already reference `sprites/player.png`. In code you can also set or refresh the sprite after load:

```juni
let tex = asset_load_str("sprites/player.png")
sprite_set(player, tex, 32.0, 32.0)
```

Paths are relative to the project `[assets] root` (usually `assets/`). Dragging an image from the Asset browser onto the scene view also spawns a sprite entity — then tag it and add rigidbody/collider as needed.

Platforms in the sample are invisible collider boxes; add sprites the same way if you want visible tiles. For painted tilemaps, use the Tilemap inspector + scene paint (see the **Scripts and tile paint** lesson under [Visual tutorials](../projects/tutorials.md)).

## 4. Movement and jump (input)

Entry `frame` owns game input. Key codes: `0` left, `1` right, `2` up, `4`/`5` A/D, `6` W, `8` Space (see [Control flow](../language/control-flow.md)).

```juni
fn frame(dt: f32) -> i32:
    let move = 0.0
    if key_down(0) == 1 or key_down(4) == 1:
        move = move - 1.0
    if key_down(1) == 1 or key_down(5) == 1:
        move = move + 1.0
    let stick = gamepad_axis(0, 0)
    if abs(stick) > 0.2:
        move = stick

    let vx = move * 180.0
    let grounded = rigidbody2d_get_grounded(player)
    if grounded == 1:
        if key_down(2) == 1 or key_down(8) == 1 or key_down(6) == 1:
            rigidbody2d_set_vel(player, vx, -420.0)
        else:
            rigidbody2d_set_vel(player, vx, 0.0)
    else:
        # 1e6 sentinel keeps current vy (see rigidbody2d_set_vel)
        rigidbody2d_set_vel(player, vx, 1000000.0)

    world_step(dt)
    world_draw(cam)
    return 0
```

- Jump only when `rigidbody2d_get_grounded(player) == 1`.
- In air, pass `1000000.0` (`1e6`) as `vy` so horizontal speed updates without wiping gravity’s vertical velocity.
- Call `world_step` before draw so physics and grounded state match this frame.

## 5. Gravity and platform collision

You do **not** write your own AABB resolver for the player. The host 2D solver inside `world_step`:

1. Integrates `rigidbody2d` with gravity
2. Resolves solid `collider2d` contacts
3. Updates grounded state for jump checks
4. Dispatches entity scripts / trigger events

Requirements that must be true:

| Piece | Role |
|-------|------|
| Player `rigidbody2d` | Moves under gravity |
| Player solid `collider2d` | Collides with platforms |
| Ground / platforms solid `collider2d` | Standing surfaces |
| `world_step(dt)` each frame | Runs the solver |

Static platforms typically have a collider (and transform) but **no** rigidbody. Non-solid colliders are triggers — useful for goals and pickups, not floors.

## 6. Camera, goal, and restart

### Bootstrap in `main`

```juni
state:
    player: i32 = 0
    cam: i32 = 0
    goal: i32 = 0
    won: i32 = 0
    dead: i32 = 0
    spawn_x: f32 = 80.0
    spawn_y: f32 = 160.0

fn main() -> i32:
    canvas_init(640, 360)
    world_create()
    let loaded = scene_load("scenes/level1.jscene")
    player = entity_find_by_tag("player")
    cam = entity_find_by_tag("camera")
    goal = entity_find_by_tag("goal")
    if player == 0:
        player = entity_create()
        entity_set_tag(player, "player")
        collider2d_set(player, 0, 28.0, 28.0, 14.0, 1)
    if cam == 0:
        cam = entity_create()
        entity_set_tag(cam, "camera")
        camera2d_set(cam, 160.0, 100.0, 1.0)
    camera2d_follow(cam, player, 0.12)
    let tex = asset_load_str("sprites/player.png")
    sprite_set(player, tex, 32.0, 32.0)
    let _ignore = loaded
    return 0
```

`camera2d_follow` lerps the camera toward the player each `world_step`. Always `world_draw(cam)` with that camera entity.

### Win condition (poll contacts)

After `world_step`, walk the collision buffer:

```juni
    let n = collision_count()
    let i = 0
    while i < n:
        let a = collision_entity_a(i)
        let b = collision_entity_b(i)
        if (a == player and b == goal) or (b == player and a == goal):
            won = 1
            print("goal!")
        i = i + 1
```

When `won == 1` (or `dead == 1`), freeze gameplay and restart on Space (`key_down(8)`): reset flags, clear velocity, and `transform2d_set` the player back to `spawn_x` / `spawn_y`.

### Optional: coin + hazard

The sample also:

- Spawns `prefabs/coin.jscene` with `prefab_spawn` (trigger collider + `script` module `coin`)
- Collects with `export fn coin_on_trigger_enter(...)` — destroys the coin on first overlap with the player
- Moves a hazard in `export fn hazard_on_update(...)` and polls player↔hazard contacts for death

That path is documented in [Entity scripts](../engine/scripts.md) and [Making a level](../engine/level.md).

## 7. Run and playtest

1. **Save Scene** and save `src/main.juni`
2. Press **Play** (or **Run**) — IDE compiles to WASM and runs `main` / `frame`
3. Move with arrows or A/D; jump with Up, W, or Space; reach the goal trigger
4. Optional: **Hot reload** recompiles on save while playing
5. Toggle **Show colliders** in Edit if something falls through or never jumps
6. When ready, **Export Web** for a static zip — see [Export for web](../projects/export-web.md)

### Checklist if it feels broken

- Player has both `rigidbody2d` and a **solid** collider
- Platforms are solid; goal is **not** solid if you want a trigger win
- Tags match what `entity_find_by_tag` expects
- `world_step` runs before you read `collision_*` or grounded
- Asset path matches `assets/` (and `juni.toml` includes `**/*.png`)

## Full reference project

Compare your files to:

| Path | Role |
|------|------|
| `examples/projects/platformer/juni.toml` | Entry + default scene |
| `scenes/level1.jscene` | Camera, ground, player, platform, goal, hazard |
| `prefabs/coin.jscene` | Trigger coin fragment |
| `src/main.juni` | Load, input, physics step, win/death, scripts |

Next: tilemap paint, more entity scripts, or the 3D slice in `examples/projects/platformer_3d`.
