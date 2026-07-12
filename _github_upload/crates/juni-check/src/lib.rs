//! Juni typechecker and high-level IR.

pub mod diag;
pub mod hir;
pub mod types;

pub use diag::{diagnostics_to_json, Diagnostic, DiagnosticJson, Severity};
pub use hir::HirModule;

use std::collections::HashMap;

use juni_syntax::{
    BinaryOp, Block, Expr, ExprKind, FnDef, Item, Module, Stmt,
    StructDef, TypeExpr, TypeExprKind, UnaryOp,
};

use crate::hir::*;
use crate::types::{Builtin, StructLayout, Type};

#[derive(Debug)]
pub struct CheckResult {
    pub module: HirModule,
    pub diagnostics: Vec<Diagnostic>,
}

pub fn check(module: &Module) -> CheckResult {
    let mut checker = Checker::new();
    checker.check_module(module);
    CheckResult {
        module: checker.hir,
        diagnostics: checker.diagnostics,
    }
}

pub fn check_ok(module: &Module) -> Result<HirModule, Vec<Diagnostic>> {
    let result = check(module);
    if result
        .diagnostics
        .iter()
        .any(|d| d.severity == Severity::Error)
    {
        Err(result.diagnostics)
    } else {
        Ok(result.module)
    }
}

struct Checker {
    structs: HashMap<String, StructLayout>,
    functions: HashMap<String, FnSig>,
    statics: HashMap<String, (Type, StaticId)>,
    locals: Vec<HashMap<String, (Type, LocalId)>>,
    next_local: u32,
    loop_depth: u32,
    current_ret: Type,
    current_fn: String,
    main_let_names: Vec<String>,
    has_frame: bool,
    hir: HirModule,
    diagnostics: Vec<Diagnostic>,
    fn_local_types: Vec<Type>,
}

#[derive(Clone)]
struct FnSig {
    params: Vec<Type>,
    ret: Type,
    id: FuncId,
}

#[derive(Clone)]
enum VarRef {
    Local(Type, LocalId),
    Static(Type, StaticId),
}

impl Checker {
    fn new() -> Self {
        Self {
            structs: HashMap::new(),
            functions: HashMap::new(),
            statics: HashMap::new(),
            locals: Vec::new(),
            next_local: 0,
            loop_depth: 0,
            current_ret: Type::Builtin(Builtin::I32),
            current_fn: String::new(),
            main_let_names: Vec::new(),
            has_frame: false,
            hir: HirModule {
                structs: Vec::new(),
                statics: Vec::new(),
                static_region_size: 0,
                init_globals: HirBlock { stmts: vec![] },
                functions: Vec::new(),
            },
            diagnostics: Vec::new(),
            fn_local_types: Vec::new(),
        }
    }

    fn error(&mut self, span: juni_syntax::Span, msg: impl Into<String>) {
        self.diagnostics.push(Diagnostic {
            severity: Severity::Error,
            span,
            message: msg.into(),
        });
    }

    fn push_scope(&mut self) {
        self.locals.push(HashMap::new());
    }

    fn pop_scope(&mut self) {
        self.locals.pop();
    }

    fn declare_local(&mut self, name: String, ty: Type) -> LocalId {
        let id = LocalId(self.next_local);
        self.next_local += 1;
        self.fn_local_types.push(ty.clone());
        if let Some(scope) = self.locals.last_mut() {
            scope.insert(name, (ty, id));
        }
        id
    }

    fn lookup_local(&self, name: &str) -> Option<(Type, LocalId)> {
        for scope in self.locals.iter().rev() {
            if let Some(v) = scope.get(name) {
                return Some(v.clone());
            }
        }
        None
    }

    fn lookup_var(&self, name: &str) -> Option<VarRef> {
        if let Some((ty, id)) = self.lookup_local(name) {
            return Some(VarRef::Local(ty, id));
        }
        if let Some((ty, id)) = self.statics.get(name) {
            return Some(VarRef::Static(ty.clone(), *id));
        }
        None
    }

    fn resolve_type(&mut self, te: &TypeExpr) -> Type {
        match &te.kind {
            TypeExprKind::Named(name) => match name.as_str() {
                "i32" => Type::Builtin(Builtin::I32),
                "i64" => Type::Builtin(Builtin::I64),
                "f32" => Type::Builtin(Builtin::F32),
                "f64" => Type::Builtin(Builtin::F64),
                "bool" => Type::Builtin(Builtin::Bool),
                "void" => Type::Builtin(Builtin::Void),
                "str" => Type::Builtin(Builtin::Str),
                other => {
                    if self.structs.contains_key(other) {
                        Type::Struct(other.to_string())
                    } else {
                        self.error(te.span, format!("unknown type `{other}`"));
                        Type::Builtin(Builtin::I32)
                    }
                }
            },
            TypeExprKind::Array { elem, len } => Type::Array {
                elem: Box::new(self.resolve_type(elem)),
                len: *len,
            },
            TypeExprKind::Ref { mutable, inner } => Type::Ref {
                mutable: *mutable,
                inner: Box::new(self.resolve_type(inner)),
            },
        }
    }

    fn check_module(&mut self, module: &Module) {
        self.has_frame = module.items.iter().any(|i| {
            matches!(i, Item::Fn(f) if f.name == "frame")
        });
        // Collect structs first
        for item in &module.items {
            if let Item::Struct(s) = item {
                self.collect_struct(s);
            }
        }
        // Collect function signatures (before static init exprs may call functions)
        for item in &module.items {
            if let Item::Fn(f) = item {
                self.collect_fn_sig(f);
            }
        }
        // Module-level statics
        for item in &module.items {
            match item {
                Item::Global(g) => self.collect_static_binding(
                    &g.name,
                    g.ty.as_ref(),
                    &g.init,
                    g.span,
                ),
                Item::State(s) => {
                    for field in &s.fields {
                        self.collect_static_binding(
                            &field.name,
                            Some(&field.ty),
                            &field.init,
                            field.span,
                        );
                    }
                }
                _ => {}
            }
        }
        self.finalize_static_layout();
        // Record lets declared inside main (for diagnostics)
        for item in &module.items {
            if let Item::Fn(f) = item {
                if f.name == "main" {
                    self.collect_main_lets(f);
                }
            }
        }
        // Check bodies
        for item in &module.items {
            if let Item::Fn(f) = item {
                self.check_fn(f);
            }
        }
    }

    fn collect_main_lets(&mut self, f: &FnDef) {
        fn walk(block: &Block, out: &mut Vec<String>) {
            for stmt in &block.stmts {
                match stmt {
                    Stmt::Let { name, .. } => out.push(name.clone()),
                    Stmt::If {
                        then_block,
                        else_block,
                        ..
                    } => {
                        walk(then_block, out);
                        if let Some(eb) = else_block {
                            walk(eb, out);
                        }
                    }
                    Stmt::While { body, .. } | Stmt::For { body, .. } => walk(body, out),
                    _ => {}
                }
            }
        }
        walk(&f.body, &mut self.main_let_names);
    }

    fn collect_static_binding(
        &mut self,
        name: &str,
        ty_ann: Option<&TypeExpr>,
        init: &Expr,
        span: juni_syntax::Span,
    ) {
        if self.statics.contains_key(name) {
            self.error(span, format!("duplicate static `{name}`"));
            return;
        }
        if self.functions.contains_key(name) {
            self.error(span, format!("`{name}` already defined as a function"));
            return;
        }
        let (init_expr, init_ty) = self.check_expr(init);
        let ty = if let Some(ann) = ty_ann {
            let t = self.resolve_type(ann);
            if !types_compatible(&t, &init_ty) {
                self.error(
                    span,
                    format!("type mismatch: expected {}, got {}", t, init_ty),
                );
            }
            t
        } else {
            init_ty
        };
        let id = StaticId(self.hir.statics.len() as u32);
        self.statics.insert(name.to_string(), (ty.clone(), id));
        self.hir.statics.push(HirStatic {
            id,
            name: name.to_string(),
            ty,
            offset: 0,
            init: init_expr,
        });
    }

    fn finalize_static_layout(&mut self) {
        let mut offset = 0u32;
        let mut init_stmts = Vec::new();
        for stat in &mut self.hir.statics {
            offset = align_up(offset, stat.ty.align());
            stat.offset = offset;
            init_stmts.push(HirStmt::AssignStatic {
                stat: stat.id,
                ty: stat.ty.clone(),
                value: stat.init.clone(),
            });
            offset += stat.ty.size(&self.structs);
        }
        self.hir.static_region_size = align_up(offset, 4);
        self.hir.init_globals = HirBlock { stmts: init_stmts };
    }

    fn collect_struct(&mut self, s: &StructDef) {
        if self.structs.contains_key(&s.name) {
            self.error(s.span, format!("duplicate struct `{}`", s.name));
            return;
        }
        let mut fields = Vec::new();
        let mut offset = 0u32;
        for f in &s.fields {
            let ty = self.resolve_type(&f.ty);
            let align = ty.align();
            let size = ty.size(&self.structs);
            offset = align_up(offset, align);
            fields.push(types::FieldLayout {
                name: f.name.clone(),
                ty: ty.clone(),
                offset,
            });
            offset += size;
        }
        let size = align_up(offset, 4);
        let layout = StructLayout {
            name: s.name.clone(),
            fields: fields.clone(),
            size,
        };
        self.structs.insert(s.name.clone(), layout.clone());
        self.hir.structs.push(layout);
    }

    fn collect_fn_sig(&mut self, f: &FnDef) {
        if self.functions.contains_key(&f.name) {
            self.error(f.span, format!("duplicate function `{}`", f.name));
            return;
        }
        let params: Vec<Type> = f.params.iter().map(|p| self.resolve_type(&p.ty)).collect();
        let ret = self.resolve_type(&f.ret);
        let id = FuncId(self.functions.len() as u32);
        self.functions.insert(
            f.name.clone(),
            FnSig {
                params,
                ret,
                id,
            },
        );
    }

    fn check_fn(&mut self, f: &FnDef) {
        let sig = self.functions.get(&f.name).cloned().unwrap();
        self.next_local = 0;
        self.fn_local_types.clear();
        self.current_ret = sig.ret.clone();
        self.current_fn = f.name.clone();
        self.locals.clear();
        self.push_scope();

        let mut param_locals = Vec::new();
        for (param, ty) in f.params.iter().zip(sig.params.iter()) {
            let id = self.declare_local(param.name.clone(), ty.clone());
            param_locals.push((id, ty.clone()));
        }

        let body = self.check_block(&f.body);
        self.pop_scope();

        self.hir.functions.push(HirFunction {
            id: sig.id,
            name: f.name.clone(),
            params: param_locals,
            ret: sig.ret,
            locals: self.fn_local_types.clone(),
            body,
            export: f.name == "main" || f.name == "frame",
        });
    }

    fn check_block(&mut self, block: &Block) -> HirBlock {
        self.push_scope();
        let mut stmts = Vec::new();
        for stmt in &block.stmts {
            stmts.push(self.check_stmt(stmt));
        }
        self.pop_scope();
        HirBlock { stmts }
    }

    fn check_stmt(&mut self, stmt: &Stmt) -> HirStmt {
        match stmt {
            Stmt::Let {
                name, ty, init, span, ..
            } => {
                let (init_expr, init_ty) = self.check_expr(init);
                let ty = if let Some(ann) = ty {
                    let t = self.resolve_type(ann);
                    if !types_compatible(&t, &init_ty) {
                        self.error(*span, format!("type mismatch: expected {}, got {}", t, init_ty));
                    }
                    t
                } else {
                    init_ty
                };
                let id = self.declare_local(name.clone(), ty.clone());
                HirStmt::Let {
                    local: id,
                    ty,
                    init: init_expr,
                }
            }
            Stmt::Assign { target, value, span } => {
                let (val, val_ty) = self.check_expr(value);
                match &target.kind {
                    ExprKind::Ident(name) => {
                        match self.lookup_var(name) {
                            Some(VarRef::Local(ty, id)) => {
                                if !types_compatible(&ty, &val_ty) {
                                    self.error(*span, format!("cannot assign {} to {}", val_ty, ty));
                                }
                                HirStmt::AssignLocal {
                                    local: id,
                                    ty,
                                    value: val,
                                }
                            }
                            Some(VarRef::Static(ty, id)) => {
                                if !types_compatible(&ty, &val_ty) {
                                    self.error(*span, format!("cannot assign {} to {}", val_ty, ty));
                                }
                                HirStmt::AssignStatic {
                                    stat: id,
                                    ty,
                                    value: val,
                                }
                            }
                            None => {
                                self.error(*span, format!("undefined variable `{name}`"));
                                HirStmt::Expr(val)
                            }
                        }
                    }
                    ExprKind::Field { base, field } => {
                        let (base_e, base_ty) = self.check_expr(base);
                        let (fty, offset) = self.field_info(&base_ty, field, *span);
                        if !types_compatible(&fty, &val_ty) {
                            self.error(*span, format!("cannot assign {} to field {}", val_ty, fty));
                        }
                        HirStmt::AssignField {
                            base: base_e,
                            base_ty,
                            offset,
                            field_ty: fty,
                            value: val,
                        }
                    }
                    ExprKind::Index { base, index } => {
                        let (base_e, base_ty) = self.check_expr(base);
                        let (idx_e, idx_ty) = self.check_expr(index);
                        if !matches!(idx_ty, Type::Builtin(Builtin::I32)) {
                            self.error(index.span, "array index must be i32");
                        }
                        match &base_ty {
                            Type::Array { elem, .. } => {
                                if !types_compatible(elem, &val_ty) {
                                    self.error(
                                        *span,
                                        format!("cannot assign {} to array element {}", val_ty, elem),
                                    );
                                }
                                let elem_size = elem.size(&self.structs);
                                HirStmt::AssignIndex {
                                    base: base_e,
                                    index: idx_e,
                                    elem_ty: *elem.clone(),
                                    elem_size,
                                    value: val,
                                }
                            }
                            _ => {
                                self.error(*span, "index assignment requires an array");
                                HirStmt::Expr(val)
                            }
                        }
                    }
                    _ => {
                        self.error(*span, "invalid assignment target");
                        HirStmt::Expr(val)
                    }
                }
            }
            Stmt::If {
                cond,
                then_block,
                else_block,
                ..
            } => {
                let (c, cty) = self.check_expr(cond);
                if !matches!(cty, Type::Builtin(Builtin::Bool)) {
                    self.error(cond.span, "condition must be bool");
                }
                let then_b = self.check_block(then_block);
                let else_b = else_block.as_ref().map(|b| self.check_block(b));
                HirStmt::If {
                    cond: c,
                    then_block: then_b,
                    else_block: else_b,
                }
            }
            Stmt::While { cond, body, .. } => {
                let (c, cty) = self.check_expr(cond);
                if !matches!(cty, Type::Builtin(Builtin::Bool)) {
                    self.error(cond.span, "condition must be bool");
                }
                self.loop_depth += 1;
                let body = self.check_block(body);
                self.loop_depth -= 1;
                HirStmt::While { cond: c, body }
            }
            Stmt::For {
                var,
                start,
                end,
                body,
                span,
            } => {
                // Desugar: let var = start; while var < end: body; var = var + 1
                let (start_e, start_ty) = self.check_expr(start);
                let (end_e, end_ty) = self.check_expr(end);
                if !matches!(start_ty, Type::Builtin(Builtin::I32))
                    || !matches!(end_ty, Type::Builtin(Builtin::I32))
                {
                    self.error(*span, "`for` range bounds must be i32");
                }
                self.push_scope();
                let id = self.declare_local(var.clone(), Type::Builtin(Builtin::I32));
                self.loop_depth += 1;
                let mut body_hir = self.check_block(body);
                self.loop_depth -= 1;
                // append var = var + 1
                body_hir.stmts.push(HirStmt::AssignLocal {
                    local: id,
                    ty: Type::Builtin(Builtin::I32),
                    value: HirExpr::Binary {
                        op: HirBinaryOp::Add,
                        left: Box::new(HirExpr::Local(id, Type::Builtin(Builtin::I32))),
                        right: Box::new(HirExpr::Int(1)),
                        ty: Type::Builtin(Builtin::I32),
                    },
                });
                self.pop_scope();
                HirStmt::Block(HirBlock {
                    stmts: vec![
                        HirStmt::Let {
                            local: id,
                            ty: Type::Builtin(Builtin::I32),
                            init: start_e,
                        },
                        HirStmt::While {
                            cond: HirExpr::Binary {
                                op: HirBinaryOp::Lt,
                                left: Box::new(HirExpr::Local(id, Type::Builtin(Builtin::I32))),
                                right: Box::new(end_e),
                                ty: Type::Builtin(Builtin::Bool),
                            },
                            body: body_hir,
                        },
                    ],
                })
            }
            Stmt::Break { span } => {
                if self.loop_depth == 0 {
                    self.error(*span, "`break` outside of loop");
                }
                HirStmt::Break
            }
            Stmt::Continue { span } => {
                if self.loop_depth == 0 {
                    self.error(*span, "`continue` outside of loop");
                }
                HirStmt::Continue
            }
            Stmt::Return { value, span } => {
                if let Some(v) = value {
                    let (e, ty) = self.check_expr(v);
                    if !types_compatible(&self.current_ret, &ty) {
                        self.error(
                            *span,
                            format!("return type mismatch: expected {}, got {}", self.current_ret, ty),
                        );
                    }
                    HirStmt::Return(Some(e))
                } else {
                    if !matches!(self.current_ret, Type::Builtin(Builtin::Void)) {
                        self.error(*span, "missing return value");
                    }
                    HirStmt::Return(None)
                }
            }
            Stmt::Delete { value, span } => {
                let (e, ty) = self.check_expr(value);
                match ty {
                    Type::Ref { .. } | Type::Struct(_) => HirStmt::Delete(e),
                    _ => {
                        self.error(*span, "delete requires a pointer or struct address");
                        HirStmt::Expr(e)
                    }
                }
            }
            Stmt::Expr { expr, .. } => {
                let (e, _) = self.check_expr(expr);
                HirStmt::Expr(e)
            }
        }
    }

    fn field_info(&mut self, base_ty: &Type, field: &str, span: juni_syntax::Span) -> (Type, u32) {
        let struct_name = match base_ty {
            Type::Struct(n) => n.clone(),
            Type::Ref { inner, .. } => match inner.as_ref() {
                Type::Struct(n) => n.clone(),
                _ => {
                    self.error(span, "field access on non-struct");
                    return (Type::Builtin(Builtin::I32), 0);
                }
            },
            _ => {
                self.error(span, "field access on non-struct");
                return (Type::Builtin(Builtin::I32), 0);
            }
        };
        if let Some(layout) = self.structs.get(&struct_name) {
            if let Some(f) = layout.fields.iter().find(|f| f.name == field) {
                return (f.ty.clone(), f.offset);
            }
            self.error(span, format!("no field `{field}` on `{struct_name}`"));
        } else {
            self.error(span, format!("unknown struct `{struct_name}`"));
        }
        (Type::Builtin(Builtin::I32), 0)
    }

    fn check_expr(&mut self, expr: &Expr) -> (HirExpr, Type) {
        match &expr.kind {
            ExprKind::Int(v) => (
                HirExpr::Int(*v as i32),
                Type::Builtin(Builtin::I32),
            ),
            ExprKind::Float(v) => (
                HirExpr::Float(*v as f32),
                Type::Builtin(Builtin::F32),
            ),
            ExprKind::Bool(v) => (HirExpr::Bool(*v), Type::Builtin(Builtin::Bool)),
            ExprKind::Str(s) => (
                HirExpr::StrLit(s.as_bytes().to_vec()),
                Type::Builtin(Builtin::Str),
            ),
            ExprKind::Ident(name) => {
                match self.lookup_var(name) {
                    Some(VarRef::Local(ty, id)) => (HirExpr::Local(id, ty.clone()), ty),
                    Some(VarRef::Static(ty, id)) => (HirExpr::Static(id, ty.clone()), ty),
                    None if self.functions.contains_key(name) => {
                        self.error(expr.span, format!("`{name}` is a function; call it with ()"));
                        (HirExpr::Int(0), Type::Builtin(Builtin::I32))
                    }
                    None => {
                        let hint = if self.current_fn == "frame"
                            && self.main_let_names.iter().any(|n| n == name)
                        {
                            format!(
                                "undefined variable `{name}` (declared in `main` but not visible in `frame`; use module-level `let` or a `state:` block)"
                            )
                        } else {
                            format!("undefined variable `{name}`")
                        };
                        self.error(expr.span, hint);
                        (HirExpr::Int(0), Type::Builtin(Builtin::I32))
                    }
                }
            }
            ExprKind::Unary { op, expr: inner } => {
                let (e, ty) = self.check_expr(inner);
                match op {
                    UnaryOp::Neg => {
                        if !ty.is_numeric() {
                            self.error(expr.span, "unary `-` requires a number");
                        }
                        (HirExpr::Unary { op: HirUnaryOp::Neg, expr: Box::new(e), ty: ty.clone() }, ty)
                    }
                    UnaryOp::Not => {
                        if !matches!(ty, Type::Builtin(Builtin::Bool)) {
                            self.error(expr.span, "`not` requires bool");
                        }
                        (
                            HirExpr::Unary {
                                op: HirUnaryOp::Not,
                                expr: Box::new(e),
                                ty: Type::Builtin(Builtin::Bool),
                            },
                            Type::Builtin(Builtin::Bool),
                        )
                    }
                }
            }
            ExprKind::Binary { op, left, right } => {
                let (l, lt) = self.check_expr(left);
                let (r, rt) = self.check_expr(right);
                self.check_binary(*op, lt, rt, expr.span, l, r)
            }
            ExprKind::Call { callee, args } => {
                // Intrinsics
                if let ExprKind::Ident(name) = &callee.kind {
                    if let Some(intrinsic) = self.check_host_intrinsic(name, args, expr.span) {
                        return intrinsic;
                    }
                    if let Some(sig) = self.functions.get(name).cloned() {
                        if args.len() != sig.params.len() {
                            self.error(
                                expr.span,
                                format!(
                                    "`{name}` expects {} args, got {}",
                                    sig.params.len(),
                                    args.len()
                                ),
                            );
                        }
                        let mut hir_args = Vec::new();
                        for (i, arg) in args.iter().enumerate() {
                            let (e, ty) = self.check_expr(arg);
                            if let Some(expected) = sig.params.get(i) {
                                if !types_compatible(expected, &ty) {
                                    self.error(
                                        arg.span,
                                        format!("argument type mismatch: expected {}, got {}", expected, ty),
                                    );
                                }
                            }
                            hir_args.push(e);
                        }
                        return (
                            HirExpr::Call {
                                func: sig.id,
                                args: hir_args,
                                ty: sig.ret.clone(),
                            },
                            sig.ret,
                        );
                    }
                    self.error(expr.span, format!("unknown function `{name}`"));
                    return (HirExpr::Int(0), Type::Builtin(Builtin::I32));
                }
                self.error(expr.span, "invalid call target");
                (HirExpr::Int(0), Type::Builtin(Builtin::I32))
            }
            ExprKind::Field { base, field } => {
                let (base_e, base_ty) = self.check_expr(base);
                let (fty, offset) = self.field_info(&base_ty, field, expr.span);
                (
                    HirExpr::Field {
                        base: Box::new(base_e),
                        base_ty: base_ty.clone(),
                        offset,
                        ty: fty.clone(),
                    },
                    fty,
                )
            }
            ExprKind::Index { base, index } => {
                let (base_e, base_ty) = self.check_expr(base);
                let (idx_e, idx_ty) = self.check_expr(index);
                if !matches!(idx_ty, Type::Builtin(Builtin::I32)) {
                    self.error(index.span, "array index must be i32");
                }
                match &base_ty {
                    Type::Array { elem, .. } => {
                        let elem_size = elem.size(&self.structs);
                        (
                            HirExpr::Index {
                                base: Box::new(base_e),
                                index: Box::new(idx_e),
                                elem_ty: *elem.clone(),
                                elem_size,
                            },
                            *elem.clone(),
                        )
                    }
                    _ => {
                        self.error(expr.span, "indexing requires an array");
                        (HirExpr::Int(0), Type::Builtin(Builtin::I32))
                    }
                }
            }
            ExprKind::ArrayLit { elems } => {
                if elems.is_empty() {
                    self.error(expr.span, "empty array literal needs a type annotation");
                    return (HirExpr::Int(0), Type::Builtin(Builtin::I32));
                }
                let mut hir_elems = Vec::new();
                let mut elem_ty: Option<Type> = None;
                for e in elems {
                    let (he, ty) = self.check_expr(e);
                    if let Some(ref et) = elem_ty {
                        if !types_compatible(et, &ty) {
                            self.error(e.span, "array elements must share one type");
                        }
                    } else {
                        elem_ty = Some(ty.clone());
                    }
                    hir_elems.push(he);
                }
                let elem_ty = elem_ty.unwrap();
                let elem_size = elem_ty.size(&self.structs);
                let len = hir_elems.len() as u32;
                (
                    HirExpr::ArrayLit {
                        elem_ty: elem_ty.clone(),
                        elem_size,
                        elems: hir_elems,
                    },
                    Type::Array {
                        elem: Box::new(elem_ty),
                        len,
                    },
                )
            }
            ExprKind::StructLit { name, fields } => {
                let layout = if let Some(l) = self.structs.get(name).cloned() {
                    l
                } else {
                    self.error(expr.span, format!("unknown struct `{name}`"));
                    return (HirExpr::Int(0), Type::Builtin(Builtin::I32));
                };
                let mut inits = Vec::new();
                for (fname, fexpr) in fields {
                    let (e, ty) = self.check_expr(fexpr);
                    if let Some(f) = layout.fields.iter().find(|f| f.name == *fname) {
                        if !types_compatible(&f.ty, &ty) {
                            self.error(
                                fexpr.span,
                                format!("field `{fname}` type mismatch: expected {}, got {}", f.ty, ty),
                            );
                        }
                        inits.push((f.offset, f.ty.clone(), e));
                    } else {
                        self.error(fexpr.span, format!("no field `{fname}` on `{name}`"));
                    }
                }
                (
                    HirExpr::StructLit {
                        size: layout.size,
                        fields: inits,
                    },
                    Type::Struct(name.clone()),
                )
            }
            ExprKind::New { ty, args } => {
                let resolved = self.resolve_type(ty);
                match &resolved {
                    Type::Struct(name) => {
                        let layout = self.structs.get(name).cloned().unwrap();
                        let mut inits = Vec::new();
                        for (fname, fexpr) in args {
                            let (e, ty) = self.check_expr(fexpr);
                            if let Some(f) = layout.fields.iter().find(|f| f.name == *fname) {
                                if !types_compatible(&f.ty, &ty) {
                                    self.error(fexpr.span, "field type mismatch in new");
                                }
                                inits.push((f.offset, f.ty.clone(), e));
                            } else {
                                self.error(fexpr.span, format!("no field `{fname}`"));
                            }
                        }
                        (
                            HirExpr::New {
                                size: layout.size,
                                fields: inits,
                            },
                            Type::Ref {
                                mutable: true,
                                inner: Box::new(Type::Struct(name.clone())),
                            },
                        )
                    }
                    _ => {
                        self.error(expr.span, "`new` requires a struct type");
                        (HirExpr::Int(0), Type::Builtin(Builtin::I32))
                    }
                }
            }
        }
    }

    fn check_arg(&mut self, args: &[Expr], i: usize) -> (HirExpr, Type) {
        if let Some(a) = args.get(i) {
            self.check_expr(a)
        } else {
            (HirExpr::Float(0.0), Type::Builtin(Builtin::F32))
        }
    }

    fn expect_f32ish(&mut self, ty: &Type, span: juni_syntax::Span, what: &str) {
        if !matches!(ty, Type::Builtin(Builtin::F32 | Builtin::I32)) {
            self.error(span, format!("{what} must be f32"));
        }
    }

    fn check_host_intrinsic(
        &mut self,
        name: &str,
        args: &[Expr],
        span: juni_syntax::Span,
    ) -> Option<(HirExpr, Type)> {
        let f32_unary = |this: &mut Self, op: MathUnaryOp| {
            if args.len() != 1 {
                this.error(span, format!("{name} takes one argument"));
            }
            let (a, at) = this.check_arg(args, 0);
            this.expect_f32ish(&at, span, name);
            (
                HirExpr::MathUnary {
                    op,
                    arg: Box::new(a),
                },
                Type::Builtin(Builtin::F32),
            )
        };

        match name {
            "sqrt" => Some(f32_unary(self, MathUnaryOp::Sqrt)),
            "sin" => Some(f32_unary(self, MathUnaryOp::Sin)),
            "cos" => Some(f32_unary(self, MathUnaryOp::Cos)),
            "tan" => Some(f32_unary(self, MathUnaryOp::Tan)),
            "abs" => Some(f32_unary(self, MathUnaryOp::Abs)),
            "floor" => Some(f32_unary(self, MathUnaryOp::Floor)),
            "ceil" => Some(f32_unary(self, MathUnaryOp::Ceil)),
            "min" | "max" => {
                if args.len() != 2 {
                    self.error(span, format!("{name} takes two arguments"));
                }
                let (l, lt) = self.check_arg(args, 0);
                let (r, rt) = self.check_arg(args, 1);
                self.expect_f32ish(&lt, span, name);
                self.expect_f32ish(&rt, span, name);
                let op = if name == "min" {
                    MathBinaryOp::Min
                } else {
                    MathBinaryOp::Max
                };
                Some((
                    HirExpr::MathBinary {
                        op,
                        left: Box::new(l),
                        right: Box::new(r),
                    },
                    Type::Builtin(Builtin::F32),
                ))
            }
            "rand" => {
                if !args.is_empty() {
                    self.error(span, "rand takes no arguments");
                }
                Some((HirExpr::Rand, Type::Builtin(Builtin::F32)))
            }
            "now" => {
                if !args.is_empty() {
                    self.error(span, "now takes no arguments");
                }
                Some((HirExpr::Now, Type::Builtin(Builtin::F32)))
            }
            "as_i32" => {
                if args.len() != 1 {
                    self.error(span, "as_i32 takes one argument");
                }
                let (a, at) = self.check_arg(args, 0);
                self.expect_f32ish(&at, span, "as_i32");
                Some((HirExpr::AsI32(Box::new(a)), Type::Builtin(Builtin::I32)))
            }
            "as_f32" => {
                if args.len() != 1 {
                    self.error(span, "as_f32 takes one argument");
                }
                let (a, at) = self.check_arg(args, 0);
                if !matches!(at, Type::Builtin(Builtin::I32 | Builtin::Bool)) {
                    self.error(span, "as_f32 requires i32");
                }
                Some((HirExpr::AsF32(Box::new(a)), Type::Builtin(Builtin::F32)))
            }
            "print" => {
                if args.len() != 1 {
                    self.error(span, "print takes one argument");
                    return Some((HirExpr::Int(0), Type::Builtin(Builtin::Void)));
                }
                let (a, at) = self.check_expr(&args[0]);
                let hir = match &at {
                    Type::Builtin(Builtin::Str) => HirExpr::PrintStr(Box::new(a)),
                    Type::Builtin(Builtin::I32 | Builtin::Bool) => HirExpr::PrintI32(Box::new(a)),
                    Type::Builtin(Builtin::F32) => HirExpr::PrintF32(Box::new(a)),
                    _ => {
                        self.error(span, format!("print does not support type {at}"));
                        HirExpr::PrintI32(Box::new(HirExpr::Int(0)))
                    }
                };
                Some((hir, Type::Builtin(Builtin::Void)))
            }
            "key_down" => {
                if args.len() != 1 {
                    self.error(span, "key_down(code) expects 1 arg");
                }
                let (c, ct) = self.check_arg(args, 0);
                if !matches!(ct, Type::Builtin(Builtin::I32)) {
                    self.error(span, "key_down code must be i32");
                }
                Some((HirExpr::KeyDown(Box::new(c)), Type::Builtin(Builtin::I32)))
            }
            "mouse_x" => {
                if !args.is_empty() {
                    self.error(span, "mouse_x takes no args");
                }
                Some((HirExpr::MouseX, Type::Builtin(Builtin::F32)))
            }
            "mouse_y" => {
                if !args.is_empty() {
                    self.error(span, "mouse_y takes no args");
                }
                Some((HirExpr::MouseY, Type::Builtin(Builtin::F32)))
            }
            "mouse_down" => {
                if args.len() != 1 {
                    self.error(span, "mouse_down(button) expects 1 arg");
                }
                let (b, bt) = self.check_arg(args, 0);
                if !matches!(bt, Type::Builtin(Builtin::I32)) {
                    self.error(span, "mouse_down button must be i32");
                }
                Some((HirExpr::MouseDown(Box::new(b)), Type::Builtin(Builtin::I32)))
            }
            "str_len" => {
                if args.len() != 1 {
                    self.error(span, "str_len(s) expects 1 arg");
                }
                let (s, st) = self.check_arg(args, 0);
                if !matches!(st, Type::Builtin(Builtin::Str)) {
                    self.error(span, "str_len requires str");
                }
                Some((HirExpr::StrLen(Box::new(s)), Type::Builtin(Builtin::I32)))
            }
            "str_eq" => {
                if args.len() != 2 {
                    self.error(span, "str_eq(a, b) expects 2 args");
                }
                let (a, at) = self.check_arg(args, 0);
                let (b, bt) = self.check_arg(args, 1);
                if !matches!(at, Type::Builtin(Builtin::Str)) || !matches!(bt, Type::Builtin(Builtin::Str)) {
                    self.error(span, "str_eq requires two str values");
                }
                Some((
                    HirExpr::StrEq {
                        left: Box::new(a),
                        right: Box::new(b),
                    },
                    Type::Builtin(Builtin::Bool),
                ))
            }
            "clamp" => {
                if args.len() != 3 {
                    self.error(span, "clamp(x, lo, hi) expects 3 args");
                }
                let (x, xt) = self.check_arg(args, 0);
                let (lo, lt) = self.check_arg(args, 1);
                let (hi, ht) = self.check_arg(args, 2);
                self.expect_f32ish(&xt, span, "clamp x");
                self.expect_f32ish(&lt, span, "clamp lo");
                self.expect_f32ish(&ht, span, "clamp hi");
                Some((
                    HirExpr::Clamp {
                        x: Box::new(x),
                        lo: Box::new(lo),
                        hi: Box::new(hi),
                    },
                    Type::Builtin(Builtin::F32),
                ))
            }
            "lerp" => {
                if args.len() != 3 {
                    self.error(span, "lerp(a, b, t) expects 3 args");
                }
                let (a, at) = self.check_arg(args, 0);
                let (b, bt) = self.check_arg(args, 1);
                let (t, tt) = self.check_arg(args, 2);
                self.expect_f32ish(&at, span, "lerp a");
                self.expect_f32ish(&bt, span, "lerp b");
                self.expect_f32ish(&tt, span, "lerp t");
                Some((
                    HirExpr::Lerp {
                        a: Box::new(a),
                        b: Box::new(b),
                        t: Box::new(t),
                    },
                    Type::Builtin(Builtin::F32),
                ))
            }
            "pow" => {
                if args.len() != 2 {
                    self.error(span, "pow(x, y) expects 2 args");
                }
                let (x, xt) = self.check_arg(args, 0);
                let (y, yt) = self.check_arg(args, 1);
                self.expect_f32ish(&xt, span, "pow x");
                self.expect_f32ish(&yt, span, "pow y");
                Some((
                    HirExpr::Pow {
                        base: Box::new(x),
                        exp: Box::new(y),
                    },
                    Type::Builtin(Builtin::F32),
                ))
            }
            "sign" => {
                if args.len() != 1 {
                    self.error(span, "sign(x) expects 1 arg");
                }
                let (a, at) = self.check_arg(args, 0);
                self.expect_f32ish(&at, span, "sign");
                Some((HirExpr::Sign(Box::new(a)), Type::Builtin(Builtin::F32)))
            }
            "fmod" => {
                if args.len() != 2 {
                    self.error(span, "fmod(x, y) expects 2 args");
                }
                let (x, xt) = self.check_arg(args, 0);
                let (y, yt) = self.check_arg(args, 1);
                self.expect_f32ish(&xt, span, "fmod x");
                self.expect_f32ish(&yt, span, "fmod y");
                Some((
                    HirExpr::Fmod {
                        x: Box::new(x),
                        y: Box::new(y),
                    },
                    Type::Builtin(Builtin::F32),
                ))
            }
            "smoothstep" => {
                if args.len() != 3 {
                    self.error(span, "smoothstep(e0, e1, x) expects 3 args");
                }
                let (e0, e0t) = self.check_arg(args, 0);
                let (e1, e1t) = self.check_arg(args, 1);
                let (x, xt) = self.check_arg(args, 2);
                self.expect_f32ish(&e0t, span, "smoothstep e0");
                self.expect_f32ish(&e1t, span, "smoothstep e1");
                self.expect_f32ish(&xt, span, "smoothstep x");
                Some((
                    HirExpr::Smoothstep {
                        edge0: Box::new(e0),
                        edge1: Box::new(e1),
                        x: Box::new(x),
                    },
                    Type::Builtin(Builtin::F32),
                ))
            }
            "deg_to_rad" => {
                if args.len() != 1 {
                    self.error(span, "deg_to_rad(deg) expects 1 arg");
                }
                let (a, at) = self.check_arg(args, 0);
                self.expect_f32ish(&at, span, "deg_to_rad");
                Some((HirExpr::DegToRad(Box::new(a)), Type::Builtin(Builtin::F32)))
            }
            "rad_to_deg" => {
                if args.len() != 1 {
                    self.error(span, "rad_to_deg(rad) expects 1 arg");
                }
                let (a, at) = self.check_arg(args, 0);
                self.expect_f32ish(&at, span, "rad_to_deg");
                Some((HirExpr::RadToDeg(Box::new(a)), Type::Builtin(Builtin::F32)))
            }
            "dist2" => {
                if args.len() != 4 {
                    self.error(span, "dist2(x1, y1, x2, y2) expects 4 args");
                }
                let (x1, x1t) = self.check_arg(args, 0);
                let (y1, y1t) = self.check_arg(args, 1);
                let (x2, x2t) = self.check_arg(args, 2);
                let (y2, y2t) = self.check_arg(args, 3);
                self.expect_f32ish(&x1t, span, "dist2 x1");
                self.expect_f32ish(&y1t, span, "dist2 y1");
                self.expect_f32ish(&x2t, span, "dist2 x2");
                self.expect_f32ish(&y2t, span, "dist2 y2");
                Some((
                    HirExpr::Dist2 {
                        x1: Box::new(x1),
                        y1: Box::new(y1),
                        x2: Box::new(x2),
                        y2: Box::new(y2),
                    },
                    Type::Builtin(Builtin::F32),
                ))
            }
            "pi" => {
                if !args.is_empty() {
                    self.error(span, "pi takes no arguments");
                }
                Some((HirExpr::Pi, Type::Builtin(Builtin::F32)))
            }
            "str_concat" => {
                if args.len() != 2 {
                    self.error(span, "str_concat(a, b) expects 2 args");
                }
                let (a, at) = self.check_arg(args, 0);
                let (b, bt) = self.check_arg(args, 1);
                if !matches!(at, Type::Builtin(Builtin::Str)) || !matches!(bt, Type::Builtin(Builtin::Str)) {
                    self.error(span, "str_concat requires two str values");
                }
                Some((
                    HirExpr::StrConcat {
                        left: Box::new(a),
                        right: Box::new(b),
                    },
                    Type::Builtin(Builtin::Str),
                ))
            }
            "str_substr" => {
                if args.len() != 3 {
                    self.error(span, "str_substr(s, start, len) expects 3 args");
                }
                let (s, st) = self.check_arg(args, 0);
                let (start, start_t) = self.check_arg(args, 1);
                let (len, len_t) = self.check_arg(args, 2);
                if !matches!(st, Type::Builtin(Builtin::Str)) {
                    self.error(span, "str_substr requires str");
                }
                if !matches!(start_t, Type::Builtin(Builtin::I32))
                    || !matches!(len_t, Type::Builtin(Builtin::I32))
                {
                    self.error(span, "str_substr start/len must be i32");
                }
                Some((
                    HirExpr::StrSubstr {
                        src: Box::new(s),
                        start: Box::new(start),
                        len: Box::new(len),
                    },
                    Type::Builtin(Builtin::Str),
                ))
            }
            "len2" => {
                if args.len() != 2 {
                    self.error(span, "len2(x, y) expects 2 args");
                }
                let (x, xt) = self.check_arg(args, 0);
                let (y, yt) = self.check_arg(args, 1);
                self.expect_f32ish(&xt, span, "len2 x");
                self.expect_f32ish(&yt, span, "len2 y");
                Some((
                    HirExpr::Len2 {
                        x: Box::new(x),
                        y: Box::new(y),
                    },
                    Type::Builtin(Builtin::F32),
                ))
            }
            "dot2" => {
                if args.len() != 4 {
                    self.error(span, "dot2(x1, y1, x2, y2) expects 4 args");
                }
                let (x1, x1t) = self.check_arg(args, 0);
                let (y1, y1t) = self.check_arg(args, 1);
                let (x2, x2t) = self.check_arg(args, 2);
                let (y2, y2t) = self.check_arg(args, 3);
                self.expect_f32ish(&x1t, span, "dot2 x1");
                self.expect_f32ish(&y1t, span, "dot2 y1");
                self.expect_f32ish(&x2t, span, "dot2 x2");
                self.expect_f32ish(&y2t, span, "dot2 y2");
                Some((
                    HirExpr::Dot2 {
                        x1: Box::new(x1),
                        y1: Box::new(y1),
                        x2: Box::new(x2),
                        y2: Box::new(y2),
                    },
                    Type::Builtin(Builtin::F32),
                ))
            }
            "abs_i32" => {
                if args.len() != 1 {
                    self.error(span, "abs_i32(x) expects 1 arg");
                }
                let (a, at) = self.check_arg(args, 0);
                if !matches!(at, Type::Builtin(Builtin::I32)) {
                    self.error(span, "abs_i32 requires i32");
                }
                Some((HirExpr::AbsI32(Box::new(a)), Type::Builtin(Builtin::I32)))
            }
            "imin" => {
                if args.len() != 2 {
                    self.error(span, "imin(a, b) expects 2 args");
                }
                let (a, at) = self.check_arg(args, 0);
                let (b, bt) = self.check_arg(args, 1);
                if !matches!(at, Type::Builtin(Builtin::I32)) || !matches!(bt, Type::Builtin(Builtin::I32)) {
                    self.error(span, "imin requires two i32 values");
                }
                Some((
                    HirExpr::IMin {
                        a: Box::new(a),
                        b: Box::new(b),
                    },
                    Type::Builtin(Builtin::I32),
                ))
            }
            "imax" => {
                if args.len() != 2 {
                    self.error(span, "imax(a, b) expects 2 args");
                }
                let (a, at) = self.check_arg(args, 0);
                let (b, bt) = self.check_arg(args, 1);
                if !matches!(at, Type::Builtin(Builtin::I32)) || !matches!(bt, Type::Builtin(Builtin::I32)) {
                    self.error(span, "imax requires two i32 values");
                }
                Some((
                    HirExpr::IMax {
                        a: Box::new(a),
                        b: Box::new(b),
                    },
                    Type::Builtin(Builtin::I32),
                ))
            }
            "iclamp" => {
                if args.len() != 3 {
                    self.error(span, "iclamp(x, lo, hi) expects 3 args");
                }
                let (x, xt) = self.check_arg(args, 0);
                let (lo, lt) = self.check_arg(args, 1);
                let (hi, ht) = self.check_arg(args, 2);
                if !matches!(xt, Type::Builtin(Builtin::I32))
                    || !matches!(lt, Type::Builtin(Builtin::I32))
                    || !matches!(ht, Type::Builtin(Builtin::I32))
                {
                    self.error(span, "iclamp requires i32 args");
                }
                Some((
                    HirExpr::IClamp {
                        x: Box::new(x),
                        lo: Box::new(lo),
                        hi: Box::new(hi),
                    },
                    Type::Builtin(Builtin::I32),
                ))
            }
            other => self.check_graphics_intrinsic(other, args, span),
        }
    }

    fn check_graphics_intrinsic(
        &mut self,
        name: &str,
        args: &[Expr],
        span: juni_syntax::Span,
    ) -> Option<(HirExpr, Type)> {
        match name {
            "canvas_init" => {
                if args.len() != 2 {
                    self.error(span, "canvas_init(w, h) expects 2 args");
                }
                let (w, wt) = self.check_arg(args, 0);
                let (h, ht) = self.check_arg(args, 1);
                if !matches!(wt, Type::Builtin(Builtin::I32))
                    || !matches!(ht, Type::Builtin(Builtin::I32))
                {
                    self.error(span, "canvas_init sizes must be i32");
                }
                Some((
                    HirExpr::CanvasInit {
                        w: Box::new(w),
                        h: Box::new(h),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "canvas_clear" => {
                if args.len() != 4 {
                    self.error(span, "canvas_clear(r,g,b,a) expects 4 args");
                }
                let (r, rt) = self.check_arg(args, 0);
                let (g, gt) = self.check_arg(args, 1);
                let (b, bt) = self.check_arg(args, 2);
                let (a, at) = self.check_arg(args, 3);
                self.expect_f32ish(&rt, span, "r");
                self.expect_f32ish(&gt, span, "g");
                self.expect_f32ish(&bt, span, "b");
                self.expect_f32ish(&at, span, "a");
                Some((
                    HirExpr::CanvasClear {
                        r: Box::new(r),
                        g: Box::new(g),
                        b: Box::new(b),
                        a: Box::new(a),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "canvas_fill_rect" => {
                if args.len() != 8 {
                    self.error(span, "canvas_fill_rect expects 8 args");
                }
                let mut xs = Vec::new();
                for i in 0..8 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "canvas_fill_rect arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::CanvasFillRect {
                        x: Box::new(xs.remove(0)),
                        y: Box::new(xs.remove(0)),
                        w: Box::new(xs.remove(0)),
                        h: Box::new(xs.remove(0)),
                        r: Box::new(xs.remove(0)),
                        g: Box::new(xs.remove(0)),
                        b: Box::new(xs.remove(0)),
                        a: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "canvas_fill_circle" => {
                if args.len() != 7 {
                    self.error(span, "canvas_fill_circle expects 7 args");
                }
                let mut xs = Vec::new();
                for i in 0..7 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "canvas_fill_circle arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::CanvasFillCircle {
                        x: Box::new(xs.remove(0)),
                        y: Box::new(xs.remove(0)),
                        radius: Box::new(xs.remove(0)),
                        r: Box::new(xs.remove(0)),
                        g: Box::new(xs.remove(0)),
                        b: Box::new(xs.remove(0)),
                        a: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "canvas_fill_text" => {
                if args.len() != 7 {
                    self.error(span, "canvas_fill_text expects 7 args");
                }
                let (text, tt) = self.check_arg(args, 0);
                if !matches!(tt, Type::Builtin(Builtin::Str)) {
                    self.error(span, "canvas_fill_text first arg must be str");
                }
                let mut xs = Vec::new();
                for i in 1..7 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "canvas_fill_text arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::CanvasFillText {
                        text: Box::new(text),
                        x: Box::new(xs.remove(0)),
                        y: Box::new(xs.remove(0)),
                        r: Box::new(xs.remove(0)),
                        g: Box::new(xs.remove(0)),
                        b: Box::new(xs.remove(0)),
                        a: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "canvas_draw_line" => {
                if args.len() != 9 {
                    self.error(span, "canvas_draw_line expects 9 args");
                }
                let mut xs = Vec::new();
                for i in 0..9 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "canvas_draw_line arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::CanvasDrawLine {
                        x1: Box::new(xs.remove(0)),
                        y1: Box::new(xs.remove(0)),
                        x2: Box::new(xs.remove(0)),
                        y2: Box::new(xs.remove(0)),
                        width: Box::new(xs.remove(0)),
                        r: Box::new(xs.remove(0)),
                        g: Box::new(xs.remove(0)),
                        b: Box::new(xs.remove(0)),
                        a: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "canvas_stroke_rect" => {
                if args.len() != 9 {
                    self.error(span, "canvas_stroke_rect expects 9 args");
                }
                let mut xs = Vec::new();
                for i in 0..9 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "canvas_stroke_rect arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::CanvasStrokeRect {
                        x: Box::new(xs.remove(0)),
                        y: Box::new(xs.remove(0)),
                        w: Box::new(xs.remove(0)),
                        h: Box::new(xs.remove(0)),
                        width: Box::new(xs.remove(0)),
                        r: Box::new(xs.remove(0)),
                        g: Box::new(xs.remove(0)),
                        b: Box::new(xs.remove(0)),
                        a: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "gpu_clear" => {
                if args.len() != 4 {
                    self.error(span, "gpu_clear(r,g,b,a) expects 4 args");
                }
                let (r, rt) = self.check_arg(args, 0);
                let (g, gt) = self.check_arg(args, 1);
                let (b, bt) = self.check_arg(args, 2);
                let (a, at) = self.check_arg(args, 3);
                self.expect_f32ish(&rt, span, "r");
                self.expect_f32ish(&gt, span, "g");
                self.expect_f32ish(&bt, span, "b");
                self.expect_f32ish(&at, span, "a");
                Some((
                    HirExpr::GpuClear {
                        r: Box::new(r),
                        g: Box::new(g),
                        b: Box::new(b),
                        a: Box::new(a),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "gpu_draw_triangle" => {
                if !args.is_empty() {
                    self.error(span, "gpu_draw_triangle takes no args");
                }
                Some((HirExpr::GpuDrawTriangle, Type::Builtin(Builtin::Void)))
            }
            "scene3d_init" => {
                if args.len() != 2 {
                    self.error(span, "scene3d_init(w,h) expects 2 args");
                }
                let (w, wt) = self.check_arg(args, 0);
                let (h, ht) = self.check_arg(args, 1);
                if !matches!(wt, Type::Builtin(Builtin::I32))
                    || !matches!(ht, Type::Builtin(Builtin::I32))
                {
                    self.error(span, "scene3d_init sizes must be i32");
                }
                Some((
                    HirExpr::Scene3dInit {
                        w: Box::new(w),
                        h: Box::new(h),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "camera3d_perspective" => {
                if args.len() != 4 {
                    self.error(span, "camera3d_perspective expects 4 args");
                }
                let mut xs = Vec::new();
                for i in 0..4 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "camera3d_perspective arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::Camera3dPerspective {
                        fov: Box::new(xs.remove(0)),
                        aspect: Box::new(xs.remove(0)),
                        near: Box::new(xs.remove(0)),
                        far: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::I32),
                ))
            }
            "mesh3d_box" => {
                if args.len() != 3 {
                    self.error(span, "mesh3d_box(sx,sy,sz) expects 3 args");
                }
                let mut xs = Vec::new();
                for i in 0..3 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "mesh3d_box arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::Mesh3dBox {
                        sx: Box::new(xs.remove(0)),
                        sy: Box::new(xs.remove(0)),
                        sz: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::I32),
                ))
            }
            "mesh3d_set_pose" => {
                if args.len() != 7 {
                    self.error(span, "mesh3d_set_pose expects 7 args");
                }
                let (mesh, mt) = self.check_arg(args, 0);
                if !matches!(mt, Type::Builtin(Builtin::I32)) {
                    self.error(span, "mesh handle must be i32");
                }
                let mut xs = Vec::new();
                for i in 1..7 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "mesh3d_set_pose arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::Mesh3dSetPose {
                        mesh: Box::new(mesh),
                        tx: Box::new(xs.remove(0)),
                        ty: Box::new(xs.remove(0)),
                        tz: Box::new(xs.remove(0)),
                        rx: Box::new(xs.remove(0)),
                        ry: Box::new(xs.remove(0)),
                        rz: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "mesh3d_rotate" => {
                if args.len() != 4 {
                    self.error(span, "mesh3d_rotate expects 4 args");
                }
                let (mesh, mt) = self.check_arg(args, 0);
                if !matches!(mt, Type::Builtin(Builtin::I32)) {
                    self.error(span, "mesh handle must be i32");
                }
                let mut xs = Vec::new();
                for i in 1..4 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "mesh3d_rotate arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::Mesh3dRotate {
                        mesh: Box::new(mesh),
                        drx: Box::new(xs.remove(0)),
                        dry: Box::new(xs.remove(0)),
                        drz: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "scene3d_clear" => {
                if args.len() != 4 {
                    self.error(span, "scene3d_clear expects 4 args");
                }
                let mut xs = Vec::new();
                for i in 0..4 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "scene3d_clear arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::Scene3dClear {
                        r: Box::new(xs.remove(0)),
                        g: Box::new(xs.remove(0)),
                        b: Box::new(xs.remove(0)),
                        a: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "scene3d_draw" => {
                if args.len() != 2 {
                    self.error(span, "scene3d_draw(mesh, cam) expects 2 args");
                }
                let (mesh, mt) = self.check_arg(args, 0);
                let (cam, ct) = self.check_arg(args, 1);
                if !matches!(mt, Type::Builtin(Builtin::I32))
                    || !matches!(ct, Type::Builtin(Builtin::I32))
                {
                    self.error(span, "scene3d_draw handles must be i32");
                }
                Some((
                    HirExpr::Scene3dDraw {
                        mesh: Box::new(mesh),
                        cam: Box::new(cam),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            _ => None,
        }
    }

    fn check_binary(
        &mut self,
        op: BinaryOp,
        lt: Type,
        rt: Type,
        span: juni_syntax::Span,
        l: HirExpr,
        r: HirExpr,
    ) -> (HirExpr, Type) {
        match op {
            BinaryOp::And | BinaryOp::Or => {
                if !matches!(lt, Type::Builtin(Builtin::Bool))
                    || !matches!(rt, Type::Builtin(Builtin::Bool))
                {
                    self.error(span, "logical operators require bool");
                }
                let hop = match op {
                    BinaryOp::And => HirBinaryOp::And,
                    _ => HirBinaryOp::Or,
                };
                (
                    HirExpr::Binary {
                        op: hop,
                        left: Box::new(l),
                        right: Box::new(r),
                        ty: Type::Builtin(Builtin::Bool),
                    },
                    Type::Builtin(Builtin::Bool),
                )
            }
            BinaryOp::Eq | BinaryOp::Ne | BinaryOp::Lt | BinaryOp::Le | BinaryOp::Gt | BinaryOp::Ge => {
                if !types_compatible(&lt, &rt) {
                    self.error(span, "comparison type mismatch");
                }
                let hop = match op {
                    BinaryOp::Eq => HirBinaryOp::Eq,
                    BinaryOp::Ne => HirBinaryOp::Ne,
                    BinaryOp::Lt => HirBinaryOp::Lt,
                    BinaryOp::Le => HirBinaryOp::Le,
                    BinaryOp::Gt => HirBinaryOp::Gt,
                    BinaryOp::Ge => HirBinaryOp::Ge,
                    _ => unreachable!(),
                };
                (
                    HirExpr::Binary {
                        op: hop,
                        left: Box::new(l),
                        right: Box::new(r),
                        ty: Type::Builtin(Builtin::Bool),
                    },
                    Type::Builtin(Builtin::Bool),
                )
            }
            BinaryOp::Add | BinaryOp::Sub | BinaryOp::Mul | BinaryOp::Div | BinaryOp::Rem => {
                if !types_compatible(&lt, &rt) || !lt.is_numeric() {
                    self.error(span, "arithmetic type mismatch");
                }
                let hop = match op {
                    BinaryOp::Add => HirBinaryOp::Add,
                    BinaryOp::Sub => HirBinaryOp::Sub,
                    BinaryOp::Mul => HirBinaryOp::Mul,
                    BinaryOp::Div => HirBinaryOp::Div,
                    BinaryOp::Rem => HirBinaryOp::Rem,
                    _ => unreachable!(),
                };
                (
                    HirExpr::Binary {
                        op: hop,
                        left: Box::new(l),
                        right: Box::new(r),
                        ty: lt.clone(),
                    },
                    lt,
                )
            }
        }
    }
}

fn align_up(value: u32, align: u32) -> u32 {
    if align == 0 {
        return value;
    }
    (value + align - 1) & !(align - 1)
}

fn types_compatible(a: &Type, b: &Type) -> bool {
    match (a, b) {
        (Type::Builtin(x), Type::Builtin(y)) => x == y,
        (Type::Struct(x), Type::Struct(y)) => x == y,
        (Type::Array { elem: e1, len: l1 }, Type::Array { elem: e2, len: l2 }) => {
            l1 == l2 && types_compatible(e1, e2)
        }
        (Type::Ref { mutable: m1, inner: i1 }, Type::Ref { mutable: m2, inner: i2 }) => {
            types_compatible(i1, i2) && (*m2 || *m1 == *m2 || !*m2)
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use juni_syntax::parse;

    #[test]
    fn check_hello() {
        let m = parse("fn main() -> i32:\n    return 0\n").unwrap();
        let hir = check_ok(&m).unwrap();
        assert_eq!(hir.functions.len(), 1);
        assert_eq!(hir.functions[0].name, "main");
    }

    #[test]
    fn check_state_block() {
        let src = r#"state:
    score: i32 = 0

fn main() -> i32:
    score = score + 1
    return score
"#;
        let m = parse(src).unwrap();
        let hir = check_ok(&m).unwrap();
        assert_eq!(hir.statics.len(), 1);
        assert_eq!(hir.statics[0].name, "score");
        assert!(!hir.init_globals.stmts.is_empty());
    }

    #[test]
    fn check_cross_fn_static() {
        let src = r#"state:
    cam: i32 = 0

fn main() -> i32:
    cam = 42
    return 0

fn frame(dt: f32) -> i32:
    return cam
"#;
        let m = parse(src).unwrap();
        let hir = check_ok(&m).unwrap();
        assert_eq!(hir.statics.len(), 1);
        assert_eq!(hir.functions.len(), 2);
    }

    #[test]
    fn check_str_len_and_clamp() {
        let src = r#"fn main() -> i32:
    let n = str_len("hi")
    let x = clamp(5.0, 0.0, 3.0)
    return n + as_i32(x)
"#;
        let m = parse(src).unwrap();
        check_ok(&m).unwrap();
    }

    #[test]
    fn check_extended_stdlib() {
        let src = r#"fn main() -> i32:
    let s = str_concat("a", "b")
    let d = dist2(0.0, 0.0, 3.0, 4.0)
    let p = pow(2.0, 3.0)
    let c = iclamp(99, 0, 10)
    return str_len(s) + as_i32(d + p) + c
"#;
        let m = parse(src).unwrap();
        check_ok(&m).unwrap();
    }

    #[test]
    fn check_vec2_and_str_substr() {
        let src = r#"fn main() -> i32:
    let l = len2(3.0, 4.0)
    let s = str_substr("hello", 1, 3)
    return as_i32(l) + str_len(s)
"#;
        let m = parse(src).unwrap();
        check_ok(&m).unwrap();
    }

    #[test]
    fn check_canvas_draw_line() {
        let src = r#"fn main() -> i32:
    canvas_draw_line(0.0, 0.0, 10.0, 10.0, 1.0, 1.0, 1.0, 1.0, 1.0)
    return 0
"#;
        let m = parse(src).unwrap();
        check_ok(&m).unwrap();
    }

    #[test]
    fn check_break_continue() {
        let src = r#"fn main() -> i32:
    let i = 0
    while i < 10:
        i = i + 1
        if i == 3:
            continue
        if i == 7:
            break
    return i
"#;
        let m = parse(src).unwrap();
        check_ok(&m).unwrap();
    }

    #[test]
    fn reject_break_outside_loop() {
        use crate::diag::Severity;
        let m = parse("fn main() -> i32:\n    break\n    return 0\n").unwrap();
        let r = check(&m);
        assert!(r
            .diagnostics
            .iter()
            .any(|d| matches!(d.severity, Severity::Error)));
    }
}
