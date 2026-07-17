/** Host-side ECS world for the Juno game engine. */
export type Transform2D = {
    x: number;
    y: number;
    rotation: number;
    sx: number;
    sy: number;
    zIndex: number;
};
export type Transform3D = {
    tx: number;
    ty: number;
    tz: number;
    rx: number;
    ry: number;
    rz: number;
    sx: number;
    sy: number;
    sz: number;
};
export type SpriteComp = {
    tex: number;
    w: number;
    h: number;
    frame: number;
    cols: number;
    rows: number;
    fps: number;
    loop: boolean;
    animTime: number;
};
export type Mesh3DComp = {
    meshHandle: number;
};
export type Camera2DComp = {
    x: number;
    y: number;
    zoom: number;
    active: boolean;
    followTarget: number;
    smooth: number;
};
export type Camera3DComp = {
    camHandle: number;
    active: boolean;
};
export type RigidBody2D = {
    vx: number;
    vy: number;
    ax: number;
    ay: number;
    gravity: number;
    grounded: boolean;
};
export type Collider2D = {
    kind: "aabb" | "circle";
    w: number;
    h: number;
    radius: number;
    solid: boolean;
    /** Degrees from horizontal; non-zero enables slope slide when grounded on this surface. */
    slope: number;
};
export type PrefabComp = {
    path: string;
    offsetX: number;
    offsetY: number;
};
export type TilemapComp = {
    tileSize: number;
    cols: number;
    rows: number;
    tiles: number[];
    tileset: number;
};
export type Light3DComp = {
    kind: "directional" | "point";
    dx: number;
    dy: number;
    dz: number;
    x: number;
    y: number;
    z: number;
    r: number;
    g: number;
    b: number;
    range: number;
};
export type ScriptRef = {
    module: string;
    handler: string;
};
export type EntityRecord = {
    id: number;
    name: string;
    tag: string;
    parent: number;
    transform2d?: Transform2D;
    transform3d?: Transform3D;
    sprite?: SpriteComp;
    mesh3d?: Mesh3DComp;
    camera2d?: Camera2DComp;
    camera3d?: Camera3DComp;
    rigidbody2d?: RigidBody2D;
    collider2d?: Collider2D;
    tilemap?: TilemapComp;
    light3d?: Light3DComp;
    script?: ScriptRef;
    prefab?: PrefabComp;
};
export type World = {
    entities: Map<number, EntityRecord>;
    nextId: number;
    tags: Map<string, number>;
    gravity: number;
};
export declare let activeWorld: World | null;
export declare function createWorld(): World;
export declare function getWorld(): World;
export declare function resetWorld(): void;
export declare function entityCreate(world?: World): number;
export declare function entityDestroy(id: number, world?: World): void;
export declare function entitySetTag(id: number, tag: string, world?: World): void;
export declare function entityFindByTag(tag: string, world?: World): number;
export declare function defaultTransform2D(): Transform2D;
export declare function defaultTransform3D(): Transform3D;
export declare function transform2dSet(id: number, x: number, y: number, rot: number, sx: number, sy: number, world?: World): void;
export declare function transform3dSet(id: number, tx: number, ty: number, tz: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number, world?: World): void;
export declare function spriteSet(id: number, tex: number, w: number, h: number, world?: World): void;
export declare function mesh3dAttach(id: number, meshHandle: number, world?: World): void;
export declare function camera2dSet(id: number, x: number, y: number, zoom: number, world?: World): void;
export declare function camera2dFollow(camId: number, targetId: number, smooth: number, world?: World): void;
export declare function rigidbody2dSetVel(id: number, vx: number, vy: number, world?: World): void;
export declare function rigidbody2dGetGrounded(id: number, world?: World): number;
export declare function collider2dSet(id: number, kind: number, w: number, h: number, radius: number, solid: number, world?: World): void;
export declare function getActiveCamera2D(world?: World): Camera2DComp | null;
export type PhysicsHooks = {
    stepPhysics: (world: World, dt: number) => void;
    syncMeshes?: (world: World) => void;
};
export declare function setPhysicsHooks(hooks: PhysicsHooks | null): void;
export declare function worldStep(dt: number, world?: World): void;
//# sourceMappingURL=world.d.ts.map