/**
 * Focused verification for 3D AABB physics, hybrid 2D→3D sync, and on_trigger_exit.
 * Run: node runtime/physics3d.check.mjs
 */
import {
  createWorld,
  entityCreate,
  worldStep,
  resetWorld,
  getWorld,
  transform3dSyncFrom2d,
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
  syncHybrid2dTo3d,
} from "./dist/physics.js";

function fail(msg, detail) {
  console.error("FAIL:", msg, detail ?? "");
  process.exit(1);
}

installPhysicsHooks();

// --- 3D solid land + grounded ---
resetWorld();
resetScriptHost();
clearScriptHandlers();
{
  const world = createWorld();
  world.gravity = 900;
  const player = entityCreate(world);
  const floor = entityCreate(world);
  const pe = getWorld().entities.get(player);
  const fe = getWorld().entities.get(floor);
  pe.transform3d = { tx: 0, ty: 2, tz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
  pe.rigidbody3d = { vx: 0, vy: 0, vz: 0, gravity: 900, grounded: false };
  pe.collider3d = { kind: "aabb", w: 1, h: 1, d: 1, solid: true };
  fe.transform3d = { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
  fe.collider3d = { kind: "aabb", w: 10, h: 1, d: 10, solid: true };

  let grounded = false;
  for (let i = 0; i < 120; i++) {
    worldStep(1 / 60, world);
    if (pe.rigidbody3d.grounded) {
      grounded = true;
      break;
    }
  }
  if (!grounded) fail("3D player should land and ground", { ty: pe.transform3d.ty });
  if (pe.transform3d.ty < 0.4 || pe.transform3d.ty > 1.2) {
    fail("3D player rest height unexpected", { ty: pe.transform3d.ty });
  }
}

// --- Hybrid sync ---
resetWorld();
{
  const world = createWorld();
  const id = entityCreate(world);
  const e = getWorld().entities.get(id);
  e.transform2d = { x: 12, y: -4, rotation: 0, sx: 1, sy: 1, zIndex: 0 };
  e.mesh3d = { meshHandle: 1 };
  e.transform3d = { tx: 0, ty: 0, tz: 3, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
  e.rigidbody2d = { vx: 0, vy: 0, ax: 0, ay: 0, gravity: 0, grounded: false };
  syncHybrid2dTo3d(world);
  if (e.transform3d.tx !== 12 || e.transform3d.ty !== -4 || e.transform3d.tz !== 3) {
    fail("hybrid sync should map x,y and keep tz", e.transform3d);
  }
  e.transform2d.x = 99;
  e.transform2d.y = 7;
  transform3dSyncFrom2d(id);
  if (e.transform3d.tx !== 99 || e.transform3d.ty !== 7 || e.transform3d.tz !== 3) {
    fail("transform3d_sync_from_2d", e.transform3d);
  }
}

// --- Shared buffer: 2D contact still works when 3D entities exist ---
resetWorld();
resetScriptHost();
clearScriptHandlers();
{
  const world = createWorld();
  world.gravity = 0;
  const a = entityCreate(world);
  const b = entityCreate(world);
  const unused3d = entityCreate(world);
  const ae = getWorld().entities.get(a);
  const be = getWorld().entities.get(b);
  const ue = getWorld().entities.get(unused3d);
  ae.transform2d = { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, zIndex: 0 };
  ae.collider2d = { kind: "aabb", w: 10, h: 10, radius: 0, solid: true, slope: 0 };
  ae.rigidbody2d = { vx: 80, vy: 0, ax: 0, ay: 0, gravity: 0, grounded: false };
  be.transform2d = { x: 8, y: 0, rotation: 0, sx: 1, sy: 1, zIndex: 0 };
  be.collider2d = { kind: "aabb", w: 10, h: 10, radius: 0, solid: true, slope: 0 };
  ue.transform3d = { tx: 100, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
  ue.collider3d = { kind: "aabb", w: 1, h: 1, d: 1, solid: true };

  worldStep(1 / 60, world);
  if (collisionCount() < 1) fail("2D solid contact missing with 3D entities present");
}

// --- on_trigger_exit (2D) ---
resetWorld();
resetScriptHost();
clearScriptHandlers();
{
  const world = createWorld();
  world.gravity = 0;
  const p = entityCreate(world);
  const c = entityCreate(world);
  const pe = getWorld().entities.get(p);
  const ce = getWorld().entities.get(c);
  pe.transform2d = { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, zIndex: 0 };
  pe.collider2d = { kind: "aabb", w: 10, h: 10, radius: 0, solid: true, slope: 0 };
  pe.rigidbody2d = { vx: 0, vy: 0, ax: 0, ay: 0, gravity: 0, grounded: false };
  pe.script = { module: "player", handler: "on_update" };
  ce.transform2d = { x: 5, y: 0, rotation: 0, sx: 1, sy: 1, zIndex: 0 };
  ce.collider2d = { kind: "aabb", w: 10, h: 10, radius: 0, solid: false, slope: 0 };
  ce.script = { module: "coin", handler: "on_update" };

  const enters = [];
  const exits = [];
  registerScriptHandler("player", "on_trigger_enter", (a, b) => enters.push(["p", a, b]));
  registerScriptHandler("coin", "on_trigger_enter", (a, b) => enters.push(["c", a, b]));
  registerScriptHandler("player", "on_trigger_exit", (a, b) => exits.push(["p", a, b]));
  registerScriptHandler("coin", "on_trigger_exit", (a, b) => exits.push(["c", a, b]));

  worldStep(1 / 60, world);
  if (enters.length < 2) fail("expected trigger enter both sides", enters);
  if (exits.length !== 0) fail("no exit while overlapping", exits);

  pe.transform2d.x = 100;
  pe.rigidbody2d.vx = 0;
  worldStep(1 / 60, world);
  if (exits.length < 2) fail("expected trigger exit both sides", exits);

  let anyTrigger = false;
  const n = collisionCount();
  for (let i = 0; i < n; i++) if (collisionIsTrigger(i)) anyTrigger = true;
  if (anyTrigger) fail("should not still have trigger contact after move", { n });
}

// --- on_trigger_exit (3D) ---
resetWorld();
resetScriptHost();
clearScriptHandlers();
{
  const world = createWorld();
  world.gravity = 0;
  const p = entityCreate(world);
  const zone = entityCreate(world);
  const pe = getWorld().entities.get(p);
  const ze = getWorld().entities.get(zone);
  pe.transform3d = { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
  pe.rigidbody3d = { vx: 0, vy: 0, vz: 0, gravity: 0, grounded: false };
  pe.collider3d = { kind: "aabb", w: 1, h: 1, d: 1, solid: true };
  pe.script = { module: "player", handler: "on_update" };
  ze.transform3d = { tx: 0.4, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
  ze.collider3d = { kind: "aabb", w: 1, h: 1, d: 1, solid: false };
  ze.script = { module: "zone", handler: "on_update" };

  const enters = [];
  const exits = [];
  registerScriptHandler("player", "on_trigger_enter", () => enters.push("enter"));
  registerScriptHandler("player", "on_trigger_exit", () => exits.push("exit"));

  worldStep(1 / 60, world);
  if (enters.length < 1) fail("3D trigger enter", enters);

  pe.transform3d.tx = 10;
  worldStep(1 / 60, world);
  if (exits.length < 1) fail("3D trigger exit", exits);
}

console.log("OK physics3d");
