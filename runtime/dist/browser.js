/** Browser-facing Juni runtime: wires canvas, input, and WebGPU hosts. */
import { createCanvasHandlers, createGpuHandlers } from "./canvas.js";
import { createEnvImports } from "./env.js";
import { createAssetHandlers } from "./assets.js";
import { createAudioHandlers } from "./audio.js";
import { attachInputListeners, bindMouse, createInputHandlers } from "./input.js";
import { createCustomMeshFromData, createScene3dHandlers, ensureGpu, light3dDirectional, light3dPoint, material3dTexture, resetSceneTables, scene3dSetAmbient, scene3dSetFog, syncMeshPose, } from "./scene3d.js";
import { createEngineImports, resetWorld } from "./engine.js";
import { bindScriptWasm, resetScriptHost, } from "./scripts.js";
export function startFrameLoop(instance, options = {}) {
    const frame = instance.exports.frame;
    if (typeof frame !== "function")
        return null;
    bindScriptWasm(instance.exports);
    let alive = true;
    let last = performance.now();
    const tick = (t) => {
        if (!alive || options.getShouldStop?.()) {
            alive = false;
            return;
        }
        const dt = Math.min(0.05, (t - last) / 1000);
        last = t;
        const ret = frame(dt);
        if (typeof ret === "number" && ret !== 0) {
            alive = false;
            return;
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return {
        stop() {
            alive = false;
            resetScriptHost();
        },
    };
}
export async function instantiateJuni(wasmBytes, options = {}) {
    const memoryRef = { current: null };
    const write = (text) => {
        if (options.onPrint)
            options.onPrint(String(text));
        else
            console.log(String(text));
    };
    attachInputListeners();
    const canvas = options.canvasEl ?? null;
    const gcanvas = options.gpuCanvasEl ?? null;
    if (canvas)
        bindMouse(canvas);
    if (gcanvas)
        bindMouse(gcanvas);
    const canvasHandlers = createCanvasHandlers(canvas, memoryRef);
    const assetHandlers = createAssetHandlers({
        memoryRef,
        assetPack: options.assetPack ?? null,
        assetBaseUrl: options.assetBaseUrl ?? "",
        getCtx2d: canvasHandlers.getCtx2d,
    });
    const audioHandlers = createAudioHandlers({
        memoryRef,
        assetPack: options.assetPack ?? null,
        assetBaseUrl: options.assetBaseUrl ?? "",
    });
    resetWorld();
    resetSceneTables();
    resetScriptHost();
    const scene3dHandlers = createScene3dHandlers(gcanvas, memoryRef);
    // GPU must be ready before materializing authored mesh/camera/light handles.
    if (options.mode === "webgpu" && gcanvas) {
        gcanvas.style.display = "block";
        if (canvas)
            canvas.style.display = "none";
        const ok = await ensureGpu(gcanvas);
        if (!ok)
            write("WebGPU not available in this browser.");
    }
    else if (canvas) {
        canvas.style.display = "block";
        if (gcanvas)
            gcanvas.style.display = "none";
    }
    const engine = createEngineImports({
        memoryRef,
        assetPack: options.assetPack ?? null,
        getCtx2d: canvasHandlers.getCtx2d,
        getBitmap: (handle) => assetHandlers.getBitmap(handle),
        getAssetText: options.getAssetText ?? ((path) => assetHandlers.getText(path)),
        createCustomMesh: createCustomMeshFromData,
        syncMeshPose,
        meshBox: (sx, sy, sz) => scene3dHandlers.meshBox?.(sx, sy, sz) ?? 0,
        cameraPerspective: (fov, aspect, near, far) => scene3dHandlers.cameraPerspective?.(fov, aspect, near, far) ?? 0,
        cameraOrbit: (cam, tx, ty, tz, yaw, pitch, dist) => scene3dHandlers.cameraOrbit?.(cam, tx, ty, tz, yaw, pitch, dist),
        materialColor: (r, g, b, a) => scene3dHandlers.materialColor?.(r, g, b, a) ?? 0,
        meshSetMaterial: (mesh, mat) => scene3dHandlers.meshSetMaterial?.(mesh, mat),
        materialTexture: material3dTexture,
        lightDirectional: light3dDirectional,
        lightPoint: light3dPoint,
        scene3dClear: (r, g, b, a) => scene3dHandlers.clear?.(r, g, b, a),
        scene3dDraw: (mesh, cam) => scene3dHandlers.draw?.(mesh, cam),
        scene3dSetAmbient,
        scene3dSetFog,
        initialScene: options.initialScene ?? null,
    });
    const { env, memoryRef: envMemoryRef } = createEnvImports({
        memoryRef,
        onPrint: options.onPrint,
        canvas: canvasHandlers,
        gpu: createGpuHandlers(),
        input: createInputHandlers(),
        scene3d: scene3dHandlers,
        assets: assetHandlers,
        audio: audioHandlers,
        engine,
        verbose: options.verbose,
    });
    await assetHandlers.preloadAll();
    const result = await WebAssembly.instantiate(wasmBytes, { env });
    const instance = "instance" in result
        ? result.instance
        : result;
    envMemoryRef.current = instance.exports.memory;
    bindScriptWasm(instance.exports);
    return instance;
}
//# sourceMappingURL=browser.js.map