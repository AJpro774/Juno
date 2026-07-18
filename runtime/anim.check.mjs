/**
 * Focused verification for SpriteAnimator clips + anim_play / anim_stop.
 * Run: node runtime/anim.check.mjs
 */
import {
  createWorld,
  entityCreate,
  worldStep,
  resetWorld,
  animPlay,
  animStop,
} from "./dist/world.js";
import { loadSceneIntoWorld, serializeWorld, parseAnimClipJson } from "./dist/scene-loader.js";

function fail(msg, detail) {
  console.error("FAIL:", msg, detail ?? "");
  process.exit(1);
}

function assert(cond, msg, detail) {
  if (!cond) fail(msg, detail);
}

// --- Clip JSON parse ---
{
  const clip = parseAnimClipJson(
    JSON.stringify({
      name: "walk",
      fps: 8,
      loop: true,
      frames: [0, 1, 2, 3],
    }),
  );
  assert(clip && clip.name === "walk" && clip.frames?.length === 4, "parseAnimClipJson frames");
}

// --- Sprite frame clip playback ---
resetWorld();
{
  const world = createWorld();
  const id = entityCreate(world);
  const e = world.entities.get(id);
  e.sprite = {
    tex: 0,
    w: 32,
    h: 32,
    frame: 0,
    cols: 4,
    rows: 1,
    fps: 0,
    loop: true,
    animTime: 0,
  };
  e.spriteAnimator = {
    clips: [{ name: "walk", fps: 8, loop: true, frames: [0, 1, 2, 3] }],
    defaultClip: "walk",
    autoplay: false,
    playing: "",
    time: 0,
  };

  assert(animPlay(id, "walk", world) === 1, "anim_play ok");
  assert(e.spriteAnimator.playing === "walk", "playing walk");
  assert(e.sprite.frame === 0, "frame at t=0", e.sprite.frame);

  // world_step clamps dt to 0.05; 3 steps → 0.15s at 8fps → floor(1.2) = 1
  worldStep(1 / 60, world);
  worldStep(1 / 60, world);
  worldStep(0.05, world);
  worldStep(0.05, world);
  worldStep(0.05, world);
  assert(e.sprite.frame === 1, "frame after ~0.15s", e.sprite.frame);

  animStop(id, world);
  assert(e.spriteAnimator.playing === "", "stopped");
}

// --- Transform keyframe clip ---
resetWorld();
{
  const world = createWorld();
  const id = entityCreate(world);
  const e = world.entities.get(id);
  e.transform2d = { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, zIndex: 0 };
  e.spriteAnimator = {
    clips: [
      {
        name: "bob",
        fps: 0,
        loop: true,
        keys: [
          { t: 0, y: 0 },
          { t: 0.5, y: -8 },
          { t: 1, y: 0 },
        ],
      },
    ],
    defaultClip: "bob",
    autoplay: false,
    playing: "",
    time: 0,
  };
  animPlay(id, "bob", world);
  // Hold key at t=0.5 requires cumulative time ≥ 0.5
  for (let i = 0; i < 11; i++) worldStep(0.05, world);
  assert(e.transform2d.y === -8, "key y at 0.5", e.transform2d.y);
}

// --- Scene round-trip ---
resetWorld();
{
  const scene = {
    version: 1,
    entities: [
      {
        id: 1,
        name: "Hero",
        components: {
          sprite: { w: 32, h: 32, cols: 4, rows: 1 },
          sprite_animator: {
            default: "idle",
            autoplay: true,
            clips: [{ name: "idle", fps: 1, loop: true, frames: [0] }],
          },
        },
      },
    ],
  };
  const world = loadSceneIntoWorld(scene, { reset: true });
  const e = world.entities.get(1);
  assert(e?.spriteAnimator?.clips.length === 1, "loaded animator");
  assert(e.spriteAnimator.playing === "idle", "autoplay idle");
  const out = serializeWorld(world);
  assert(out.entities[0].components.sprite_animator?.clips?.[0]?.name === "idle", "serialize");
}

console.log("anim.check.mjs: ok");
