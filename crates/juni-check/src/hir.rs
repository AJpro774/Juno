//! High-level IR after typechecking.

use crate::types::{StructLayout, Type};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct ModuleId(pub usize);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct FuncId(pub u32);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct LocalId(pub u32);

/// Module static variable in linear memory.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct StaticId(pub u32);

/// Multi-module program HIR (topological module order).
#[derive(Debug, Clone)]
pub struct HirProgram {
    pub modules: Vec<HirModule>,
    pub entry_module_id: ModuleId,
}

#[derive(Debug, Clone)]
pub struct HirModule {
    pub id: ModuleId,
    /// Logical module name (`math`, `main`, …).
    pub name: String,
    /// Source path for diagnostics (project-relative when available).
    pub file: Option<String>,
    pub structs: Vec<StructLayout>,
    pub statics: Vec<HirStatic>,
    pub static_region_size: u32,
    /// Byte offset of this module's static region in the merged linear memory.
    pub static_region_offset: u32,
    pub init_globals: HirBlock,
    pub functions: Vec<HirFunction>,
}

impl Default for HirModule {
    fn default() -> Self {
        Self {
            id: ModuleId(0),
            name: String::new(),
            file: None,
            structs: Vec::new(),
            statics: Vec::new(),
            static_region_size: 0,
            static_region_offset: 0,
            init_globals: HirBlock { stmts: vec![] },
            functions: Vec::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct HirStatic {
    pub id: StaticId,
    pub name: String,
    pub ty: Type,
    pub offset: u32,
    pub init: HirExpr,
}

#[derive(Debug, Clone)]
pub struct HirFunction {
    pub id: FuncId,
    /// Codegen symbol (mangled for cross-module items, e.g. `math::greet`).
    pub name: String,
    /// Unmangled export name when visible to other modules.
    pub pub_name: Option<String>,
    pub params: Vec<(LocalId, Type)>,
    pub ret: Type,
    pub locals: Vec<Type>,
    pub body: HirBlock,
    /// When true, exported from the WASM module (entry `main` / `frame` only).
    pub export: bool,
}

/// Mangle a symbol for cross-module codegen (`math::clamp`).
pub fn mangle_symbol(module: &str, name: &str) -> String {
    if module.is_empty() {
        name.to_string()
    } else {
        format!("{module}::{name}")
    }
}

#[derive(Debug, Clone)]
pub struct HirBlock {
    pub stmts: Vec<HirStmt>,
}

#[derive(Debug, Clone)]
pub enum HirStmt {
    Let {
        local: LocalId,
        ty: Type,
        init: HirExpr,
    },
    AssignLocal {
        local: LocalId,
        ty: Type,
        value: HirExpr,
    },
    AssignStatic {
        stat: StaticId,
        ty: Type,
        value: HirExpr,
    },
    AssignField {
        base: HirExpr,
        base_ty: Type,
        offset: u32,
        field_ty: Type,
        value: HirExpr,
    },
    AssignIndex {
        base: HirExpr,
        index: HirExpr,
        elem_ty: Type,
        elem_size: u32,
        /// Compile-time fixed array length (`T[N]`).
        len: u32,
        value: HirExpr,
    },
    If {
        cond: HirExpr,
        then_block: HirBlock,
        else_block: Option<HirBlock>,
    },
    While {
        cond: HirExpr,
        body: HirBlock,
    },
    Break,
    Continue,
    Block(HirBlock),
    Return(Option<HirExpr>),
    Delete(HirExpr),
    Expr(HirExpr),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MathUnaryOp {
    Sin,
    Cos,
    Tan,
    Abs,
    Floor,
    Ceil,
    Sqrt,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MathBinaryOp {
    Min,
    Max,
}

#[derive(Debug, Clone)]
pub enum HirExpr {
    Int(i32),
    Float(f32),
    Bool(bool),
    Local(LocalId, Type),
    Static(StaticId, Type),
    Unary {
        op: HirUnaryOp,
        expr: Box<HirExpr>,
        ty: Type,
    },
    Binary {
        op: HirBinaryOp,
        left: Box<HirExpr>,
        right: Box<HirExpr>,
        ty: Type,
    },
    Call {
        func: FuncId,
        args: Vec<HirExpr>,
        ty: Type,
    },
    Field {
        base: Box<HirExpr>,
        base_ty: Type,
        offset: u32,
        ty: Type,
    },
    Index {
        base: Box<HirExpr>,
        index: Box<HirExpr>,
        elem_ty: Type,
        elem_size: u32,
        /// Compile-time fixed array length (`T[N]`).
        len: u32,
    },
    ArrayLit {
        elem_ty: Type,
        elem_size: u32,
        elems: Vec<HirExpr>,
    },
    StructLit {
        size: u32,
        fields: Vec<(u32, Type, HirExpr)>,
    },
    New {
        size: u32,
        fields: Vec<(u32, Type, HirExpr)>,
    },
    MathUnary {
        op: MathUnaryOp,
        arg: Box<HirExpr>,
    },
    MathBinary {
        op: MathBinaryOp,
        left: Box<HirExpr>,
        right: Box<HirExpr>,
    },
    Rand,
    Now,
    AsI32(Box<HirExpr>),
    AsF32(Box<HirExpr>),
    StrLen(Box<HirExpr>),
    StrEq {
        left: Box<HirExpr>,
        right: Box<HirExpr>,
    },
    Clamp {
        x: Box<HirExpr>,
        lo: Box<HirExpr>,
        hi: Box<HirExpr>,
    },
    Lerp {
        a: Box<HirExpr>,
        b: Box<HirExpr>,
        t: Box<HirExpr>,
    },
    Pow {
        base: Box<HirExpr>,
        exp: Box<HirExpr>,
    },
    Sign(Box<HirExpr>),
    Fmod {
        x: Box<HirExpr>,
        y: Box<HirExpr>,
    },
    Smoothstep {
        edge0: Box<HirExpr>,
        edge1: Box<HirExpr>,
        x: Box<HirExpr>,
    },
    DegToRad(Box<HirExpr>),
    RadToDeg(Box<HirExpr>),
    Dist2 {
        x1: Box<HirExpr>,
        y1: Box<HirExpr>,
        x2: Box<HirExpr>,
        y2: Box<HirExpr>,
    },
    Pi,
    AbsI32(Box<HirExpr>),
    IMin {
        a: Box<HirExpr>,
        b: Box<HirExpr>,
    },
    IMax {
        a: Box<HirExpr>,
        b: Box<HirExpr>,
    },
    IClamp {
        x: Box<HirExpr>,
        lo: Box<HirExpr>,
        hi: Box<HirExpr>,
    },
    StrConcat {
        left: Box<HirExpr>,
        right: Box<HirExpr>,
    },
    StrSubstr {
        src: Box<HirExpr>,
        start: Box<HirExpr>,
        len: Box<HirExpr>,
    },
    Len2 {
        x: Box<HirExpr>,
        y: Box<HirExpr>,
    },
    Dot2 {
        x1: Box<HirExpr>,
        y1: Box<HirExpr>,
        x2: Box<HirExpr>,
        y2: Box<HirExpr>,
    },
    StrLit(Vec<u8>),
    PrintStr(Box<HirExpr>),
    PrintI32(Box<HirExpr>),
    PrintF32(Box<HirExpr>),
    CanvasInit {
        w: Box<HirExpr>,
        h: Box<HirExpr>,
    },
    CanvasClear {
        r: Box<HirExpr>,
        g: Box<HirExpr>,
        b: Box<HirExpr>,
        a: Box<HirExpr>,
    },
    CanvasFillRect {
        x: Box<HirExpr>,
        y: Box<HirExpr>,
        w: Box<HirExpr>,
        h: Box<HirExpr>,
        r: Box<HirExpr>,
        g: Box<HirExpr>,
        b: Box<HirExpr>,
        a: Box<HirExpr>,
    },
    CanvasFillCircle {
        x: Box<HirExpr>,
        y: Box<HirExpr>,
        radius: Box<HirExpr>,
        r: Box<HirExpr>,
        g: Box<HirExpr>,
        b: Box<HirExpr>,
        a: Box<HirExpr>,
    },
    CanvasFillText {
        text: Box<HirExpr>,
        x: Box<HirExpr>,
        y: Box<HirExpr>,
        r: Box<HirExpr>,
        g: Box<HirExpr>,
        b: Box<HirExpr>,
        a: Box<HirExpr>,
    },
    CanvasDrawLine {
        x1: Box<HirExpr>,
        y1: Box<HirExpr>,
        x2: Box<HirExpr>,
        y2: Box<HirExpr>,
        width: Box<HirExpr>,
        r: Box<HirExpr>,
        g: Box<HirExpr>,
        b: Box<HirExpr>,
        a: Box<HirExpr>,
    },
    CanvasStrokeRect {
        x: Box<HirExpr>,
        y: Box<HirExpr>,
        w: Box<HirExpr>,
        h: Box<HirExpr>,
        width: Box<HirExpr>,
        r: Box<HirExpr>,
        g: Box<HirExpr>,
        b: Box<HirExpr>,
        a: Box<HirExpr>,
    },
    GpuClear {
        r: Box<HirExpr>,
        g: Box<HirExpr>,
        b: Box<HirExpr>,
        a: Box<HirExpr>,
    },
    GpuDrawTriangle,
    KeyDown(Box<HirExpr>),
    MouseX,
    MouseY,
    MouseDown(Box<HirExpr>),
    Scene3dInit {
        w: Box<HirExpr>,
        h: Box<HirExpr>,
    },
    Camera3dPerspective {
        fov: Box<HirExpr>,
        aspect: Box<HirExpr>,
        near: Box<HirExpr>,
        far: Box<HirExpr>,
    },
    Mesh3dBox {
        sx: Box<HirExpr>,
        sy: Box<HirExpr>,
        sz: Box<HirExpr>,
    },
    Mesh3dSetPose {
        mesh: Box<HirExpr>,
        tx: Box<HirExpr>,
        ty: Box<HirExpr>,
        tz: Box<HirExpr>,
        rx: Box<HirExpr>,
        ry: Box<HirExpr>,
        rz: Box<HirExpr>,
    },
    Mesh3dRotate {
        mesh: Box<HirExpr>,
        drx: Box<HirExpr>,
        dry: Box<HirExpr>,
        drz: Box<HirExpr>,
    },
    Scene3dClear {
        r: Box<HirExpr>,
        g: Box<HirExpr>,
        b: Box<HirExpr>,
        a: Box<HirExpr>,
    },
    Scene3dDraw {
        mesh: Box<HirExpr>,
        cam: Box<HirExpr>,
    },
    Scene3dCreateNode,
    Scene3dSetParent {
        child: Box<HirExpr>,
        parent: Box<HirExpr>,
    },
    Camera3dLookAt {
        cam: Box<HirExpr>,
        ex: Box<HirExpr>,
        ey: Box<HirExpr>,
        ez: Box<HirExpr>,
        tx: Box<HirExpr>,
        ty: Box<HirExpr>,
        tz: Box<HirExpr>,
    },
    Camera3dOrbit {
        cam: Box<HirExpr>,
        target_x: Box<HirExpr>,
        target_y: Box<HirExpr>,
        target_z: Box<HirExpr>,
        yaw: Box<HirExpr>,
        pitch: Box<HirExpr>,
        distance: Box<HirExpr>,
    },
    Mesh3dCustom {
        verts_ptr: Box<HirExpr>,
        vert_count: Box<HirExpr>,
        indices_ptr: Box<HirExpr>,
        index_count: Box<HirExpr>,
    },
    Material3dColor {
        r: Box<HirExpr>,
        g: Box<HirExpr>,
        b: Box<HirExpr>,
        a: Box<HirExpr>,
    },
    Mesh3dSetMaterial {
        mesh: Box<HirExpr>,
        material: Box<HirExpr>,
    },
    AssetLoadStr {
        path: Box<HirExpr>,
    },
    SpriteDraw {
        handle: Box<HirExpr>,
        x: Box<HirExpr>,
        y: Box<HirExpr>,
        w: Box<HirExpr>,
        h: Box<HirExpr>,
    },
    MeshLoadObj {
        path: Box<HirExpr>,
    },
    /// `aabb_overlap(a, b)` — axis-aligned box overlap (struct pointers).
    AabbOverlap {
        a: Box<HirExpr>,
        b: Box<HirExpr>,
    },
    /// `aabb_resolve_x(moving, other, vel_x)` — X-axis collision response.
    AabbResolveX {
        moving: Box<HirExpr>,
        other: Box<HirExpr>,
        vel_x: Box<HirExpr>,
    },
    /// `audio_load(path)` — load audio asset; returns handle id.
    AudioLoad(Box<HirExpr>),
    /// `audio_play(handle)` — play loaded audio.
    AudioPlay(Box<HirExpr>),
    // --- Engine ECS ---
    WorldCreate,
    EntityCreate,
    EntityDestroy(Box<HirExpr>),
    EntitySetTag {
        id: Box<HirExpr>,
        tag: Box<HirExpr>,
    },
    EntityFindByTag(Box<HirExpr>),
    Transform2dSet {
        id: Box<HirExpr>,
        x: Box<HirExpr>,
        y: Box<HirExpr>,
        rot: Box<HirExpr>,
        sx: Box<HirExpr>,
        sy: Box<HirExpr>,
    },
    Transform3dSet {
        id: Box<HirExpr>,
        tx: Box<HirExpr>,
        ty: Box<HirExpr>,
        tz: Box<HirExpr>,
        rx: Box<HirExpr>,
        ry: Box<HirExpr>,
        rz: Box<HirExpr>,
        sx: Box<HirExpr>,
        sy: Box<HirExpr>,
        sz: Box<HirExpr>,
    },
    SpriteSet {
        id: Box<HirExpr>,
        tex: Box<HirExpr>,
        w: Box<HirExpr>,
        h: Box<HirExpr>,
    },
    Mesh3dAttach {
        id: Box<HirExpr>,
        mesh: Box<HirExpr>,
    },
    WorldStep(Box<HirExpr>),
    SceneLoad(Box<HirExpr>),
    Camera2dSet {
        id: Box<HirExpr>,
        x: Box<HirExpr>,
        y: Box<HirExpr>,
        zoom: Box<HirExpr>,
    },
    TilemapLoad(Box<HirExpr>),
    TilemapAttach {
        entity: Box<HirExpr>,
        tilemap: Box<HirExpr>,
    },
    WorldDraw(Box<HirExpr>),
    Material3dTexture(Box<HirExpr>),
    Light3dDirectional {
        dx: Box<HirExpr>,
        dy: Box<HirExpr>,
        dz: Box<HirExpr>,
        r: Box<HirExpr>,
        g: Box<HirExpr>,
        b: Box<HirExpr>,
    },
    Light3dPoint {
        x: Box<HirExpr>,
        y: Box<HirExpr>,
        z: Box<HirExpr>,
        r: Box<HirExpr>,
        g: Box<HirExpr>,
        b: Box<HirExpr>,
        range: Box<HirExpr>,
    },
    MeshLoadGltf(Box<HirExpr>),
    AabbResolveY {
        moving: Box<HirExpr>,
        other: Box<HirExpr>,
        vel_y: Box<HirExpr>,
    },
    AudioPlayLoop(Box<HirExpr>),
    AudioSetVolume {
        handle: Box<HirExpr>,
        volume: Box<HirExpr>,
    },
    AudioStop(Box<HirExpr>),
    AudioSetBusVolume(Box<HirExpr>),
    GamepadAxis {
        pad: Box<HirExpr>,
        axis: Box<HirExpr>,
    },
    GamepadButton {
        pad: Box<HirExpr>,
        button: Box<HirExpr>,
    },
    CollisionCount,
    CollisionEntityA(Box<HirExpr>),
    CollisionEntityB(Box<HirExpr>),
    CollisionIsTrigger(Box<HirExpr>),
    Rigidbody2dSetVel {
        id: Box<HirExpr>,
        vx: Box<HirExpr>,
        vy: Box<HirExpr>,
    },
    Rigidbody2dGetGrounded(Box<HirExpr>),
    Collider2dSet {
        id: Box<HirExpr>,
        kind: Box<HirExpr>,
        w: Box<HirExpr>,
        h: Box<HirExpr>,
        radius: Box<HirExpr>,
        solid: Box<HirExpr>,
    },
    Rigidbody3dSetVel {
        id: Box<HirExpr>,
        vx: Box<HirExpr>,
        vy: Box<HirExpr>,
        vz: Box<HirExpr>,
    },
    Rigidbody3dGetGrounded(Box<HirExpr>),
    Collider3dSet {
        id: Box<HirExpr>,
        kind: Box<HirExpr>,
        w: Box<HirExpr>,
        h: Box<HirExpr>,
        d: Box<HirExpr>,
        solid: Box<HirExpr>,
    },
    Transform3dSyncFrom2d(Box<HirExpr>),
    Camera2dFollow {
        cam: Box<HirExpr>,
        target: Box<HirExpr>,
        smooth: Box<HirExpr>,
    },
    PrefabSpawn {
        path: Box<HirExpr>,
        x: Box<HirExpr>,
        y: Box<HirExpr>,
    },
    WorldDraw3d(Box<HirExpr>),
    Scene3dSetAmbient {
        r: Box<HirExpr>,
        g: Box<HirExpr>,
        b: Box<HirExpr>,
    },
    Scene3dSetFog(Box<HirExpr>),
    AnimPlay {
        id: Box<HirExpr>,
        clip: Box<HirExpr>,
    },
    AnimStop(Box<HirExpr>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HirUnaryOp {
    Neg,
    Not,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HirBinaryOp {
    Add,
    Sub,
    Mul,
    Div,
    Rem,
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
    And,
    Or,
}
