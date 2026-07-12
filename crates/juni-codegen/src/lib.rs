//! WASM code generation for Juni HIR.

use juni_check::hir::*;
use juni_check::types::{Builtin, Type};
use wasm_encoder::{
    BlockType, CodeSection, ConstExpr, EntityType, ExportKind, ExportSection, Function,
    FunctionSection, GlobalSection, GlobalType, ImportSection, Instruction, MemArg, MemorySection,
    MemoryType, Module, TypeSection, ValType,
};

/// Import indices (must match host `env`):
/// 0 sqrt 1 stub 2-4 print 5-9 canvas 10-11 gpu
/// 12-17 sin..ceil 18-19 min/max 20 rand 21 now
/// 22 key_down 23 mouse_x 24 mouse_y 25 mouse_down
/// 26 scene3d_init 27 camera3d_perspective 28 mesh3d_box
/// 29 mesh3d_set_pose 30 mesh3d_rotate 31 scene3d_clear 32 scene3d_draw
/// 33 str_len 34 str_eq 35 clamp_f32 36 lerp_f32
/// 37 pow_f32 38 sign_f32 39 fmod_f32 40 smoothstep_f32
/// 41 deg_to_rad_f32 42 rad_to_deg_f32 43 dist2_f32 44 pi_f32
/// 45 abs_i32 46 min_i32 47 max_i32 48 clamp_i32
/// 49 len2_f32 50 dot2_f32 51 canvas_draw_line 52 canvas_stroke_rect
const IMPORT_COUNT: u32 = 53;

pub fn emit_wasm(hir: &HirModule) -> Vec<u8> {
    let mut module = Module::new();
    let mut types = TypeSection::new();

    let mut add_fn = |params: &[ValType], results: &[ValType]| -> u32 {
        let idx = types.len();
        types.ty().function(params.iter().copied(), results.iter().copied());
        idx
    };

    let t_f32_f32 = add_fn(&[ValType::F32], &[ValType::F32]);
    let t_2f_f32 = add_fn(&[ValType::F32, ValType::F32], &[ValType::F32]);
    let t_void_f32 = add_fn(&[], &[ValType::F32]);
    let t_i32_void = add_fn(&[ValType::I32], &[]);
    let t_i32_i32 = add_fn(&[ValType::I32], &[ValType::I32]);
    let t_f32_void = add_fn(&[ValType::F32], &[]);
    let t_void = add_fn(&[], &[]);
    let t_2i = add_fn(&[ValType::I32, ValType::I32], &[]);
    let t_4f = add_fn(
        &[ValType::F32, ValType::F32, ValType::F32, ValType::F32],
        &[],
    );
    let t_4f_i32 = add_fn(
        &[ValType::F32, ValType::F32, ValType::F32, ValType::F32],
        &[ValType::I32],
    );
    let t_3f_i32 = add_fn(
        &[ValType::F32, ValType::F32, ValType::F32],
        &[ValType::I32],
    );
    let t_i_6f = add_fn(
        &[
            ValType::I32,
            ValType::F32, ValType::F32, ValType::F32,
            ValType::F32, ValType::F32, ValType::F32,
        ],
        &[],
    );
    let t_i_3f = add_fn(
        &[ValType::I32, ValType::F32, ValType::F32, ValType::F32],
        &[],
    );
    let t_2i_void = add_fn(&[ValType::I32, ValType::I32], &[]);
    let t_8f = add_fn(
        &[
            ValType::F32, ValType::F32, ValType::F32, ValType::F32,
            ValType::F32, ValType::F32, ValType::F32, ValType::F32,
        ],
        &[],
    );
    let t_7f = add_fn(
        &[
            ValType::F32, ValType::F32, ValType::F32, ValType::F32,
            ValType::F32, ValType::F32, ValType::F32,
        ],
        &[],
    );
    let t_text = add_fn(
        &[
            ValType::I32, ValType::F32, ValType::F32, ValType::F32,
            ValType::F32, ValType::F32, ValType::F32,
        ],
        &[],
    );

    let t_3f_f32 = add_fn(
        &[ValType::F32, ValType::F32, ValType::F32],
        &[ValType::F32],
    );
    let t_2i_i32 = add_fn(&[ValType::I32, ValType::I32], &[ValType::I32]);
    let t_3i_i32 = add_fn(
        &[ValType::I32, ValType::I32, ValType::I32],
        &[ValType::I32],
    );
    let t_4f_f32_ret = add_fn(
        &[ValType::F32, ValType::F32, ValType::F32, ValType::F32],
        &[ValType::F32],
    );
    let t_9f = add_fn(
        &[
            ValType::F32, ValType::F32, ValType::F32, ValType::F32, ValType::F32,
            ValType::F32, ValType::F32, ValType::F32, ValType::F32,
        ],
        &[],
    );

    let mut func_type_indices = Vec::new();
    for func in &hir.functions {
        let params: Vec<ValType> = func.params.iter().map(|(_, t)| val_type(t)).collect();
        let results: Vec<ValType> = if matches!(func.ret, Type::Builtin(Builtin::Void)) {
            vec![]
        } else {
            vec![val_type(&func.ret)]
        };
        func_type_indices.push(add_fn(&params, &results));
    }
    module.section(&types);

    let mut imports = ImportSection::new();
    imports.import("env", "sqrt_f32", EntityType::Function(t_f32_f32));
    imports.import("env", "webgpu_stub", EntityType::Function(t_i32_void));
    imports.import("env", "print_str", EntityType::Function(t_i32_void));
    imports.import("env", "print_i32", EntityType::Function(t_i32_void));
    imports.import("env", "print_f32", EntityType::Function(t_f32_void));
    imports.import("env", "canvas_init", EntityType::Function(t_2i));
    imports.import("env", "canvas_clear", EntityType::Function(t_4f));
    imports.import("env", "canvas_fill_rect", EntityType::Function(t_8f));
    imports.import("env", "canvas_fill_circle", EntityType::Function(t_7f));
    imports.import("env", "canvas_fill_text", EntityType::Function(t_text));
    imports.import("env", "gpu_clear", EntityType::Function(t_4f));
    imports.import("env", "gpu_draw_triangle", EntityType::Function(t_void));
    imports.import("env", "sin_f32", EntityType::Function(t_f32_f32));
    imports.import("env", "cos_f32", EntityType::Function(t_f32_f32));
    imports.import("env", "tan_f32", EntityType::Function(t_f32_f32));
    imports.import("env", "abs_f32", EntityType::Function(t_f32_f32));
    imports.import("env", "floor_f32", EntityType::Function(t_f32_f32));
    imports.import("env", "ceil_f32", EntityType::Function(t_f32_f32));
    imports.import("env", "min_f32", EntityType::Function(t_2f_f32));
    imports.import("env", "max_f32", EntityType::Function(t_2f_f32));
    imports.import("env", "rand_f32", EntityType::Function(t_void_f32));
    imports.import("env", "now_f32", EntityType::Function(t_void_f32));
    imports.import("env", "key_down", EntityType::Function(t_i32_i32));
    imports.import("env", "mouse_x", EntityType::Function(t_void_f32));
    imports.import("env", "mouse_y", EntityType::Function(t_void_f32));
    imports.import("env", "mouse_down", EntityType::Function(t_i32_i32));
    imports.import("env", "scene3d_init", EntityType::Function(t_2i));
    imports.import("env", "camera3d_perspective", EntityType::Function(t_4f_i32));
    imports.import("env", "mesh3d_box", EntityType::Function(t_3f_i32));
    imports.import("env", "mesh3d_set_pose", EntityType::Function(t_i_6f));
    imports.import("env", "mesh3d_rotate", EntityType::Function(t_i_3f));
    imports.import("env", "scene3d_clear", EntityType::Function(t_4f));
    imports.import("env", "scene3d_draw", EntityType::Function(t_2i_void));
    imports.import("env", "str_len", EntityType::Function(t_i32_i32));
    imports.import("env", "str_eq", EntityType::Function(t_2i_i32));
    imports.import("env", "clamp_f32", EntityType::Function(t_3f_f32));
    imports.import("env", "lerp_f32", EntityType::Function(t_3f_f32));
    imports.import("env", "pow_f32", EntityType::Function(t_2f_f32));
    imports.import("env", "sign_f32", EntityType::Function(t_f32_f32));
    imports.import("env", "fmod_f32", EntityType::Function(t_2f_f32));
    imports.import("env", "smoothstep_f32", EntityType::Function(t_3f_f32));
    imports.import("env", "deg_to_rad_f32", EntityType::Function(t_f32_f32));
    imports.import("env", "rad_to_deg_f32", EntityType::Function(t_f32_f32));
    imports.import("env", "dist2_f32", EntityType::Function(t_4f_f32_ret));
    imports.import("env", "pi_f32", EntityType::Function(t_void_f32));
    imports.import("env", "abs_i32", EntityType::Function(t_i32_i32));
    imports.import("env", "min_i32", EntityType::Function(t_2i_i32));
    imports.import("env", "max_i32", EntityType::Function(t_2i_i32));
    imports.import("env", "clamp_i32", EntityType::Function(t_3i_i32));
    imports.import("env", "len2_f32", EntityType::Function(t_2f_f32));
    imports.import("env", "dot2_f32", EntityType::Function(t_4f_f32_ret));
    imports.import("env", "canvas_draw_line", EntityType::Function(t_9f));
    imports.import("env", "canvas_stroke_rect", EntityType::Function(t_9f));
    module.section(&imports);

    let mut functions = FunctionSection::new();
    for &ty_idx in &func_type_indices {
        functions.function(ty_idx);
    }
    module.section(&functions);

    let mut memories = MemorySection::new();
    memories.memory(MemoryType {
        minimum: 2,
        maximum: None,
        memory64: false,
        shared: false,
        page_size_log2: None,
    });
    module.section(&memories);

    let mut globals = GlobalSection::new();
    // Global 0: heap bump pointer
    let heap_base = align_up(hir.static_region_size, 16).max(1024);
    globals.global(
        GlobalType {
            val_type: ValType::I32,
            mutable: true,
            shared: false,
        },
        &ConstExpr::i32_const(heap_base as i32),
    );
    module.section(&globals);

    let mut exports = ExportSection::new();
    exports.export("memory", ExportKind::Memory, 0);
    for (i, func) in hir.functions.iter().enumerate() {
        if func.export || func.name == "main" {
            exports.export(&func.name, ExportKind::Func, IMPORT_COUNT + i as u32);
        }
    }
    module.section(&exports);

    let mut codes = CodeSection::new();
    for func in &hir.functions {
        codes.function(&emit_function(func, hir));
    }
    module.section(&codes);

    module.finish()
}

fn val_type(ty: &Type) -> ValType {
    match ty {
        Type::Builtin(Builtin::I32)
        | Type::Builtin(Builtin::Bool)
        | Type::Builtin(Builtin::Str) => ValType::I32,
        Type::Builtin(Builtin::I64) => ValType::I64,
        Type::Builtin(Builtin::F32) => ValType::F32,
        Type::Builtin(Builtin::F64) => ValType::F64,
        Type::Builtin(Builtin::Void) => ValType::I32,
        Type::Struct(_) | Type::Ref { .. } | Type::Array { .. } => ValType::I32,
    }
}

fn is_void_expr(expr: &HirExpr) -> bool {
    matches!(
        expr,
        HirExpr::PrintStr(_)
            | HirExpr::PrintI32(_)
            | HirExpr::PrintF32(_)
            | HirExpr::CanvasInit { .. }
            | HirExpr::CanvasClear { .. }
            | HirExpr::CanvasFillRect { .. }
            | HirExpr::CanvasFillCircle { .. }
            | HirExpr::CanvasFillText { .. }
            | HirExpr::CanvasDrawLine { .. }
            | HirExpr::CanvasStrokeRect { .. }
            | HirExpr::GpuClear { .. }
            | HirExpr::GpuDrawTriangle
            | HirExpr::Mesh3dSetPose { .. }
            | HirExpr::Mesh3dRotate { .. }
            | HirExpr::Scene3dInit { .. }
            | HirExpr::Scene3dClear { .. }
            | HirExpr::Scene3dDraw { .. }
    )
}

fn as_f32_expr(f: &mut Function, expr: &HirExpr, ctx: &mut EmitCtx<'_>) {
    match expr {
        HirExpr::Int(v) => {
            f.instruction(&Instruction::F32Const((*v as f32).into()));
        }
        _ => {
            ctx.emit_expr(f, expr);
            if matches!(expr_ty(expr), Type::Builtin(Builtin::I32)) {
                f.instruction(&Instruction::F32ConvertI32S);
            }
        }
    }
}

fn align_up(value: u32, align: u32) -> u32 {
    if align == 0 {
        return value;
    }
    (value + align - 1) / align * align
}

fn emit_function(func: &HirFunction, hir: &HirModule) -> Function {
    let param_count = func.params.len() as u32;
    let mut local_decls: Vec<(u32, ValType)> = Vec::new();
    for ty in func.locals.iter().skip(param_count as usize) {
        local_decls.push((1, val_type(ty)));
    }
    let scratch = func.locals.len() as u32;
    local_decls.push((1, ValType::I32));
    let scratch2 = scratch + 1;
    local_decls.push((1, ValType::I32));
    let scratch3 = scratch + 2;
    local_decls.push((1, ValType::I32));
    let scratch4 = scratch + 3;
    local_decls.push((1, ValType::I32));

    let local_map: Vec<u32> = (0..func.locals.len() as u32).collect();
    let mut f = Function::new(local_decls);
    let mut ctx = EmitCtx {
        local_map: &local_map,
        statics: &hir.statics,
        scratch,
        scratch2,
        scratch3,
        scratch4,
    };
    if func.name == "main" && !hir.init_globals.stmts.is_empty() {
        ctx.emit_block(&mut f, &hir.init_globals);
    }
    ctx.emit_block(&mut f, &func.body);
    f.instruction(&Instruction::End);
    f
}

struct EmitCtx<'a> {
    local_map: &'a [u32],
    statics: &'a [HirStatic],
    scratch: u32,
    scratch2: u32,
    scratch3: u32,
    scratch4: u32,
}

impl<'a> EmitCtx<'a> {
    fn local(&self, id: LocalId) -> u32 {
        self.local_map[id.0 as usize]
    }

    fn static_info(&self, id: StaticId) -> &HirStatic {
        &self.statics[id.0 as usize]
    }

    fn emit_static_addr(&self, f: &mut Function, offset: u32) {
        f.instruction(&Instruction::I32Const(offset as i32));
    }

    fn emit_str_concat(&mut self, f: &mut Function, left: &HirExpr, right: &HirExpr) {
        // scratch2 = left ptr, scratch3 = right ptr, scratch = result ptr
        self.emit_expr(f, left);
        f.instruction(&Instruction::LocalSet(self.scratch2));
        self.emit_expr(f, right);
        f.instruction(&Instruction::LocalSet(self.scratch3));
        // total_len = len(left) + len(right)
        f.instruction(&Instruction::LocalGet(self.scratch3));
        f.instruction(&Instruction::I32Load(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        f.instruction(&Instruction::LocalGet(self.scratch2));
        f.instruction(&Instruction::I32Load(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalTee(self.scratch));
        // alloc_size = total_len + 4
        f.instruction(&Instruction::I32Const(4));
        f.instruction(&Instruction::I32Add);
        // bump heap
        f.instruction(&Instruction::GlobalGet(0));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::GlobalSet(0));
        // result_ptr = heap_top - alloc_size
        f.instruction(&Instruction::GlobalGet(0));
        f.instruction(&Instruction::LocalGet(self.scratch));
        f.instruction(&Instruction::I32Const(4));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::I32Sub);
        f.instruction(&Instruction::LocalTee(self.scratch));
        // store total_len header
        f.instruction(&Instruction::LocalGet(self.scratch3));
        f.instruction(&Instruction::I32Load(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        f.instruction(&Instruction::LocalGet(self.scratch2));
        f.instruction(&Instruction::I32Load(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalGet(self.scratch));
        f.instruction(&Instruction::I32Store(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        // copy left bytes
        f.instruction(&Instruction::LocalGet(self.scratch));
        f.instruction(&Instruction::I32Const(4));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalGet(self.scratch2));
        f.instruction(&Instruction::I32Const(4));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalGet(self.scratch2));
        f.instruction(&Instruction::I32Load(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        f.instruction(&Instruction::MemoryCopy {
            dst_mem: 0,
            src_mem: 0,
        });
        // copy right bytes after left
        f.instruction(&Instruction::LocalGet(self.scratch2));
        f.instruction(&Instruction::I32Load(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        f.instruction(&Instruction::LocalGet(self.scratch));
        f.instruction(&Instruction::I32Const(4));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalGet(self.scratch3));
        f.instruction(&Instruction::I32Const(4));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalGet(self.scratch3));
        f.instruction(&Instruction::I32Load(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        f.instruction(&Instruction::MemoryCopy {
            dst_mem: 0,
            src_mem: 0,
        });
        f.instruction(&Instruction::LocalGet(self.scratch));
    }

    fn emit_str_substr(
        &mut self,
        f: &mut Function,
        src: &HirExpr,
        start: &HirExpr,
        len: &HirExpr,
    ) {
        // scratch2=src, scratch3=start, scratch=sublen, scratch4=result
        self.emit_expr(f, src);
        f.instruction(&Instruction::LocalSet(self.scratch2));
        self.emit_expr(f, start);
        f.instruction(&Instruction::LocalSet(self.scratch3));
        self.emit_expr(f, len);
        f.instruction(&Instruction::LocalSet(self.scratch));
        f.instruction(&Instruction::LocalGet(self.scratch));
        f.instruction(&Instruction::I32Const(4));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::GlobalGet(0));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::GlobalSet(0));
        f.instruction(&Instruction::GlobalGet(0));
        f.instruction(&Instruction::LocalGet(self.scratch));
        f.instruction(&Instruction::I32Const(4));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::I32Sub);
        f.instruction(&Instruction::LocalTee(self.scratch4));
        f.instruction(&Instruction::LocalGet(self.scratch));
        f.instruction(&Instruction::I32Store(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        f.instruction(&Instruction::LocalGet(self.scratch4));
        f.instruction(&Instruction::I32Const(4));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalGet(self.scratch2));
        f.instruction(&Instruction::I32Const(4));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalGet(self.scratch3));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalGet(self.scratch));
        f.instruction(&Instruction::MemoryCopy {
            dst_mem: 0,
            src_mem: 0,
        });
        f.instruction(&Instruction::LocalGet(self.scratch4));
    }

    fn emit_block(&mut self, f: &mut Function, block: &HirBlock) {
        for stmt in &block.stmts {
            self.emit_stmt(f, stmt);
        }
    }

    fn emit_stmt(&mut self, f: &mut Function, stmt: &HirStmt) {
        match stmt {
            HirStmt::Let { local, init, .. } | HirStmt::AssignLocal { local, value: init, .. } => {
                self.emit_expr(f, init);
                f.instruction(&Instruction::LocalSet(self.local(*local)));
            }
            HirStmt::AssignStatic { stat, ty, value, .. } => {
                self.emit_static_addr(f, self.static_info(*stat).offset);
                self.emit_expr(f, value);
                self.emit_store(f, ty);
            }
            HirStmt::AssignField {
                base,
                offset,
                field_ty,
                value,
                ..
            } => {
                self.emit_expr(f, base);
                if *offset != 0 {
                    f.instruction(&Instruction::I32Const(*offset as i32));
                    f.instruction(&Instruction::I32Add);
                }
                self.emit_expr(f, value);
                self.emit_store(f, field_ty);
            }
            HirStmt::AssignIndex {
                base,
                index,
                elem_ty,
                elem_size,
                value,
            } => {
                self.emit_expr(f, base);
                self.emit_expr(f, index);
                f.instruction(&Instruction::I32Const(*elem_size as i32));
                f.instruction(&Instruction::I32Mul);
                f.instruction(&Instruction::I32Add);
                self.emit_expr(f, value);
                self.emit_store(f, elem_ty);
            }
            HirStmt::If {
                cond,
                then_block,
                else_block,
            } => {
                self.emit_expr(f, cond);
                f.instruction(&Instruction::If(BlockType::Empty));
                self.emit_block(f, then_block);
                if let Some(eb) = else_block {
                    f.instruction(&Instruction::Else);
                    self.emit_block(f, eb);
                }
                f.instruction(&Instruction::End);
            }
            HirStmt::While { cond, body } => {
                f.instruction(&Instruction::Block(BlockType::Empty));
                f.instruction(&Instruction::Loop(BlockType::Empty));
                self.emit_expr(f, cond);
                f.instruction(&Instruction::I32Eqz);
                f.instruction(&Instruction::BrIf(1));
                self.emit_block(f, body);
                f.instruction(&Instruction::Br(0));
                f.instruction(&Instruction::End);
                f.instruction(&Instruction::End);
            }
            HirStmt::Break => {
                f.instruction(&Instruction::Br(1));
            }
            HirStmt::Continue => {
                f.instruction(&Instruction::Br(0));
            }
            HirStmt::Block(b) => self.emit_block(f, b),
            HirStmt::Return(val) => {
                if let Some(v) = val {
                    self.emit_expr(f, v);
                }
                f.instruction(&Instruction::Return);
            }
            HirStmt::Delete(_) => {}
            HirStmt::Expr(e) => {
                self.emit_expr(f, e);
                if !is_void_expr(e) {
                    f.instruction(&Instruction::Drop);
                }
            }
        }
    }

    fn emit_expr(&mut self, f: &mut Function, expr: &HirExpr) {
        match expr {
            HirExpr::Int(v) => {
                f.instruction(&Instruction::I32Const(*v));
            }
            HirExpr::Float(v) => {
                f.instruction(&Instruction::F32Const((*v).into()));
            }
            HirExpr::Bool(v) => {
                f.instruction(&Instruction::I32Const(if *v { 1 } else { 0 }));
            }
            HirExpr::Local(id, _) => {
                f.instruction(&Instruction::LocalGet(self.local(*id)));
            }
            HirExpr::Static(id, ty) => {
                self.emit_static_addr(f, self.static_info(*id).offset);
                self.emit_load(f, ty);
            }
            HirExpr::Unary { op, expr, ty } => {
                self.emit_expr(f, expr);
                match op {
                    HirUnaryOp::Neg => {
                        if matches!(ty, Type::Builtin(Builtin::F32)) {
                            f.instruction(&Instruction::F32Neg);
                        } else {
                            f.instruction(&Instruction::I32Const(-1));
                            f.instruction(&Instruction::I32Mul);
                        }
                    }
                    HirUnaryOp::Not => {
                        f.instruction(&Instruction::I32Eqz);
                    }
                }
            }
            HirExpr::Binary {
                op,
                left,
                right,
                ty,
            } => {
                if matches!(op, HirBinaryOp::And | HirBinaryOp::Or) {
                    self.emit_expr(f, left);
                    f.instruction(&Instruction::If(BlockType::Result(ValType::I32)));
                    if *op == HirBinaryOp::And {
                        self.emit_expr(f, right);
                    } else {
                        f.instruction(&Instruction::I32Const(1));
                    }
                    f.instruction(&Instruction::Else);
                    if *op == HirBinaryOp::Or {
                        self.emit_expr(f, right);
                    } else {
                        f.instruction(&Instruction::I32Const(0));
                    }
                    f.instruction(&Instruction::End);
                } else {
                    self.emit_expr(f, left);
                    self.emit_expr(f, right);
                    let operand_ty = expr_ty(left);
                    self.emit_binop(f, *op, ty, &operand_ty);
                }
            }
            HirExpr::Call { func, args, .. } => {
                for a in args {
                    self.emit_expr(f, a);
                }
                f.instruction(&Instruction::Call(IMPORT_COUNT + func.0));
            }
            HirExpr::Field {
                base,
                offset,
                ty,
                ..
            } => {
                self.emit_expr(f, base);
                if *offset != 0 {
                    f.instruction(&Instruction::I32Const(*offset as i32));
                    f.instruction(&Instruction::I32Add);
                }
                self.emit_load(f, ty);
            }
            HirExpr::Index {
                base,
                index,
                elem_ty,
                elem_size,
            } => {
                self.emit_expr(f, base);
                self.emit_expr(f, index);
                f.instruction(&Instruction::I32Const(*elem_size as i32));
                f.instruction(&Instruction::I32Mul);
                f.instruction(&Instruction::I32Add);
                self.emit_load(f, elem_ty);
            }
            HirExpr::ArrayLit {
                elem_ty,
                elem_size,
                elems,
            } => {
                let total = *elem_size * elems.len() as u32;
                f.instruction(&Instruction::GlobalGet(0));
                f.instruction(&Instruction::LocalTee(self.scratch));
                f.instruction(&Instruction::GlobalGet(0));
                f.instruction(&Instruction::I32Const(total as i32));
                f.instruction(&Instruction::I32Add);
                f.instruction(&Instruction::GlobalSet(0));
                for (i, e) in elems.iter().enumerate() {
                    f.instruction(&Instruction::LocalGet(self.scratch));
                    f.instruction(&Instruction::I32Const((*elem_size * i as u32) as i32));
                    f.instruction(&Instruction::I32Add);
                    self.emit_expr(f, e);
                    self.emit_store(f, elem_ty);
                }
                f.instruction(&Instruction::LocalGet(self.scratch));
            }
            HirExpr::StructLit { size, fields } | HirExpr::New { size, fields } => {
                let alloc_size = *size;
                f.instruction(&Instruction::GlobalGet(0));
                f.instruction(&Instruction::LocalTee(self.scratch));
                f.instruction(&Instruction::GlobalGet(0));
                f.instruction(&Instruction::I32Const(alloc_size as i32));
                f.instruction(&Instruction::I32Add);
                f.instruction(&Instruction::GlobalSet(0));
                for (off, fty, val) in fields {
                    f.instruction(&Instruction::LocalGet(self.scratch));
                    if *off != 0 {
                        f.instruction(&Instruction::I32Const(*off as i32));
                        f.instruction(&Instruction::I32Add);
                    }
                    self.emit_expr(f, val);
                    self.emit_store(f, fty);
                }
                f.instruction(&Instruction::LocalGet(self.scratch));
            }
            HirExpr::MathUnary { op, arg } => {
                as_f32_expr(f, arg, self);
                let idx = match op {
                    MathUnaryOp::Sqrt => 0,
                    MathUnaryOp::Sin => 12,
                    MathUnaryOp::Cos => 13,
                    MathUnaryOp::Tan => 14,
                    MathUnaryOp::Abs => 15,
                    MathUnaryOp::Floor => 16,
                    MathUnaryOp::Ceil => 17,
                };
                f.instruction(&Instruction::Call(idx));
            }
            HirExpr::MathBinary { op, left, right } => {
                as_f32_expr(f, left, self);
                as_f32_expr(f, right, self);
                let idx = match op {
                    MathBinaryOp::Min => 18,
                    MathBinaryOp::Max => 19,
                };
                f.instruction(&Instruction::Call(idx));
            }
            HirExpr::Rand => {
                f.instruction(&Instruction::Call(20));
            }
            HirExpr::Now => {
                f.instruction(&Instruction::Call(21));
            }
            HirExpr::AsI32(inner) => {
                as_f32_expr(f, inner, self);
                f.instruction(&Instruction::I32TruncF32S);
            }
            HirExpr::AsF32(inner) => {
                self.emit_expr(f, inner);
                f.instruction(&Instruction::F32ConvertI32S);
            }
            HirExpr::StrLen(inner) => {
                self.emit_expr(f, inner);
                f.instruction(&Instruction::Call(33));
            }
            HirExpr::StrEq { left, right } => {
                self.emit_expr(f, left);
                self.emit_expr(f, right);
                f.instruction(&Instruction::Call(34));
            }
            HirExpr::Clamp { x, lo, hi } => {
                as_f32_expr(f, x, self);
                as_f32_expr(f, lo, self);
                as_f32_expr(f, hi, self);
                f.instruction(&Instruction::Call(35));
            }
            HirExpr::Lerp { a, b, t } => {
                as_f32_expr(f, a, self);
                as_f32_expr(f, b, self);
                as_f32_expr(f, t, self);
                f.instruction(&Instruction::Call(36));
            }
            HirExpr::Pow { base, exp } => {
                as_f32_expr(f, base, self);
                as_f32_expr(f, exp, self);
                f.instruction(&Instruction::Call(37));
            }
            HirExpr::Sign(inner) => {
                as_f32_expr(f, inner, self);
                f.instruction(&Instruction::Call(38));
            }
            HirExpr::Fmod { x, y } => {
                as_f32_expr(f, x, self);
                as_f32_expr(f, y, self);
                f.instruction(&Instruction::Call(39));
            }
            HirExpr::Smoothstep { edge0, edge1, x } => {
                as_f32_expr(f, edge0, self);
                as_f32_expr(f, edge1, self);
                as_f32_expr(f, x, self);
                f.instruction(&Instruction::Call(40));
            }
            HirExpr::DegToRad(inner) => {
                as_f32_expr(f, inner, self);
                f.instruction(&Instruction::Call(41));
            }
            HirExpr::RadToDeg(inner) => {
                as_f32_expr(f, inner, self);
                f.instruction(&Instruction::Call(42));
            }
            HirExpr::Dist2 { x1, y1, x2, y2 } => {
                as_f32_expr(f, x1, self);
                as_f32_expr(f, y1, self);
                as_f32_expr(f, x2, self);
                as_f32_expr(f, y2, self);
                f.instruction(&Instruction::Call(43));
            }
            HirExpr::Pi => {
                f.instruction(&Instruction::Call(44));
            }
            HirExpr::AbsI32(inner) => {
                self.emit_expr(f, inner);
                f.instruction(&Instruction::Call(45));
            }
            HirExpr::IMin { a, b } => {
                self.emit_expr(f, a);
                self.emit_expr(f, b);
                f.instruction(&Instruction::Call(46));
            }
            HirExpr::IMax { a, b } => {
                self.emit_expr(f, a);
                self.emit_expr(f, b);
                f.instruction(&Instruction::Call(47));
            }
            HirExpr::IClamp { x, lo, hi } => {
                self.emit_expr(f, x);
                self.emit_expr(f, lo);
                self.emit_expr(f, hi);
                f.instruction(&Instruction::Call(48));
            }
            HirExpr::StrConcat { left, right } => {
                self.emit_str_concat(f, left, right);
            }
            HirExpr::StrSubstr { src, start, len } => {
                self.emit_str_substr(f, src, start, len);
            }
            HirExpr::Len2 { x, y } => {
                as_f32_expr(f, x, self);
                as_f32_expr(f, y, self);
                f.instruction(&Instruction::Call(49));
            }
            HirExpr::Dot2 { x1, y1, x2, y2 } => {
                as_f32_expr(f, x1, self);
                as_f32_expr(f, y1, self);
                as_f32_expr(f, x2, self);
                as_f32_expr(f, y2, self);
                f.instruction(&Instruction::Call(50));
            }
            HirExpr::StrLit(bytes) => {
                let alloc_size = 4 + bytes.len() as u32;
                f.instruction(&Instruction::GlobalGet(0));
                f.instruction(&Instruction::LocalTee(self.scratch));
                f.instruction(&Instruction::GlobalGet(0));
                f.instruction(&Instruction::I32Const(alloc_size as i32));
                f.instruction(&Instruction::I32Add);
                f.instruction(&Instruction::GlobalSet(0));
                f.instruction(&Instruction::LocalGet(self.scratch));
                f.instruction(&Instruction::I32Const(bytes.len() as i32));
                f.instruction(&Instruction::I32Store(MemArg {
                    offset: 0,
                    align: 2,
                    memory_index: 0,
                }));
                for (i, b) in bytes.iter().enumerate() {
                    f.instruction(&Instruction::LocalGet(self.scratch));
                    f.instruction(&Instruction::I32Const(*b as i32));
                    f.instruction(&Instruction::I32Store8(MemArg {
                        offset: 4 + i as u64,
                        align: 0,
                        memory_index: 0,
                    }));
                }
                f.instruction(&Instruction::LocalGet(self.scratch));
            }
            HirExpr::PrintStr(inner) => {
                self.emit_expr(f, inner);
                f.instruction(&Instruction::Call(2));
            }
            HirExpr::PrintI32(inner) => {
                self.emit_expr(f, inner);
                f.instruction(&Instruction::Call(3));
            }
            HirExpr::PrintF32(inner) => {
                as_f32_expr(f, inner, self);
                f.instruction(&Instruction::Call(4));
            }
            HirExpr::CanvasInit { w, h } => {
                self.emit_expr(f, w);
                self.emit_expr(f, h);
                f.instruction(&Instruction::Call(5));
            }
            HirExpr::CanvasClear { r, g, b, a } => {
                as_f32_expr(f, r, self);
                as_f32_expr(f, g, self);
                as_f32_expr(f, b, self);
                as_f32_expr(f, a, self);
                f.instruction(&Instruction::Call(6));
            }
            HirExpr::CanvasFillRect {
                x, y, w, h, r, g, b, a,
            } => {
                for e in [x, y, w, h, r, g, b, a] {
                    as_f32_expr(f, e, self);
                }
                f.instruction(&Instruction::Call(7));
            }
            HirExpr::CanvasFillCircle {
                x,
                y,
                radius,
                r,
                g,
                b,
                a,
            } => {
                for e in [x, y, radius, r, g, b, a] {
                    as_f32_expr(f, e, self);
                }
                f.instruction(&Instruction::Call(8));
            }
            HirExpr::CanvasFillText {
                text,
                x,
                y,
                r,
                g,
                b,
                a,
            } => {
                self.emit_expr(f, text);
                for e in [x, y, r, g, b, a] {
                    as_f32_expr(f, e, self);
                }
                f.instruction(&Instruction::Call(9));
            }
            HirExpr::CanvasDrawLine {
                x1,
                y1,
                x2,
                y2,
                width,
                r,
                g,
                b,
                a,
            } => {
                for e in [x1, y1, x2, y2, width, r, g, b, a] {
                    as_f32_expr(f, e, self);
                }
                f.instruction(&Instruction::Call(51));
            }
            HirExpr::CanvasStrokeRect {
                x,
                y,
                w,
                h,
                width,
                r,
                g,
                b,
                a,
            } => {
                for e in [x, y, w, h, width, r, g, b, a] {
                    as_f32_expr(f, e, self);
                }
                f.instruction(&Instruction::Call(52));
            }
            HirExpr::GpuClear { r, g, b, a } => {
                as_f32_expr(f, r, self);
                as_f32_expr(f, g, self);
                as_f32_expr(f, b, self);
                as_f32_expr(f, a, self);
                f.instruction(&Instruction::Call(10));
            }
            HirExpr::GpuDrawTriangle => {
                f.instruction(&Instruction::Call(11));
            }
            HirExpr::KeyDown(code) => {
                self.emit_expr(f, code);
                f.instruction(&Instruction::Call(22));
            }
            HirExpr::MouseX => {
                f.instruction(&Instruction::Call(23));
            }
            HirExpr::MouseY => {
                f.instruction(&Instruction::Call(24));
            }
            HirExpr::MouseDown(btn) => {
                self.emit_expr(f, btn);
                f.instruction(&Instruction::Call(25));
            }
            HirExpr::Scene3dInit { w, h } => {
                self.emit_expr(f, w);
                self.emit_expr(f, h);
                f.instruction(&Instruction::Call(26));
            }
            HirExpr::Camera3dPerspective {
                fov,
                aspect,
                near,
                far,
            } => {
                for e in [fov, aspect, near, far] {
                    as_f32_expr(f, e, self);
                }
                f.instruction(&Instruction::Call(27));
            }
            HirExpr::Mesh3dBox { sx, sy, sz } => {
                for e in [sx, sy, sz] {
                    as_f32_expr(f, e, self);
                }
                f.instruction(&Instruction::Call(28));
            }
            HirExpr::Mesh3dSetPose {
                mesh,
                tx,
                ty,
                tz,
                rx,
                ry,
                rz,
            } => {
                self.emit_expr(f, mesh);
                for e in [tx, ty, tz, rx, ry, rz] {
                    as_f32_expr(f, e, self);
                }
                f.instruction(&Instruction::Call(29));
            }
            HirExpr::Mesh3dRotate {
                mesh,
                drx,
                dry,
                drz,
            } => {
                self.emit_expr(f, mesh);
                for e in [drx, dry, drz] {
                    as_f32_expr(f, e, self);
                }
                f.instruction(&Instruction::Call(30));
            }
            HirExpr::Scene3dClear { r, g, b, a } => {
                for e in [r, g, b, a] {
                    as_f32_expr(f, e, self);
                }
                f.instruction(&Instruction::Call(31));
            }
            HirExpr::Scene3dDraw { mesh, cam } => {
                self.emit_expr(f, mesh);
                self.emit_expr(f, cam);
                f.instruction(&Instruction::Call(32));
            }
        }
    }

    fn emit_binop(&self, f: &mut Function, op: HirBinaryOp, _result_ty: &Type, operand_ty: &Type) {
        match (op, operand_ty) {
            (HirBinaryOp::Add, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Add);
            }
            (HirBinaryOp::Sub, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Sub);
            }
            (HirBinaryOp::Mul, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Mul);
            }
            (HirBinaryOp::Div, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Div);
            }
            (HirBinaryOp::Add, _) => {
                f.instruction(&Instruction::I32Add);
            }
            (HirBinaryOp::Sub, _) => {
                f.instruction(&Instruction::I32Sub);
            }
            (HirBinaryOp::Mul, _) => {
                f.instruction(&Instruction::I32Mul);
            }
            (HirBinaryOp::Div, _) => {
                f.instruction(&Instruction::I32DivS);
            }
            (HirBinaryOp::Rem, _) => {
                f.instruction(&Instruction::I32RemS);
            }
            (HirBinaryOp::Eq, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Eq);
            }
            (HirBinaryOp::Ne, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Ne);
            }
            (HirBinaryOp::Lt, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Lt);
            }
            (HirBinaryOp::Le, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Le);
            }
            (HirBinaryOp::Gt, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Gt);
            }
            (HirBinaryOp::Ge, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Ge);
            }
            (HirBinaryOp::Eq, _) => {
                f.instruction(&Instruction::I32Eq);
            }
            (HirBinaryOp::Ne, _) => {
                f.instruction(&Instruction::I32Ne);
            }
            (HirBinaryOp::Lt, _) => {
                f.instruction(&Instruction::I32LtS);
            }
            (HirBinaryOp::Le, _) => {
                f.instruction(&Instruction::I32LeS);
            }
            (HirBinaryOp::Gt, _) => {
                f.instruction(&Instruction::I32GtS);
            }
            (HirBinaryOp::Ge, _) => {
                f.instruction(&Instruction::I32GeS);
            }
            (HirBinaryOp::And | HirBinaryOp::Or, _) => unreachable!(),
        }
    }

    fn emit_load(&self, f: &mut Function, ty: &Type) {
        let arg = MemArg {
            offset: 0,
            align: match ty.align() {
                8 => 3,
                4 => 2,
                _ => 0,
            },
            memory_index: 0,
        };
        match ty {
            Type::Builtin(Builtin::F32) => {
                f.instruction(&Instruction::F32Load(arg));
            }
            Type::Builtin(Builtin::F64) => {
                f.instruction(&Instruction::F64Load(arg));
            }
            Type::Builtin(Builtin::I64) => {
                f.instruction(&Instruction::I64Load(arg));
            }
            _ => {
                f.instruction(&Instruction::I32Load(arg));
            }
        }
    }

    fn emit_store(&self, f: &mut Function, ty: &Type) {
        let arg = MemArg {
            offset: 0,
            align: match ty.align() {
                8 => 3,
                4 => 2,
                _ => 0,
            },
            memory_index: 0,
        };
        match ty {
            Type::Builtin(Builtin::F32) => {
                f.instruction(&Instruction::F32Store(arg));
            }
            Type::Builtin(Builtin::F64) => {
                f.instruction(&Instruction::F64Store(arg));
            }
            Type::Builtin(Builtin::I64) => {
                f.instruction(&Instruction::I64Store(arg));
            }
            _ => {
                f.instruction(&Instruction::I32Store(arg));
            }
        }
    }
}

fn expr_ty(expr: &HirExpr) -> Type {
    match expr {
        HirExpr::Int(_) => Type::Builtin(Builtin::I32),
        HirExpr::Float(_) => Type::Builtin(Builtin::F32),
        HirExpr::Bool(_) => Type::Builtin(Builtin::Bool),
        HirExpr::Local(_, t) | HirExpr::Static(_, t) => t.clone(),
        HirExpr::Unary { ty, .. } | HirExpr::Binary { ty, .. } | HirExpr::Call { ty, .. } => {
            ty.clone()
        }
        HirExpr::Field { ty, .. } | HirExpr::Index { elem_ty: ty, .. } => ty.clone(),
        HirExpr::ArrayLit { elem_ty, elems, .. } => Type::Array {
            elem: Box::new(elem_ty.clone()),
            len: elems.len() as u32,
        },
        HirExpr::StructLit { .. } | HirExpr::New { .. } => Type::Builtin(Builtin::I32),
        HirExpr::MathUnary { .. }
        | HirExpr::MathBinary { .. }
        | HirExpr::Rand
        | HirExpr::Now
        | HirExpr::AsF32(_)
        | HirExpr::MouseX
        | HirExpr::MouseY => Type::Builtin(Builtin::F32),
        HirExpr::AsI32(_)
        | HirExpr::StrLen(_)
        | HirExpr::KeyDown(_)
        | HirExpr::MouseDown(_)
        | HirExpr::Camera3dPerspective { .. }
        | HirExpr::Mesh3dBox { .. } => Type::Builtin(Builtin::I32),
        HirExpr::StrLit(_) => Type::Builtin(Builtin::Str),
        HirExpr::StrConcat { .. } | HirExpr::StrSubstr { .. } => Type::Builtin(Builtin::Str),
        HirExpr::StrEq { .. } => Type::Builtin(Builtin::Bool),
        HirExpr::Clamp { .. } | HirExpr::Lerp { .. } | HirExpr::Pow { .. } | HirExpr::Fmod { .. }
        | HirExpr::Smoothstep { .. } | HirExpr::DegToRad { .. } | HirExpr::RadToDeg { .. }
        | HirExpr::Dist2 { .. } | HirExpr::Len2 { .. } | HirExpr::Dot2 { .. } | HirExpr::Pi => {
            Type::Builtin(Builtin::F32)
        }
        HirExpr::Sign(_) => Type::Builtin(Builtin::F32),
        HirExpr::AbsI32(_) | HirExpr::IMin { .. } | HirExpr::IMax { .. } | HirExpr::IClamp { .. } => {
            Type::Builtin(Builtin::I32)
        }
        _ => Type::Builtin(Builtin::Void),
    }
}
