export { fr, rgba } from "./math.js";
export { readStr, strEq, strLen } from "./memory.js";
export { attachInputListeners, bindMouse, createInputHandlers } from "./input.js";
export { createCanvasHandlers, createCanvasFillTextFallback, createGpuHandlers, gpuTri, initGpuTriangle, } from "./canvas.js";
export { createScene3dHandlers, ensureGpu, initScene3d, resetSceneTables, scene3d, createCustomMeshFromData, syncMeshPose, material3dTexture, light3dDirectional, light3dPoint, } from "./scene3d.js";
export { createEnvImports, createPrintImports, instantiateJuni } from "./env.js";
export { createAssetHandlers, createAssetStubs } from "./assets.js";
export { instantiateJuni as instantiateJuniBrowser, startFrameLoop } from "./browser.js";
export { createWorld, getWorld, resetWorld, worldStep, entityCreate, entityDestroy, animPlay, animStop, } from "./world.js";
export { loadSceneIntoWorld, parseScene, serializeWorld, emptyScene, materializeScene3d, sceneHas3d, parseAnimClipJson, } from "./scene-loader.js";
export { renderWorld2d, screenToWorld, worldToScreen } from "./render2d.js";
export { createEngineImports, createEngineStubs } from "./engine.js";
export { bindScriptWasm, registerScriptHandler, unregisterScriptHandler, clearScriptHandlers, dispatchEntityScripts, dispatchCollisionScripts, resetScriptHost, } from "./scripts.js";
//# sourceMappingURL=index.js.map