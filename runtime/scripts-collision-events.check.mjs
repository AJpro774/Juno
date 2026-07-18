/**
 * Focused verification for collision / trigger script events.
 * Run: node runtime/scripts-collision-events.check.mjs
 */
import {
  createWorld,
  entityCreate,
  worldStep,
  resetWorld,
  getWorld,
} from "./dist/world.js";
import {
  registerScriptHandler,
  clearScriptHandlers,
  resetScriptHost,
} from "./dist/scripts.js";
import {
  installPhysicsHooks,
  collisionCount,
  collisionIsTrigger,
} from "./dist/physics.js";

function setupEntity(id, x, y, opts = {}) {
  const e = getWorld().entities.get(id);
  e.transform2d = { x, y, rotation: 0, sx: 1, sy: 1, zIndex: 0 };
  e.collider2d = {
    kind: "aabb",
    w: opts.w ?? 10,
    h: opts.h ?? 10,
    radius: 0,
    solid: opts.solid ?? true,
    slope: 0,
  };
  if (opts.body) {
    e.rigidbody2d = { vx: 0, vy: 0, ax: 0, ay: 0, gravity: 0, grounded: false };
  }
  if (opts.module) {
    e.script = { module: opts.module, handler: "on_update" };
  }
}

installPhysicsHooks();
resetWorld();
resetScriptHost();
clearScriptHandlers();

const world = createWorld();
world.gravity = 0;

const a = entityCreate(world);
const b = entityCreate(world);
setupEntity(a, 0, 0, { body: true, module: "player", solid: true });
setupEntity(b, 8, 0, { module: "wall", solid: true });

const collisions = [];
const triggers = [];
registerScriptHandler("player", "on_collision", (entityId, otherId) => {
  collisions.push(["player", entityId, otherId]);
});
registerScriptHandler("wall", "on_collision", (entityId, otherId) => {
  collisions.push(["wall", entityId, otherId]);
});
registerScriptHandler("player", "on_trigger_enter", (entityId, otherId) => {
  triggers.push(["player", entityId, otherId]);
});

let framesWithSolid = 0;
for (let f = 0; f < 3; f++) {
  collisions.length = 0;
  getWorld().entities.get(a).rigidbody2d.vx = 120;
  worldStep(1 / 60, world);
  if (collisions.length >= 2) framesWithSolid++;
}
if (framesWithSolid !== 3) {
  console.error("FAIL: on_collision should fire each solid-contact frame", {
    framesWithSolid,
  });
  process.exit(1);
}
if (triggers.length !== 0) {
  console.error("FAIL: solid contact should not fire trigger enter", triggers);
  process.exit(1);
}

resetWorld();
resetScriptHost();
clearScriptHandlers();
const world2 = createWorld();
world2.gravity = 0;
const p = entityCreate(world2);
const c = entityCreate(world2);
setupEntity(p, 0, 0, { body: true, module: "player", solid: true });
setupEntity(c, 5, 0, { module: "coin", solid: false });

const collisions2 = [];
const triggers2 = [];
registerScriptHandler("player", "on_collision", (entityId, otherId) => {
  collisions2.push([entityId, otherId]);
});
registerScriptHandler("player", "on_trigger_enter", (entityId, otherId) => {
  triggers2.push(["player", entityId, otherId]);
});
registerScriptHandler("coin", "on_trigger_enter", (entityId, otherId) => {
  triggers2.push(["coin", entityId, otherId]);
});

worldStep(1 / 60, world2);
const n = collisionCount();
let anyTrigger = false;
for (let i = 0; i < n; i++) {
  if (collisionIsTrigger(i)) anyTrigger = true;
}
if (!anyTrigger) {
  console.error("FAIL: expected trigger contact");
  process.exit(1);
}
if (collisions2.length !== 0) {
  console.error("FAIL: trigger should not fire on_collision", collisions2);
  process.exit(1);
}
if (triggers2.length < 2) {
  console.error("FAIL: expected on_trigger_enter both sides", triggers2);
  process.exit(1);
}

triggers2.length = 0;
worldStep(1 / 60, world2);
if (triggers2.length !== 0) {
  console.error("FAIL: on_trigger_enter should be once only", triggers2);
  process.exit(1);
}

console.log("OK collision-events", { framesWithSolid, contacts: n });
