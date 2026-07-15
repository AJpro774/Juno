/** Shared Juni runtime types. */
export type MemoryRef = {
    current: WebAssembly.Memory | null;
};
export type RunOptions = {
    onPrint?: (text: string) => void;
    canvasEl?: HTMLCanvasElement | null;
    gpuCanvasEl?: HTMLCanvasElement | null;
    mode?: "canvas2d" | "webgpu";
    verbose?: boolean;
    getShouldStop?: () => boolean;
    assetPack?: AssetPack | null;
    assetBaseUrl?: string;
    /** Optional initial `.jscene` JSON or object loaded before `main()`. */
    initialScene?: unknown;
    /** Optional text asset resolver for scenes / tilemaps / glTF. */
    getAssetText?: (path: string) => string | null;
};
export type AssetEntry = {
    id: number;
    kind: string;
    w: number;
    h: number;
    path: string;
    embed?: string;
};
export type AssetPack = {
    version: number;
    assets: Record<string, AssetEntry>;
};
export type FrameController = {
    stop: () => void;
};
export type CanvasHandlers = {
    init?: (w: number, h: number) => void;
    clear?: (r: number, g: number, b: number, a: number) => void;
    fillRect?: (x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number) => void;
    fillCircle?: (x: number, y: number, radius: number, r: number, g: number, b: number, a: number) => void;
    fillText?: (ptr: number, x: number, y: number, r: number, g: number, b: number, a: number) => void;
    drawLine?: (x1: number, y1: number, x2: number, y2: number, width: number, r: number, g: number, b: number, a: number) => void;
    strokeRect?: (x: number, y: number, w: number, h: number, width: number, r: number, g: number, b: number, a: number) => void;
};
export type GpuHandlers = {
    clear?: (r: number, g: number, b: number, a: number) => void;
    drawTriangle?: () => void;
};
export type InputHandlers = {
    keyDown?: (code: number) => number;
    mouseX?: () => number;
    mouseY?: () => number;
    mouseDown?: (button: number) => number;
    gamepadAxis?: (pad: number, axis: number) => number;
    gamepadButton?: (pad: number, button: number) => number;
};
export type Scene3dHandlers = {
    init?: (w: number, h: number) => void;
    cameraPerspective?: (fov: number, aspect: number, near: number, far: number) => number;
    cameraLookAt?: (cam: number, ex: number, ey: number, ez: number, tx: number, ty: number, tz: number) => void;
    cameraOrbit?: (cam: number, tx: number, ty: number, tz: number, yaw: number, pitch: number, distance: number) => void;
    createNode?: () => number;
    setParent?: (child: number, parent: number) => void;
    meshBox?: (sx: number, sy: number, sz: number) => number;
    meshCustom?: (vertsPtr: number, vertCount: number, indicesPtr: number, indexCount: number) => number;
    materialColor?: (r: number, g: number, b: number, a: number) => number;
    meshSetMaterial?: (mesh: number, material: number) => void;
    meshSetPose?: (mesh: number, tx: number, ty: number, tz: number, rx: number, ry: number, rz: number) => void;
    meshRotate?: (mesh: number, drx: number, dry: number, drz: number) => void;
    clear?: (r: number, g: number, b: number, a: number) => void;
    draw?: (meshId: number, camId: number) => void;
};
export type EnvOptions = {
    memoryRef?: MemoryRef;
    onPrint?: (text: string) => void;
    canvas?: CanvasHandlers;
    gpu?: GpuHandlers;
    input?: InputHandlers;
    scene3d?: Scene3dHandlers;
    assets?: AssetHostHandlers;
    audio?: AudioHostHandlers;
    engine?: Record<string, any>;
    webgpuStub?: (code: number) => void;
    verbose?: boolean;
};
export type AssetHostHandlers = {
    asset_load_str: (ptr: number) => number;
    sprite_draw: (handle: number, x: number, y: number, w: number, h: number) => void;
    mesh_load_obj: (ptr: number) => number;
};
export type AudioHostHandlers = {
    audio_load: (ptr: number) => number;
    audio_play: (handle: number) => void;
    audio_play_loop?: (handle: number) => void;
    audio_set_volume?: (handle: number, volume: number) => void;
};
//# sourceMappingURL=types.d.ts.map