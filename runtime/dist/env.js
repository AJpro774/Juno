/**
 * Shared Juni WASM env imports for Node and the browser IDE.
 */
import { readStr, strEq, strLen } from "./memory.js";
import { fr } from "./math.js";
import { createCanvasFillTextFallback } from "./canvas.js";
import { createAssetStubs } from "./assets.js";
import { createAudioStubs } from "./audio.js";
import { createPhysicsImports } from "./physics.js";
import { createEngineStubs } from "./engine.js";
function stub() { }
function stub0() {
    return 0;
}
function stubF() {
    return 0;
}
const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
export function createPrintImports(memoryRef, onPrint) {
    const write = (text) => {
        if (typeof onPrint === "function")
            onPrint(String(text));
        else
            console.log(String(text));
    };
    return {
        print_str(ptr) {
            const memory = memoryRef.current;
            if (!memory) {
                write("<print_str: no memory>");
                return;
            }
            write(readStr(memory, ptr));
        },
        print_i32(v) {
            write(String(v | 0));
        },
        print_f32(v) {
            write(String(v));
        },
    };
}
export function createEnvImports(options = {}) {
    const memoryRef = options.memoryRef ?? { current: null };
    const canvas = options.canvas ?? {};
    const gpu = options.gpu ?? {};
    const input = options.input ?? {};
    const scene3d = options.scene3d ?? {};
    const stubs = options.webgpuStub ??
        ((code) => {
            if (options.verbose)
                console.log("[webgpu-stub]", code);
        });
    const print = createPrintImports(memoryRef, options.onPrint);
    const assets = options.assets ?? createAssetStubs();
    const audio = options.audio ?? createAudioStubs();
    const physics = createPhysicsImports(memoryRef);
    const engine = options.engine ?? createEngineStubs();
    return {
        env: {
            sqrt_f32: (x) => fr(Math.sqrt(x)),
            webgpu_stub: (code) => stubs(code),
            print_str: print.print_str,
            print_i32: print.print_i32,
            print_f32: print.print_f32,
            canvas_init: canvas.init ?? stub,
            canvas_clear: canvas.clear ?? stub,
            canvas_fill_rect: canvas.fillRect ?? stub,
            canvas_fill_circle: canvas.fillCircle ?? stub,
            canvas_fill_text: canvas.fillText ?? createCanvasFillTextFallback(memoryRef, options.onPrint),
            canvas_draw_line: canvas.drawLine ?? stub,
            canvas_stroke_rect: canvas.strokeRect ?? stub,
            gpu_clear: gpu.clear ?? stub,
            gpu_draw_triangle: gpu.drawTriangle ?? stub,
            sin_f32: (x) => fr(Math.sin(x)),
            cos_f32: (x) => fr(Math.cos(x)),
            tan_f32: (x) => fr(Math.tan(x)),
            abs_f32: (x) => fr(Math.abs(x)),
            floor_f32: (x) => fr(Math.floor(x)),
            ceil_f32: (x) => fr(Math.ceil(x)),
            min_f32: (a, b) => fr(Math.min(a, b)),
            max_f32: (a, b) => fr(Math.max(a, b)),
            rand_f32: () => fr(Math.random()),
            now_f32: () => {
                const n = typeof performance !== "undefined" ? performance.now() : Date.now();
                return fr((n - t0) / 1000);
            },
            key_down: input.keyDown ?? stub0,
            mouse_x: input.mouseX ?? stubF,
            mouse_y: input.mouseY ?? stubF,
            mouse_down: input.mouseDown ?? stub0,
            scene3d_init: scene3d.init ?? stub,
            camera3d_perspective: scene3d.cameraPerspective ?? stub0,
            mesh3d_box: scene3d.meshBox ?? stub0,
            mesh3d_set_pose: scene3d.meshSetPose ?? stub,
            mesh3d_rotate: scene3d.meshRotate ?? stub,
            scene3d_clear: scene3d.clear ?? stub,
            scene3d_draw: scene3d.draw ?? stub,
            scene3d_create_node: scene3d.createNode ?? stub0,
            scene3d_set_parent: scene3d.setParent ?? stub,
            camera3d_look_at: scene3d.cameraLookAt ?? stub,
            camera3d_orbit: scene3d.cameraOrbit ?? stub,
            mesh3d_custom: scene3d.meshCustom ?? stub0,
            material3d_color: scene3d.materialColor ?? stub0,
            mesh3d_set_material: scene3d.meshSetMaterial ?? stub,
            str_len: (ptr) => strLen(memoryRef, ptr),
            str_eq: (a, b) => strEq(memoryRef, a, b),
            clamp_f32: (x, lo, hi) => fr(Math.min(hi, Math.max(lo, x))),
            lerp_f32: (a, b, t) => fr(a + (b - a) * t),
            pow_f32: (x, y) => fr(Math.pow(x, y)),
            sign_f32: (x) => fr(x > 0 ? 1 : x < 0 ? -1 : 0),
            fmod_f32: (x, y) => fr(x % y),
            smoothstep_f32: (e0, e1, x) => {
                const t = fr(Math.min(1, Math.max(0, (x - e0) / (e1 - e0))));
                return fr(t * t * (3 - 2 * t));
            },
            deg_to_rad_f32: (d) => fr((d * Math.PI) / 180),
            rad_to_deg_f32: (r) => fr((r * 180) / Math.PI),
            dist2_f32: (x1, y1, x2, y2) => {
                const dx = x2 - x1;
                const dy = y2 - y1;
                return fr(Math.sqrt(dx * dx + dy * dy));
            },
            pi_f32: () => fr(Math.PI),
            abs_i32: (x) => Math.abs(x | 0) | 0,
            min_i32: (a, b) => Math.min(a | 0, b | 0) | 0,
            max_i32: (a, b) => Math.max(a | 0, b | 0) | 0,
            clamp_i32: (x, lo, hi) => Math.min(hi | 0, Math.max(lo | 0, x | 0)) | 0,
            len2_f32: (x, y) => fr(Math.sqrt(x * x + y * y)),
            dot2_f32: (x1, y1, x2, y2) => fr(x1 * x2 + y1 * y2),
            asset_load_str: assets.asset_load_str,
            sprite_draw: assets.sprite_draw,
            mesh_load_obj: assets.mesh_load_obj,
            aabb_overlap: physics.aabb_overlap,
            aabb_resolve_x: physics.aabb_resolve_x,
            audio_load: audio.audio_load,
            audio_play: audio.audio_play,
            // Engine ECS (indices 67+)
            world_create: engine.world_create,
            entity_create: engine.entity_create,
            entity_destroy: engine.entity_destroy,
            entity_set_tag: engine.entity_set_tag,
            entity_find_by_tag: engine.entity_find_by_tag,
            transform2d_set: engine.transform2d_set,
            transform3d_set: engine.transform3d_set,
            sprite_set: engine.sprite_set,
            mesh3d_attach: engine.mesh3d_attach,
            world_step: engine.world_step,
            scene_load: engine.scene_load,
            camera2d_set: engine.camera2d_set,
            tilemap_load: engine.tilemap_load,
            tilemap_attach: engine.tilemap_attach,
            world_draw: engine.world_draw,
            material3d_texture: engine.material3d_texture,
            light3d_directional: engine.light3d_directional,
            light3d_point: engine.light3d_point,
            mesh_load_gltf: engine.mesh_load_gltf,
            aabb_resolve_y: physics.aabb_resolve_y,
            audio_play_loop: audio.audio_play_loop ?? stub,
            audio_set_volume: audio.audio_set_volume ?? stub,
            gamepad_axis: input.gamepadAxis ?? stubF,
            gamepad_button: input.gamepadButton ?? stub0,
            collision_count: engine.collision_count ?? stub0,
            collision_entity_a: engine.collision_entity_a ?? stub0,
            collision_entity_b: engine.collision_entity_b ?? stub0,
            rigidbody2d_set_vel: engine.rigidbody2d_set_vel ?? stub,
            rigidbody2d_get_grounded: engine.rigidbody2d_get_grounded ?? stub0,
            collider2d_set: engine.collider2d_set ?? stub,
            camera2d_follow: engine.camera2d_follow ?? stub,
            prefab_spawn: engine.prefab_spawn ?? stub0,
            world_draw3d: engine.world_draw3d ?? stub,
            scene3d_set_ambient: engine.scene3d_set_ambient ?? stub,
            scene3d_set_fog: engine.scene3d_set_fog ?? stub,
            audio_stop: audio.audio_stop ?? stub,
            audio_set_bus_volume: audio.audio_set_bus_volume ?? stub,
        },
        memoryRef,
    };
}
export async function instantiateJuni(wasmBytes, options = {}) {
    const { env, memoryRef } = createEnvImports(options);
    const result = await WebAssembly.instantiate(wasmBytes, { env });
    const instance = "instance" in result
        ? result.instance
        : result;
    memoryRef.current = instance.exports.memory;
    return instance;
}
//# sourceMappingURL=env.js.map