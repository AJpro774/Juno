//! High-level IR after typechecking.

use crate::types::{StructLayout, Type};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct FuncId(pub u32);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct LocalId(pub u32);

/// Module static variable in linear memory.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct StaticId(pub u32);

#[derive(Debug, Clone)]
pub struct HirModule {
    pub structs: Vec<StructLayout>,
    pub statics: Vec<HirStatic>,
    pub static_region_size: u32,
    pub init_globals: HirBlock,
    pub functions: Vec<HirFunction>,
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
    pub name: String,
    pub params: Vec<(LocalId, Type)>,
    pub ret: Type,
    pub locals: Vec<Type>,
    pub body: HirBlock,
    pub export: bool,
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
