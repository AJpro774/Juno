//! Juni typechecker and high-level IR.

pub mod borrow;
pub mod diag;
pub mod generics;
pub mod hir;
pub mod program;
pub mod types;

pub use diag::{diagnostics_to_json, did_you_mean, Diagnostic, DiagnosticJson, Severity};
pub use hir::{mangle_symbol, HirModule, HirProgram, ModuleId};
pub use program::{check_program, check_program_ok, ProgramCheckResult, ProgramModule};

use std::collections::HashMap;

use juni_syntax::{
    BinaryOp, Block, Expr, ExprKind, FnDef, Module, Stmt,
    StructDef, TypeExpr, TypeExprKind, UnaryOp,
};

use crate::borrow::{Alias, BorrowCx, Place};
use crate::generics::{infer_substitution, instantiate_fn_def, mangle_generic_instance};
use crate::hir::*;
use crate::program::{flatten_items, imports_from_module, FlatItem, ImportBindings};
use crate::types::{Builtin, StructLayout, Type};

#[derive(Debug)]
pub struct CheckResult {
    pub module: HirModule,
    pub diagnostics: Vec<Diagnostic>,
}

pub fn check(module: &Module) -> CheckResult {
    let mut checker = Checker::new_single_file();
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

#[derive(Clone)]
struct ExportedFn {
    sig: FnSig,
}

#[derive(Default, Clone)]
pub(crate) struct ExportTable {
    pub functions: HashMap<String, ExportedFn>,
    pub structs: HashMap<String, StructLayout>,
    pub statics: HashMap<String, (Type, StaticId)>,
}

#[derive(Clone)]
enum QualifiedRef {
    Fn(FnSig),
    Struct(StructLayout),
    Static(Type, StaticId),
}

struct Checker {
    module_name: String,
    file: Option<String>,
    module_id: ModuleId,
    is_entry_module: bool,
    imports: ImportBindings,
    foreign_exports: HashMap<String, ExportTable>,
    item_exported: HashMap<String, bool>,
    structs: HashMap<String, StructLayout>,
    functions: HashMap<String, FnSig>,
    statics: HashMap<String, (Type, StaticId)>,
    locals: Vec<HashMap<String, (Type, LocalId)>>,
    next_local: u32,
    next_func_id: u32,
    next_static_id: u32,
    loop_depth: u32,
    current_ret: Type,
    current_fn: String,
    main_let_names: Vec<String>,
    has_frame: bool,
    hir: HirModule,
    diagnostics: Vec<Diagnostic>,
    fn_local_types: Vec<Type>,
    /// Source names for locals in the current function (indexed by LocalId.0).
    fn_local_names: Vec<String>,
    /// Generic function templates (`fn min[T: Ord](...)`).
    generic_fns: HashMap<String, (FnDef, bool)>,
    /// Active type-parameter substitution while checking a generic template.
    type_param_scope: Option<HashMap<String, Type>>,
    /// Function-local ref/mut alias tracking.
    borrow: BorrowCx,
    /// Place of the most recently checked ref-typed expression.
    expr_place: Option<Alias>,
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
    fn new_single_file() -> Self {
        Self::for_program_module(
            String::new(),
            None,
            ModuleId(0),
            true,
            &HashMap::new(),
            0,
            0,
            0,
        )
    }

    pub(crate) fn for_program_module(
        module_name: String,
        file: Option<String>,
        module_id: ModuleId,
        is_entry_module: bool,
        foreign_exports: &HashMap<String, ExportTable>,
        next_func_id: u32,
        next_static_id: u32,
        static_region_offset: u32,
    ) -> Self {
        Self {
            module_name,
            file,
            module_id,
            is_entry_module,
            imports: ImportBindings::default(),
            foreign_exports: foreign_exports.clone(),
            item_exported: HashMap::new(),
            structs: HashMap::new(),
            functions: HashMap::new(),
            statics: HashMap::new(),
            locals: Vec::new(),
            next_local: 0,
            next_func_id,
            next_static_id,
            loop_depth: 0,
            current_ret: Type::Builtin(Builtin::I32),
            current_fn: String::new(),
            main_let_names: Vec::new(),
            has_frame: false,
            hir: HirModule {
                id: module_id,
                name: String::new(),
                file: None,
                structs: Vec::new(),
                statics: Vec::new(),
                static_region_size: 0,
                static_region_offset,
                init_globals: HirBlock { stmts: vec![] },
                functions: Vec::new(),
            },
            diagnostics: Vec::new(),
            fn_local_types: Vec::new(),
            fn_local_names: Vec::new(),
            generic_fns: HashMap::new(),
            type_param_scope: None,
            borrow: BorrowCx::default(),
            expr_place: None,
        }
    }

    pub(crate) fn process_imports(&mut self, module: &Module) {
        self.imports = imports_from_module(module);
        let module_aliases: Vec<_> = self.imports.module_aliases.iter().map(|(a, t)| (a.clone(), t.clone())).collect();
        for (alias, target) in module_aliases {
            if !self.foreign_exports.contains_key(&target) {
                let notes = self.note_did_you_mean(
                    &target,
                    self.foreign_exports.keys().cloned(),
                );
                self.error_with_notes(
                    module.span,
                    format!("unknown module `{target}` (via import `{alias}`)"),
                    notes,
                );
            }
        }
        let from_imports: Vec<_> = self
            .imports
            .from_imports
            .iter()
            .map(|(l, (t, s))| (l.clone(), (t.clone(), s.clone())))
            .collect();
        for (local, (target, sym)) in from_imports {
            if let Some(exports) = self.foreign_exports.get(&target) {
                if !exports.functions.contains_key(&sym)
                    && !exports.structs.contains_key(&sym)
                    && !exports.statics.contains_key(&sym)
                {
                    self.error(
                        module.span,
                        format!("module `{target}` has no exported `{sym}` (via `{local}`)"),
                    );
                }
            } else {
                self.error(
                    module.span,
                    format!("unknown module `{target}` (via `{local}`)"),
                );
            }
        }
    }

    pub(crate) fn export_table(&self) -> ExportTable {
        let mut table = ExportTable::default();
        for (name, sig) in &self.functions {
            if *self.item_exported.get(name).unwrap_or(&false) {
                table.functions.insert(
                    name.clone(),
                    ExportedFn {
                        sig: sig.clone(),
                    },
                );
            }
        }
        for (name, layout) in &self.structs {
            if *self.item_exported.get(name).unwrap_or(&false) {
                table.structs.insert(name.clone(), layout.clone());
            }
        }
        for (name, (ty, id)) in &self.statics {
            if *self.item_exported.get(name).unwrap_or(&false) {
                table.statics.insert(name.clone(), (ty.clone(), *id));
            }
        }
        table
    }

    pub(crate) fn into_hir_module(mut self) -> HirModule {
        self.hir.name = self.module_name;
        self.hir.file = self.file;
        self.hir.id = self.module_id;
        self.hir
    }

    fn mangle(&self, name: &str) -> String {
        mangle_symbol(&self.module_name, name)
    }

    fn error(&mut self, span: juni_syntax::Span, msg: impl Into<String>) {
        self.diagnostics.push(Diagnostic {
            severity: Severity::Error,
            span,
            message: msg.into(),
            notes: Vec::new(),
            file: self.file.clone(),
        });
    }

    fn error_with_notes(
        &mut self,
        span: juni_syntax::Span,
        msg: impl Into<String>,
        notes: impl IntoIterator<Item = String>,
    ) {
        self.diagnostics.push(Diagnostic {
            severity: Severity::Error,
            span,
            message: msg.into(),
            notes: notes.into_iter().collect(),
            file: self.file.clone(),
        });
    }

    fn note_did_you_mean(&self, name: &str, candidates: impl Iterator<Item = String>) -> Vec<String> {
        let list: Vec<String> = candidates.collect();
        if let Some(s) = did_you_mean(name, list.iter().map(|s| s.as_str())) {
            vec![format!("did you mean `{s}`?")]
        } else {
            Vec::new()
        }
    }

    fn resolve_foreign_struct(&self, module: &str, name: &str) -> Option<StructLayout> {
        self.foreign_exports
            .get(module)
            .and_then(|exports| exports.structs.get(name).cloned())
    }

    fn lookup_module_alias(&self, alias: &str) -> Option<String> {
        if let Some(target) = self.imports.module_aliases.get(alias) {
            return Some(target.clone());
        }
        if self.foreign_exports.contains_key(alias) {
            return Some(alias.to_string());
        }
        None
    }

    fn resolve_qualified(
        &mut self,
        module: &str,
        name: &str,
        span: juni_syntax::Span,
    ) -> Option<QualifiedRef> {
        if module == self.module_name || (self.module_name.is_empty() && module.is_empty()) {
            if let Some(sig) = self.functions.get(name).cloned() {
                return Some(QualifiedRef::Fn(sig));
            }
            if let Some(layout) = self.structs.get(name).cloned() {
                return Some(QualifiedRef::Struct(layout));
            }
            if let Some((ty, id)) = self.statics.get(name).cloned() {
                return Some(QualifiedRef::Static(ty, id));
            }
            self.error(span, format!("`{module}.{name}` is not defined in this module"));
            return None;
        }

        let exports = match self.foreign_exports.get(module) {
            Some(e) => e,
            None => {
                self.error(span, format!("unknown module `{module}`"));
                return None;
            }
        };

        if let Some(exported) = exports.functions.get(name) {
            return Some(QualifiedRef::Fn(exported.sig.clone()));
        }
        if let Some(layout) = exports.structs.get(name) {
            return Some(QualifiedRef::Struct(layout.clone()));
        }
        if let Some((ty, id)) = exports.statics.get(name) {
            return Some(QualifiedRef::Static(ty.clone(), *id));
        }
        self.error(
            span,
            format!("module `{module}` has no exported `{name}`"),
        );
        None
    }

    fn resolve_from_import(&mut self, local: &str, span: juni_syntax::Span) -> Option<QualifiedRef> {
        let (module, name) = self.imports.from_imports.get(local)?.clone();
        self.resolve_qualified(&module, &name, span)
    }

    fn push_scope(&mut self) {
        self.locals.push(HashMap::new());
    }

    fn pop_scope(&mut self) {
        if let Some(scope) = self.locals.pop() {
            for (_, (_, id)) in scope {
                self.borrow.clear_local(id.0);
            }
        }
    }

    fn declare_local(&mut self, name: String, ty: Type) -> LocalId {
        let id = LocalId(self.next_local);
        self.next_local += 1;
        self.fn_local_types.push(ty.clone());
        self.fn_local_names.push(name.clone());
        self.borrow.set_local_name(id.0, name.clone());
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
            TypeExprKind::Named(name) => {
                if let Some(scope) = &self.type_param_scope {
                    if let Some(t) = scope.get(name) {
                        return t.clone();
                    }
                }
                match name.as_str() {
                "i32" => Type::Builtin(Builtin::I32),
                "i64" => Type::Builtin(Builtin::I64),
                "f32" => Type::Builtin(Builtin::F32),
                "f64" => Type::Builtin(Builtin::F64),
                "bool" => Type::Builtin(Builtin::Bool),
                "void" => Type::Builtin(Builtin::Void),
                "str" => Type::Builtin(Builtin::Str),
                other => {
                    if self.structs.contains_key(other) {
                        Type::Struct(mangle_symbol(&self.module_name, other))
                    } else if let Some((module, sym)) = self.imports.from_imports.get(other) {
                        if let Some(layout) = self.resolve_foreign_struct(module, sym) {
                            Type::Struct(mangle_symbol(module, &layout.name))
                        } else {
                            self.error(te.span, format!("unknown type `{other}`"));
                            Type::Builtin(Builtin::I32)
                        }
                    } else if self
                        .type_param_scope
                        .as_ref()
                        .is_some_and(|s| s.contains_key(other))
                    {
                        Type::TypeParam(other.to_string())
                    } else {
                        let notes = self.note_did_you_mean(other, self.known_type_names());
                        self.error_with_notes(
                            te.span,
                            format!("unknown type `{other}`"),
                            notes,
                        );
                        Type::Builtin(Builtin::I32)
                    }
                }
                }
            }
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
        let flat = flatten_items(module);
        self.has_frame = flat.iter().any(|item| {
            matches!(item, FlatItem::Fn(f, _) if f.name == "frame")
        });
        for item in &flat {
            if let FlatItem::Struct(s, exported) = item {
                self.item_exported.insert(s.name.clone(), *exported);
                self.collect_struct(s);
            }
        }
        for item in &flat {
            if let FlatItem::Fn(f, exported) = item {
                self.item_exported.insert(f.name.clone(), *exported);
                self.collect_fn_sig(f);
            }
        }
        for item in &flat {
            match item {
                FlatItem::Global(g, exported) => {
                    self.item_exported.insert(g.name.clone(), *exported);
                    self.collect_static_binding(
                        &g.name,
                        g.ty.as_ref(),
                        &g.init,
                        g.span,
                    );
                }
                FlatItem::State(s, exported) => {
                    for field in &s.fields {
                        self.item_exported.insert(field.name.clone(), *exported);
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
        for item in &flat {
            if let FlatItem::Fn(f, _) = item {
                if f.name == "main" {
                    self.collect_main_lets(f);
                }
            }
        }
        for item in &flat {
            if let FlatItem::Fn(f, exported) = item {
                if f.type_params.is_empty() {
                    self.check_fn(f, *exported);
                }
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
        let id = StaticId(self.next_static_id + self.hir.statics.len() as u32);
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
        let base = self.hir.static_region_offset;
        let mut offset = base;
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
        self.hir.static_region_size = align_up(offset.saturating_sub(base), 4);
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
        let mangled = mangle_symbol(&self.module_name, &s.name);
        let layout = StructLayout {
            name: mangled,
            fields: fields.clone(),
            size,
        };
        self.structs.insert(s.name.clone(), layout.clone());
        self.hir.structs.push(layout);
    }

    fn collect_fn_sig(&mut self, f: &FnDef) {
        if self.functions.contains_key(&f.name) || self.generic_fns.contains_key(&f.name) {
            self.error(f.span, format!("duplicate function `{}`", f.name));
            return;
        }
        if (f.name == "main" || f.name == "frame") && !self.is_entry_module {
            self.error(
                f.span,
                format!("`{}` may only be defined in the entry module", f.name),
            );
        }
        if !f.type_params.is_empty() {
            for tp in &f.type_params {
                if let Some(c) = &tp.constraint {
                    if c != "Ord" {
                        self.error(tp.span, format!("unknown constraint `{c}` (only Ord supported)"));
                    }
                }
            }
            let exported = *self.item_exported.get(&f.name).unwrap_or(&false);
            self.generic_fns.insert(f.name.clone(), (f.clone(), exported));
            return;
        }
        let params: Vec<Type> = f.params.iter().map(|p| self.resolve_type(&p.ty)).collect();
        let ret = self.resolve_type(&f.ret);
        let id = FuncId(self.next_func_id + self.functions.len() as u32);
        self.functions.insert(
            f.name.clone(),
            FnSig {
                params,
                ret,
                id,
            },
        );
    }

    fn check_fn(&mut self, f: &FnDef, exported: bool) {
        let sig = self.functions.get(&f.name).cloned().unwrap();
        self.next_local = 0;
        self.fn_local_types.clear();
        self.fn_local_names.clear();
        self.borrow.clear();
        self.expr_place = None;
        self.current_ret = sig.ret.clone();
        self.current_fn = f.name.clone();
        self.locals.clear();
        self.push_scope();

        let mut param_locals = Vec::new();
        for (param, ty) in f.params.iter().zip(sig.params.iter()) {
            let id = self.declare_local(param.name.clone(), ty.clone());
            if let Type::Ref { mutable, .. } = ty {
                let place = BorrowCx::param_place(id.0);
                if let Err(msg) = self.borrow.bind_local(id.0, place, *mutable) {
                    self.error(param.span, msg);
                }
            }
            param_locals.push((id, ty.clone()));
        }

        let body = self.check_block(&f.body);
        self.pop_scope();

        // Entry `main` / `frame` always export. Entry `export fn` also becomes a
        // WASM export so `.jscene` script module/handler can call Juni by name
        // (e.g. module "player" + handler "on_update" → `player_on_update`).
        let wasm_export =
            self.is_entry_module && (f.name == "main" || f.name == "frame" || exported);
        let codegen_name = if wasm_export {
            f.name.clone()
        } else {
            self.mangle(&f.name)
        };
        self.hir.functions.push(HirFunction {
            id: sig.id,
            name: codegen_name,
            pub_name: if exported {
                Some(f.name.clone())
            } else {
                None
            },
            params: param_locals,
            ret: sig.ret,
            locals: self.fn_local_types.clone(),
            body,
            export: wasm_export,
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
                let init_place = self.expr_place;
                let init_from_local = Self::ident_local_id(init).and_then(|n| {
                    self.lookup_local(&n).map(|(_, id)| id.0)
                });
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
                if let Type::Ref { mutable, .. } = &ty {
                    let alias = init_place.unwrap_or(Alias {
                        place: self.borrow.fresh_unknown(),
                        mutable: *mutable,
                    });
                    if let Err(msg) =
                        self.borrow
                            .transfer(init_from_local, id.0, alias.place, *mutable)
                    {
                        self.error(*span, msg);
                    }
                }
                HirStmt::Let {
                    local: id,
                    ty,
                    init: init_expr,
                }
            }
            Stmt::Assign { target, value, span } => {
                let (val, val_ty) = self.check_expr(value);
                let val_place = self.expr_place;
                let val_from_local = Self::ident_local_id(value).and_then(|n| {
                    self.lookup_local(&n).map(|(_, id)| id.0)
                });
                match &target.kind {
                    ExprKind::Ident(name) => {
                        match self.lookup_var(name) {
                            Some(VarRef::Local(ty, id)) => {
                                if !types_compatible(&ty, &val_ty) {
                                    self.error(*span, format!("cannot assign {} to {}", val_ty, ty));
                                }
                                if let Type::Ref { mutable, .. } = &ty {
                                    let alias = val_place.unwrap_or(Alias {
                                        place: self.borrow.fresh_unknown(),
                                        mutable: *mutable,
                                    });
                                    self.borrow.clear_local(id.0);
                                    if let Err(msg) = self.borrow.transfer(
                                        val_from_local,
                                        id.0,
                                        alias.place,
                                        *mutable,
                                    ) {
                                        self.error(*span, msg);
                                    }
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
                                if matches!(ty, Type::Ref { .. }) {
                                    if let Some(alias) = val_place {
                                        if let Err(msg) =
                                            BorrowCx::check_store_escape(alias.place)
                                        {
                                            self.error(*span, msg);
                                        }
                                    }
                                }
                                HirStmt::AssignStatic {
                                    stat: id,
                                    ty,
                                    value: val,
                                }
                            }
                            None => {
                                let notes = self.note_did_you_mean(
                                    name,
                                    self.known_value_names(),
                                );
                                self.error_with_notes(
                                    *span,
                                    format!("undefined variable `{name}`"),
                                    notes,
                                );
                                HirStmt::Expr(val)
                            }
                        }
                    }
                    ExprKind::Field { base, field } => {
                        let (base_e, base_ty) = self.check_expr(base);
                        self.check_ref_write(&base_ty, base, *span);
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
                        self.check_ref_write(&base_ty, base, *span);
                        let (idx_e, idx_ty) = self.check_expr(index);
                        if !matches!(idx_ty, Type::Builtin(Builtin::I32)) {
                            self.error(index.span, "array index must be i32");
                        }
                        match &base_ty {
                            Type::Array { elem, len } => {
                                self.check_const_index_bounds(index, *len);
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
                                    len: *len,
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
                    let ret_place = self.expr_place;
                    if !types_compatible(&self.current_ret, &ty) {
                        self.error(
                            *span,
                            format!("return type mismatch: expected {}, got {}", self.current_ret, ty),
                        );
                    }
                    if matches!(self.current_ret, Type::Ref { .. }) || matches!(ty, Type::Ref { .. })
                    {
                        if let Some(alias) = ret_place {
                            if let Err(msg) = BorrowCx::check_return_place(alias.place) {
                                self.error(*span, msg);
                            }
                        }
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

    fn struct_layout(&self, ty: &Type) -> Option<&StructLayout> {
        match ty {
            Type::Struct(name) => self
                .structs
                .values()
                .find(|l| l.name == *name)
                .or_else(|| {
                    self.structs.get(
                        name.rsplit_once("::").map(|(_, n)| n).unwrap_or(name),
                    )
                }),
            Type::Ref { inner, .. } => self.struct_layout(inner),
            _ => None,
        }
    }

    fn field_info(&mut self, base_ty: &Type, field: &str, span: juni_syntax::Span) -> (Type, u32) {
        let layout = match self.struct_layout(base_ty) {
            Some(l) => l.clone(),
            None => {
                self.error(span, "field access on non-struct");
                return (Type::Builtin(Builtin::I32), 0);
            }
        };
        if let Some(f) = layout.fields.iter().find(|f| f.name == field) {
            return (f.ty.clone(), f.offset);
        }
        let notes = self.note_did_you_mean(
            field,
            layout.fields.iter().map(|f| f.name.clone()),
        );
        self.error_with_notes(
            span,
            format!("no field `{field}` on `{}`", layout.name),
            notes,
        );
        (Type::Builtin(Builtin::I32), 0)
    }

    fn ident_local_id(expr: &Expr) -> Option<String> {
        match &expr.kind {
            ExprKind::Ident(name) => Some(name.clone()),
            _ => None,
        }
    }

    fn known_value_names(&self) -> impl Iterator<Item = String> + '_ {
        let mut names: Vec<String> = Vec::new();
        for scope in &self.locals {
            names.extend(scope.keys().cloned());
        }
        names.extend(self.statics.keys().cloned());
        names.extend(self.functions.keys().cloned());
        names.extend(self.generic_fns.keys().cloned());
        names.into_iter()
    }

    fn known_type_names(&self) -> impl Iterator<Item = String> + '_ {
        let mut names: Vec<String> = vec![
            "i32".into(),
            "i64".into(),
            "f32".into(),
            "f64".into(),
            "bool".into(),
            "str".into(),
            "void".into(),
        ];
        names.extend(self.structs.keys().cloned());
        names.into_iter()
    }

    fn known_fn_names(&self) -> impl Iterator<Item = String> + '_ {
        let mut names: Vec<String> = self.functions.keys().cloned().collect();
        names.extend(self.generic_fns.keys().cloned());
        // Common stdlib / host names for suggestions
        for n in [
            "print", "clamp", "lerp", "str_len", "str_eq", "str_concat", "str_substr", "array_len",
            "min", "max", "abs", "sqrt", "sin", "cos",
        ] {
            names.push(n.into());
        }
        names.into_iter()
    }

    fn check_const_index_bounds(&mut self, index: &Expr, len: u32) {
        if let Some(i) = const_i32_expr(index) {
            if i < 0 || (i as u32) >= len {
                self.error_with_notes(
                    index.span,
                    format!("array index `{i}` out of bounds for length {len}"),
                    [format!("valid indices are `0`..`{}`", len.saturating_sub(1))],
                );
            }
        }
    }

    fn check_ref_write(&mut self, base_ty: &Type, base: &Expr, span: juni_syntax::Span) {
        if let Type::Ref { mutable: false, .. } = base_ty {
            self.error(
                span,
                "cannot write through immutable `ref T` (use `mut ref T`)",
            );
            return;
        }
        if let ExprKind::Ident(name) = &base.kind {
            if let Some((_, id)) = self.lookup_local(name) {
                if matches!(base_ty, Type::Ref { .. }) {
                    match self.borrow.lookup(id.0) {
                        None => {
                            self.error(span, format!("cannot write through moved `mut ref` `{name}`"));
                        }
                        Some(alias) => {
                            if let Err(msg) = self.borrow.check_write_through(alias) {
                                self.error(span, msg);
                            }
                        }
                    }
                }
            }
        }
    }

    fn check_expr(&mut self, expr: &Expr) -> (HirExpr, Type) {
        self.expr_place = None;
        let (hir, ty) = match &expr.kind {
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
                if let Some(qref) = self.resolve_from_import(name, expr.span) {
                    return self.qualified_to_expr(qref, expr.span);
                }
                match self.lookup_var(name) {
                    Some(VarRef::Local(ty, id)) => {
                        if let Type::Ref { mutable, .. } = &ty {
                            match self.borrow.lookup(id.0) {
                                Some(alias) => self.expr_place = Some(alias),
                                None => {
                                    self.error(
                                        expr.span,
                                        format!("use of moved `{ty}` value `{name}`"),
                                    );
                                    self.expr_place = Some(Alias {
                                        place: self.borrow.fresh_unknown(),
                                        mutable: *mutable,
                                    });
                                }
                            }
                        }
                        (HirExpr::Local(id, ty.clone()), ty)
                    }
                    Some(VarRef::Static(ty, id)) => {
                        if let Type::Ref { mutable, .. } = &ty {
                            // Statics are treated as opaque long-lived places.
                            let place = self.borrow.fresh_unknown();
                            self.expr_place = Some(Alias {
                                place,
                                mutable: *mutable,
                            });
                        }
                        (HirExpr::Static(id, ty.clone()), ty)
                    }
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
                        let notes = self.note_did_you_mean(name, self.known_value_names());
                        self.error_with_notes(expr.span, hint, notes);
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
                if let ExprKind::Ident(name) = &callee.kind {
                    if let Some((template, exported)) = self.generic_fns.get(name).cloned() {
                        return self.instantiate_generic_call(&template, exported, args, expr.span);
                    }
                    if let Some(intrinsic) = self.check_host_intrinsic(name, args, expr.span) {
                        return intrinsic;
                    }
                    if let Some(sig) = self.functions.get(name).cloned() {
                        return self.emit_call(sig, args, expr.span);
                    }
                    if let Some(qref) = self.resolve_from_import(name, expr.span) {
                        if let QualifiedRef::Fn(sig) = qref {
                            return self.emit_call(sig, args, expr.span);
                        }
                    }
                    let notes = self.note_did_you_mean(name, self.known_fn_names());
                    self.error_with_notes(
                        expr.span,
                        format!("unknown function `{name}`"),
                        notes,
                    );
                    return (HirExpr::Int(0), Type::Builtin(Builtin::I32));
                }
                if let ExprKind::Field { base, field } = &callee.kind {
                    if let ExprKind::Ident(module_alias) = &base.kind {
                        if let Some(module) = self.lookup_module_alias(module_alias) {
                            if let Some(QualifiedRef::Fn(sig)) =
                                self.resolve_qualified(&module, field, expr.span)
                            {
                                return self.emit_call(sig, args, expr.span);
                            }
                            return (HirExpr::Int(0), Type::Builtin(Builtin::I32));
                        }
                    }
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
                    Type::Array { elem, len } => {
                        self.check_const_index_bounds(index, *len);
                        let elem_size = elem.size(&self.structs);
                        (
                            HirExpr::Index {
                                base: Box::new(base_e),
                                index: Box::new(idx_e),
                                elem_ty: *elem.clone(),
                                elem_size,
                                len: *len,
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
                } else if let Some((module, sym)) = self.imports.from_imports.get(name) {
                    self.resolve_foreign_struct(module, sym).unwrap_or_else(|| {
                        self.error(expr.span, format!("unknown struct `{name}`"));
                        StructLayout {
                            name: name.clone(),
                            fields: vec![],
                            size: 0,
                        }
                    })
                } else {
                    let notes = self.note_did_you_mean(name, self.known_type_names());
                    self.error_with_notes(
                        expr.span,
                        format!("unknown struct `{name}`"),
                        notes,
                    );
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
                        let notes = self.note_did_you_mean(
                            fname,
                            layout.fields.iter().map(|f| f.name.clone()),
                        );
                        self.error_with_notes(
                            fexpr.span,
                            format!("no field `{fname}` on `{name}`"),
                            notes,
                        );
                    }
                }
                (
                    HirExpr::StructLit {
                        size: layout.size,
                        fields: inits,
                    },
                    Type::Struct(layout.name.clone()),
                )
            }
            ExprKind::New { ty, args } => {
                let resolved = self.resolve_type(ty);
                match &resolved {
                    Type::Struct(name) => {
                        let layout = self
                            .structs
                            .values()
                            .find(|l| l.name == *name)
                            .cloned()
                            .unwrap_or_else(|| StructLayout {
                                name: name.clone(),
                                fields: vec![],
                                size: 0,
                            });
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
                        let place = self.borrow.fresh_heap();
                        let ty = Type::Ref {
                            mutable: true,
                            inner: Box::new(Type::Struct(layout.name.clone())),
                        };
                        self.expr_place = Some(Alias {
                            place,
                            mutable: true,
                        });
                        (
                            HirExpr::New {
                                size: layout.size,
                                fields: inits,
                            },
                            ty,
                        )
                    }
                    _ => {
                        self.error(expr.span, "`new` requires a struct type");
                        (HirExpr::Int(0), Type::Builtin(Builtin::I32))
                    }
                }
            }
        };
        // Preserve expr_place set inside Ident/New; clear for other non-ref results.
        if !matches!(ty, Type::Ref { .. }) {
            self.expr_place = None;
        } else if self.expr_place.is_none() {
            // Calls and other ref producers without an explicit place.
            let mutable = matches!(ty, Type::Ref { mutable: true, .. });
            let place = self.borrow.fresh_unknown();
            self.expr_place = Some(Alias { place, mutable });
        }
        (hir, ty)
    }

    fn instantiate_generic_call(
        &mut self,
        template: &FnDef,
        exported: bool,
        args: &[Expr],
        span: juni_syntax::Span,
    ) -> (HirExpr, Type) {
        let mut arg_types = Vec::new();
        for arg in args {
            let (_, ty) = self.check_expr(arg);
            arg_types.push(ty);
        }
        let subst = match infer_substitution(template, &arg_types) {
            Ok(s) => s,
            Err(msg) => {
                self.error(span, msg);
                return (HirExpr::Int(0), Type::Builtin(Builtin::I32));
            }
        };
        let concrete_types: Vec<Type> = template
            .type_params
            .iter()
            .map(|tp| subst.get(&tp.name).cloned().unwrap_or(Type::Builtin(Builtin::I32)))
            .collect();
        let inst_name = mangle_generic_instance(&template.name, &concrete_types);
        if !self.functions.contains_key(&inst_name) {
            let concrete = instantiate_fn_def(template, &subst, inst_name.clone());
            self.collect_fn_sig(&concrete);
            if let Some(sig) = self.functions.get(&inst_name).cloned() {
                self.type_param_scope = Some(subst.clone());
                self.check_instantiated_fn(&concrete, sig, exported);
                self.type_param_scope = None;
            }
        }
        let sig = match self.functions.get(&inst_name).cloned() {
            Some(s) => s,
            None => {
                self.error(span, format!("failed to instantiate `{inst_name}`"));
                return (HirExpr::Int(0), Type::Builtin(Builtin::I32));
            }
        };
        self.emit_call(sig, args, span)
    }

    fn check_instantiated_fn(&mut self, f: &FnDef, sig: FnSig, exported: bool) {
        let saved_locals = std::mem::take(&mut self.locals);
        let saved_next_local = self.next_local;
        let saved_fn_local_types = self.fn_local_types.clone();
        let saved_fn_local_names = self.fn_local_names.clone();
        let saved_current_fn = self.current_fn.clone();
        let saved_current_ret = self.current_ret.clone();
        let saved_borrow = std::mem::take(&mut self.borrow);

        self.next_local = 0;
        self.fn_local_types.clear();
        self.fn_local_names.clear();
        self.borrow.clear();
        self.current_ret = sig.ret.clone();
        self.current_fn = f.name.clone();
        self.locals.clear();
        self.push_scope();

        let mut param_locals = Vec::new();
        for (param, ty) in f.params.iter().zip(sig.params.iter()) {
            let id = self.declare_local(param.name.clone(), ty.clone());
            if let Type::Ref { mutable, .. } = ty {
                let place = BorrowCx::param_place(id.0);
                let _ = self.borrow.bind_local(id.0, place, *mutable);
            }
            param_locals.push((id, ty.clone()));
        }

        let body = self.check_block(&f.body);
        self.pop_scope();

        let codegen_name = self.mangle(&f.name);
        self.hir.functions.push(HirFunction {
            id: sig.id,
            name: codegen_name,
            pub_name: if exported {
                Some(f.name.clone())
            } else {
                None
            },
            params: param_locals,
            ret: sig.ret,
            locals: self.fn_local_types.clone(),
            body,
            export: false,
        });

        self.locals = saved_locals;
        self.next_local = saved_next_local;
        self.fn_local_types = saved_fn_local_types;
        self.fn_local_names = saved_fn_local_names;
        self.current_fn = saved_current_fn;
        self.current_ret = saved_current_ret;
        self.borrow = saved_borrow;
    }

    fn emit_call(
        &mut self,
        sig: FnSig,
        args: &[Expr],
        span: juni_syntax::Span,
    ) -> (HirExpr, Type) {
        if args.len() != sig.params.len() {
            self.error(
                span,
                format!(
                    "function expects {} args, got {}",
                    sig.params.len(),
                    args.len()
                ),
            );
        }
        let mut hir_args = Vec::new();
        let mut ref_arg_places: Vec<(Place, bool)> = Vec::new();
        for (i, arg) in args.iter().enumerate() {
            let (e, ty) = self.check_expr(arg);
            let arg_place = self.expr_place;
            if let Some(expected) = sig.params.get(i) {
                if !types_compatible(expected, &ty) {
                    self.error(
                        arg.span,
                        format!("argument type mismatch: expected {}, got {}", expected, ty),
                    );
                }
                if let Type::Ref { mutable, .. } = expected {
                    let place = arg_place
                        .map(|a| a.place)
                        .unwrap_or_else(|| self.borrow.fresh_unknown());
                    ref_arg_places.push((place, *mutable));
                }
            }
            hir_args.push(e);
        }
        if let Err(msg) = BorrowCx::check_call_arg_places(&ref_arg_places) {
            self.error(span, msg);
        }
        let ret = sig.ret.clone();
        if let Type::Ref { mutable, .. } = &ret {
            let place = self.borrow.fresh_unknown();
            self.expr_place = Some(Alias {
                place,
                mutable: *mutable,
            });
        } else {
            self.expr_place = None;
        }
        (
            HirExpr::Call {
                func: sig.id,
                args: hir_args,
                ty: ret.clone(),
            },
            ret,
        )
    }

    fn qualified_to_expr(
        &mut self,
        qref: QualifiedRef,
        span: juni_syntax::Span,
    ) -> (HirExpr, Type) {
        match qref {
            QualifiedRef::Fn(sig) => {
                self.error(span, "expected value, found function");
                (HirExpr::Int(0), sig.ret)
            }
            QualifiedRef::Struct(layout) => {
                let _ = layout;
                self.error(span, "expected value, found struct type");
                (HirExpr::Int(0), Type::Builtin(Builtin::I32))
            }
            QualifiedRef::Static(ty, id) => (HirExpr::Static(id, ty.clone()), ty),
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

    fn is_ptr_i32(&self, ty: &Type) -> bool {
        matches!(ty, Type::Builtin(Builtin::I32)) || ty.wasm_is_i32_ptr()
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
            "array_len" => {
                if args.len() != 1 {
                    self.error(span, "array_len(xs) expects 1 arg");
                    return Some((HirExpr::Int(0), Type::Builtin(Builtin::I32)));
                }
                let (_a, at) = self.check_arg(args, 0);
                match at {
                    Type::Array { len, .. } => {
                        Some((HirExpr::Int(len as i32), Type::Builtin(Builtin::I32)))
                    }
                    _ => {
                        self.error(span, "array_len requires a fixed array `T[N]`");
                        Some((HirExpr::Int(0), Type::Builtin(Builtin::I32)))
                    }
                }
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
            "scene3d_create_node" => {
                if !args.is_empty() {
                    self.error(span, "scene3d_create_node takes no args");
                }
                Some((
                    HirExpr::Scene3dCreateNode,
                    Type::Builtin(Builtin::I32),
                ))
            }
            "scene3d_set_parent" => {
                if args.len() != 2 {
                    self.error(span, "scene3d_set_parent(child, parent) expects 2 args");
                }
                let (child, ct) = self.check_arg(args, 0);
                let (parent, pt) = self.check_arg(args, 1);
                if !self.is_ptr_i32(&ct) || !matches!(pt, Type::Builtin(Builtin::I32)) {
                    self.error(span, "scene3d_set_parent handles must be i32");
                }
                Some((
                    HirExpr::Scene3dSetParent {
                        child: Box::new(child),
                        parent: Box::new(parent),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "camera3d_look_at" => {
                if args.len() != 7 {
                    self.error(span, "camera3d_look_at(cam, ex, ey, ez, tx, ty, tz) expects 7 args");
                }
                let (cam, ct) = self.check_arg(args, 0);
                if !matches!(ct, Type::Builtin(Builtin::I32)) {
                    self.error(span, "camera handle must be i32");
                }
                let mut xs = Vec::new();
                for i in 1..7 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "camera3d_look_at arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::Camera3dLookAt {
                        cam: Box::new(cam),
                        ex: Box::new(xs.remove(0)),
                        ey: Box::new(xs.remove(0)),
                        ez: Box::new(xs.remove(0)),
                        tx: Box::new(xs.remove(0)),
                        ty: Box::new(xs.remove(0)),
                        tz: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "camera3d_orbit" => {
                if args.len() != 7 {
                    self.error(
                        span,
                        "camera3d_orbit(cam, tx, ty, tz, yaw, pitch, dist) expects 7 args",
                    );
                }
                let (cam, ct) = self.check_arg(args, 0);
                if !matches!(ct, Type::Builtin(Builtin::I32)) {
                    self.error(span, "camera handle must be i32");
                }
                let mut xs = Vec::new();
                for i in 1..7 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "camera3d_orbit arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::Camera3dOrbit {
                        cam: Box::new(cam),
                        target_x: Box::new(xs.remove(0)),
                        target_y: Box::new(xs.remove(0)),
                        target_z: Box::new(xs.remove(0)),
                        yaw: Box::new(xs.remove(0)),
                        pitch: Box::new(xs.remove(0)),
                        distance: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "mesh3d_custom" => {
                if args.len() != 4 {
                    self.error(
                        span,
                        "mesh3d_custom(verts_ptr, vert_count, indices_ptr, index_count) expects 4 args",
                    );
                }
                let (verts_ptr, vpt) = self.check_arg(args, 0);
                let (vert_count, vct) = self.check_arg(args, 1);
                let (indices_ptr, ipt) = self.check_arg(args, 2);
                let (index_count, ict) = self.check_arg(args, 3);
                if !self.is_ptr_i32(&vpt) {
                    self.error(span, "mesh3d_custom verts_ptr must be i32 or array pointer");
                }
                if !matches!(vct, Type::Builtin(Builtin::I32)) {
                    self.error(span, "mesh3d_custom vert_count must be i32");
                }
                if !self.is_ptr_i32(&ipt) {
                    self.error(span, "mesh3d_custom indices_ptr must be i32 or array pointer");
                }
                if !matches!(ict, Type::Builtin(Builtin::I32)) {
                    self.error(span, "mesh3d_custom index_count must be i32");
                }
                Some((
                    HirExpr::Mesh3dCustom {
                        verts_ptr: Box::new(verts_ptr),
                        vert_count: Box::new(vert_count),
                        indices_ptr: Box::new(indices_ptr),
                        index_count: Box::new(index_count),
                    },
                    Type::Builtin(Builtin::I32),
                ))
            }
            "material3d_color" => {
                if args.len() != 4 {
                    self.error(span, "material3d_color(r, g, b, a) expects 4 args");
                }
                let mut xs = Vec::new();
                for i in 0..4 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "material3d_color arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::Material3dColor {
                        r: Box::new(xs.remove(0)),
                        g: Box::new(xs.remove(0)),
                        b: Box::new(xs.remove(0)),
                        a: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::I32),
                ))
            }
            "mesh3d_set_material" => {
                if args.len() != 2 {
                    self.error(span, "mesh3d_set_material(mesh, material) expects 2 args");
                }
                let (mesh, mt) = self.check_arg(args, 0);
                let (material, mat) = self.check_arg(args, 1);
                if !matches!(mt, Type::Builtin(Builtin::I32))
                    || !matches!(mat, Type::Builtin(Builtin::I32))
                {
                    self.error(span, "mesh3d_set_material handles must be i32");
                }
                Some((
                    HirExpr::Mesh3dSetMaterial {
                        mesh: Box::new(mesh),
                        material: Box::new(material),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "asset_load_str" => {
                if args.len() != 1 {
                    self.error(span, "asset_load_str(path) expects 1 arg");
                }
                let (path, pt) = self.check_arg(args, 0);
                if !matches!(pt, Type::Builtin(Builtin::Str)) {
                    self.error(span, "asset_load_str path must be str");
                }
                Some((
                    HirExpr::AssetLoadStr {
                        path: Box::new(path),
                    },
                    Type::Builtin(Builtin::I32),
                ))
            }
            "sprite_draw" => {
                if args.len() != 5 {
                    self.error(span, "sprite_draw(handle, x, y, w, h) expects 5 args");
                }
                let (handle, ht) = self.check_arg(args, 0);
                if !matches!(ht, Type::Builtin(Builtin::I32)) {
                    self.error(span, "sprite_draw handle must be i32");
                }
                let mut xs = Vec::new();
                for i in 1..5 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "sprite_draw arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::SpriteDraw {
                        handle: Box::new(handle),
                        x: Box::new(xs.remove(0)),
                        y: Box::new(xs.remove(0)),
                        w: Box::new(xs.remove(0)),
                        h: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "mesh_load_obj" => {
                if args.len() != 1 {
                    self.error(span, "mesh_load_obj(path) expects 1 arg");
                }
                let (path, pt) = self.check_arg(args, 0);
                if !matches!(pt, Type::Builtin(Builtin::Str)) {
                    self.error(span, "mesh_load_obj path must be str");
                }
                Some((
                    HirExpr::MeshLoadObj {
                        path: Box::new(path),
                    },
                    Type::Builtin(Builtin::I32),
                ))
            }
            "aabb_overlap" => {
                if args.len() != 2 {
                    self.error(span, "aabb_overlap(a, b) expects 2 args");
                }
                let (a, at) = self.check_arg(args, 0);
                let (b, bt) = self.check_arg(args, 1);
                if !at.wasm_is_i32_ptr() || !bt.wasm_is_i32_ptr() {
                    self.error(span, "aabb_overlap requires Aabb struct values");
                }
                Some((
                    HirExpr::AabbOverlap {
                        a: Box::new(a),
                        b: Box::new(b),
                    },
                    Type::Builtin(Builtin::Bool),
                ))
            }
            "aabb_resolve_x" => {
                if args.len() != 3 {
                    self.error(span, "aabb_resolve_x(moving, other, vel_x) expects 3 args");
                }
                let (moving, mt) = self.check_arg(args, 0);
                let (other, ot) = self.check_arg(args, 1);
                let (vel, vt) = self.check_arg(args, 2);
                if !mt.wasm_is_i32_ptr() || !ot.wasm_is_i32_ptr() {
                    self.error(span, "aabb_resolve_x requires Aabb struct values");
                }
                self.expect_f32ish(&vt, span, "aabb_resolve_x vel_x");
                Some((
                    HirExpr::AabbResolveX {
                        moving: Box::new(moving),
                        other: Box::new(other),
                        vel_x: Box::new(vel),
                    },
                    Type::Builtin(Builtin::F32),
                ))
            }
            "audio_load" => {
                if args.len() != 1 {
                    self.error(span, "audio_load(path) expects 1 arg");
                }
                let (path, pt) = self.check_arg(args, 0);
                if !matches!(pt, Type::Builtin(Builtin::Str)) {
                    self.error(span, "audio_load path must be str");
                }
                Some((
                    HirExpr::AudioLoad(Box::new(path)),
                    Type::Builtin(Builtin::I32),
                ))
            }
            "audio_play" => {
                if args.len() != 1 {
                    self.error(span, "audio_play(handle) expects 1 arg");
                }
                let (handle, ht) = self.check_arg(args, 0);
                if !matches!(ht, Type::Builtin(Builtin::I32)) {
                    self.error(span, "audio_play handle must be i32");
                }
                Some((
                    HirExpr::AudioPlay(Box::new(handle)),
                    Type::Builtin(Builtin::Void),
                ))
            }
            "world_create" => {
                if !args.is_empty() {
                    self.error(span, "world_create takes no args");
                }
                Some((HirExpr::WorldCreate, Type::Builtin(Builtin::I32)))
            }
            "entity_create" => {
                if !args.is_empty() {
                    self.error(span, "entity_create takes no args");
                }
                Some((HirExpr::EntityCreate, Type::Builtin(Builtin::I32)))
            }
            "entity_destroy" => {
                if args.len() != 1 {
                    self.error(span, "entity_destroy(id) expects 1 arg");
                }
                let (id, it) = self.check_arg(args, 0);
                if !matches!(it, Type::Builtin(Builtin::I32)) {
                    self.error(span, "entity_destroy id must be i32");
                }
                Some((
                    HirExpr::EntityDestroy(Box::new(id)),
                    Type::Builtin(Builtin::Void),
                ))
            }
            "entity_set_tag" => {
                if args.len() != 2 {
                    self.error(span, "entity_set_tag(id, tag) expects 2 args");
                }
                let (id, it) = self.check_arg(args, 0);
                let (tag, tt) = self.check_arg(args, 1);
                if !matches!(it, Type::Builtin(Builtin::I32)) {
                    self.error(span, "entity_set_tag id must be i32");
                }
                if !matches!(tt, Type::Builtin(Builtin::Str)) {
                    self.error(span, "entity_set_tag tag must be str");
                }
                Some((
                    HirExpr::EntitySetTag {
                        id: Box::new(id),
                        tag: Box::new(tag),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "entity_find_by_tag" => {
                if args.len() != 1 {
                    self.error(span, "entity_find_by_tag(tag) expects 1 arg");
                }
                let (tag, tt) = self.check_arg(args, 0);
                if !matches!(tt, Type::Builtin(Builtin::Str)) {
                    self.error(span, "entity_find_by_tag tag must be str");
                }
                Some((
                    HirExpr::EntityFindByTag(Box::new(tag)),
                    Type::Builtin(Builtin::I32),
                ))
            }
            "transform2d_set" => {
                if args.len() != 6 {
                    self.error(span, "transform2d_set(id,x,y,rot,sx,sy) expects 6 args");
                }
                let (id, it) = self.check_arg(args, 0);
                if !matches!(it, Type::Builtin(Builtin::I32)) {
                    self.error(span, "transform2d_set id must be i32");
                }
                let mut xs = Vec::new();
                for i in 1..6 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "transform2d_set arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::Transform2dSet {
                        id: Box::new(id),
                        x: Box::new(xs.remove(0)),
                        y: Box::new(xs.remove(0)),
                        rot: Box::new(xs.remove(0)),
                        sx: Box::new(xs.remove(0)),
                        sy: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "transform3d_set" => {
                if args.len() != 10 {
                    self.error(
                        span,
                        "transform3d_set(id,tx,ty,tz,rx,ry,rz,sx,sy,sz) expects 10 args",
                    );
                }
                let (id, it) = self.check_arg(args, 0);
                if !matches!(it, Type::Builtin(Builtin::I32)) {
                    self.error(span, "transform3d_set id must be i32");
                }
                let mut xs = Vec::new();
                for i in 1..10 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "transform3d_set arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::Transform3dSet {
                        id: Box::new(id),
                        tx: Box::new(xs.remove(0)),
                        ty: Box::new(xs.remove(0)),
                        tz: Box::new(xs.remove(0)),
                        rx: Box::new(xs.remove(0)),
                        ry: Box::new(xs.remove(0)),
                        rz: Box::new(xs.remove(0)),
                        sx: Box::new(xs.remove(0)),
                        sy: Box::new(xs.remove(0)),
                        sz: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "sprite_set" => {
                if args.len() != 4 {
                    self.error(span, "sprite_set(id, tex, w, h) expects 4 args");
                }
                let (id, it) = self.check_arg(args, 0);
                let (tex, tt) = self.check_arg(args, 1);
                if !matches!(it, Type::Builtin(Builtin::I32))
                    || !matches!(tt, Type::Builtin(Builtin::I32))
                {
                    self.error(span, "sprite_set id/tex must be i32");
                }
                let (w, wt) = self.check_arg(args, 2);
                let (h, ht) = self.check_arg(args, 3);
                self.expect_f32ish(&wt, span, "sprite_set w");
                self.expect_f32ish(&ht, span, "sprite_set h");
                Some((
                    HirExpr::SpriteSet {
                        id: Box::new(id),
                        tex: Box::new(tex),
                        w: Box::new(w),
                        h: Box::new(h),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "mesh3d_attach" => {
                if args.len() != 2 {
                    self.error(span, "mesh3d_attach(id, mesh) expects 2 args");
                }
                let (id, it) = self.check_arg(args, 0);
                let (mesh, mt) = self.check_arg(args, 1);
                if !matches!(it, Type::Builtin(Builtin::I32))
                    || !matches!(mt, Type::Builtin(Builtin::I32))
                {
                    self.error(span, "mesh3d_attach handles must be i32");
                }
                Some((
                    HirExpr::Mesh3dAttach {
                        id: Box::new(id),
                        mesh: Box::new(mesh),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "world_step" => {
                if args.len() != 1 {
                    self.error(span, "world_step(dt) expects 1 arg");
                }
                let (dt, dt_t) = self.check_arg(args, 0);
                self.expect_f32ish(&dt_t, span, "world_step dt");
                Some((
                    HirExpr::WorldStep(Box::new(dt)),
                    Type::Builtin(Builtin::Void),
                ))
            }
            "scene_load" => {
                if args.len() != 1 {
                    self.error(span, "scene_load(path) expects 1 arg");
                }
                let (path, pt) = self.check_arg(args, 0);
                if !matches!(pt, Type::Builtin(Builtin::Str)) {
                    self.error(span, "scene_load path must be str");
                }
                Some((
                    HirExpr::SceneLoad(Box::new(path)),
                    Type::Builtin(Builtin::I32),
                ))
            }
            "camera2d_set" => {
                if args.len() != 4 {
                    self.error(span, "camera2d_set(id, x, y, zoom) expects 4 args");
                }
                let (id, it) = self.check_arg(args, 0);
                if !matches!(it, Type::Builtin(Builtin::I32)) {
                    self.error(span, "camera2d_set id must be i32");
                }
                let mut xs = Vec::new();
                for i in 1..4 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "camera2d_set arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::Camera2dSet {
                        id: Box::new(id),
                        x: Box::new(xs.remove(0)),
                        y: Box::new(xs.remove(0)),
                        zoom: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "tilemap_load" => {
                if args.len() != 1 {
                    self.error(span, "tilemap_load(path) expects 1 arg");
                }
                let (path, pt) = self.check_arg(args, 0);
                if !matches!(pt, Type::Builtin(Builtin::Str)) {
                    self.error(span, "tilemap_load path must be str");
                }
                Some((
                    HirExpr::TilemapLoad(Box::new(path)),
                    Type::Builtin(Builtin::I32),
                ))
            }
            "tilemap_attach" => {
                if args.len() != 2 {
                    self.error(span, "tilemap_attach(entity, tilemap) expects 2 args");
                }
                let (entity, et) = self.check_arg(args, 0);
                let (tilemap, tt) = self.check_arg(args, 1);
                if !matches!(et, Type::Builtin(Builtin::I32))
                    || !matches!(tt, Type::Builtin(Builtin::I32))
                {
                    self.error(span, "tilemap_attach handles must be i32");
                }
                Some((
                    HirExpr::TilemapAttach {
                        entity: Box::new(entity),
                        tilemap: Box::new(tilemap),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "world_draw" => {
                if args.len() != 1 {
                    self.error(span, "world_draw(cam_entity) expects 1 arg");
                }
                let (cam, ct) = self.check_arg(args, 0);
                if !matches!(ct, Type::Builtin(Builtin::I32)) {
                    self.error(span, "world_draw cam must be i32");
                }
                Some((
                    HirExpr::WorldDraw(Box::new(cam)),
                    Type::Builtin(Builtin::Void),
                ))
            }
            "material3d_texture" => {
                if args.len() != 1 {
                    self.error(span, "material3d_texture(asset) expects 1 arg");
                }
                let (asset, at) = self.check_arg(args, 0);
                if !matches!(at, Type::Builtin(Builtin::I32)) {
                    self.error(span, "material3d_texture asset must be i32");
                }
                Some((
                    HirExpr::Material3dTexture(Box::new(asset)),
                    Type::Builtin(Builtin::I32),
                ))
            }
            "light3d_directional" => {
                if args.len() != 6 {
                    self.error(span, "light3d_directional(dx,dy,dz,r,g,b) expects 6 args");
                }
                let mut xs = Vec::new();
                for i in 0..6 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "light3d_directional arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::Light3dDirectional {
                        dx: Box::new(xs.remove(0)),
                        dy: Box::new(xs.remove(0)),
                        dz: Box::new(xs.remove(0)),
                        r: Box::new(xs.remove(0)),
                        g: Box::new(xs.remove(0)),
                        b: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::I32),
                ))
            }
            "light3d_point" => {
                if args.len() != 7 {
                    self.error(span, "light3d_point(x,y,z,r,g,b,range) expects 7 args");
                }
                let mut xs = Vec::new();
                for i in 0..7 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "light3d_point arg");
                    xs.push(e);
                }
                Some((
                    HirExpr::Light3dPoint {
                        x: Box::new(xs.remove(0)),
                        y: Box::new(xs.remove(0)),
                        z: Box::new(xs.remove(0)),
                        r: Box::new(xs.remove(0)),
                        g: Box::new(xs.remove(0)),
                        b: Box::new(xs.remove(0)),
                        range: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::I32),
                ))
            }
            "mesh_load_gltf" => {
                if args.len() != 1 {
                    self.error(span, "mesh_load_gltf(path) expects 1 arg");
                }
                let (path, pt) = self.check_arg(args, 0);
                if !matches!(pt, Type::Builtin(Builtin::Str)) {
                    self.error(span, "mesh_load_gltf path must be str");
                }
                Some((
                    HirExpr::MeshLoadGltf(Box::new(path)),
                    Type::Builtin(Builtin::I32),
                ))
            }
            "aabb_resolve_y" => {
                if args.len() != 3 {
                    self.error(span, "aabb_resolve_y(moving, other, vel_y) expects 3 args");
                }
                let (moving, mt) = self.check_arg(args, 0);
                let (other, ot) = self.check_arg(args, 1);
                let (vel, vt) = self.check_arg(args, 2);
                if !mt.wasm_is_i32_ptr() || !ot.wasm_is_i32_ptr() {
                    self.error(span, "aabb_resolve_y requires Aabb struct values");
                }
                self.expect_f32ish(&vt, span, "aabb_resolve_y vel_y");
                Some((
                    HirExpr::AabbResolveY {
                        moving: Box::new(moving),
                        other: Box::new(other),
                        vel_y: Box::new(vel),
                    },
                    Type::Builtin(Builtin::F32),
                ))
            }
            "audio_play_loop" => {
                if args.len() != 1 {
                    self.error(span, "audio_play_loop(handle) expects 1 arg");
                }
                let (handle, ht) = self.check_arg(args, 0);
                if !matches!(ht, Type::Builtin(Builtin::I32)) {
                    self.error(span, "audio_play_loop handle must be i32");
                }
                Some((
                    HirExpr::AudioPlayLoop(Box::new(handle)),
                    Type::Builtin(Builtin::Void),
                ))
            }
            "audio_set_volume" => {
                if args.len() != 2 {
                    self.error(span, "audio_set_volume(handle, volume) expects 2 args");
                }
                let (handle, ht) = self.check_arg(args, 0);
                let (vol, vt) = self.check_arg(args, 1);
                if !matches!(ht, Type::Builtin(Builtin::I32)) {
                    self.error(span, "audio_set_volume handle must be i32");
                }
                self.expect_f32ish(&vt, span, "audio_set_volume volume");
                Some((
                    HirExpr::AudioSetVolume {
                        handle: Box::new(handle),
                        volume: Box::new(vol),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "audio_stop" => {
                if args.len() != 1 {
                    self.error(span, "audio_stop(handle) expects 1 arg");
                }
                let (handle, ht) = self.check_arg(args, 0);
                if !matches!(ht, Type::Builtin(Builtin::I32)) {
                    self.error(span, "audio_stop handle must be i32");
                }
                Some((
                    HirExpr::AudioStop(Box::new(handle)),
                    Type::Builtin(Builtin::Void),
                ))
            }
            "audio_set_bus_volume" => {
                if args.len() != 1 {
                    self.error(span, "audio_set_bus_volume(volume) expects 1 arg");
                }
                let (vol, vt) = self.check_arg(args, 0);
                self.expect_f32ish(&vt, span, "audio_set_bus_volume volume");
                Some((
                    HirExpr::AudioSetBusVolume(Box::new(vol)),
                    Type::Builtin(Builtin::Void),
                ))
            }
            "gamepad_axis" => {
                if args.len() != 2 {
                    self.error(span, "gamepad_axis(pad, axis) expects 2 args");
                }
                let (pad, pt) = self.check_arg(args, 0);
                let (axis, at) = self.check_arg(args, 1);
                if !matches!(pt, Type::Builtin(Builtin::I32))
                    || !matches!(at, Type::Builtin(Builtin::I32))
                {
                    self.error(span, "gamepad_axis args must be i32");
                }
                Some((
                    HirExpr::GamepadAxis {
                        pad: Box::new(pad),
                        axis: Box::new(axis),
                    },
                    Type::Builtin(Builtin::F32),
                ))
            }
            "gamepad_button" => {
                if args.len() != 2 {
                    self.error(span, "gamepad_button(pad, button) expects 2 args");
                }
                let (pad, pt) = self.check_arg(args, 0);
                let (button, bt) = self.check_arg(args, 1);
                if !matches!(pt, Type::Builtin(Builtin::I32))
                    || !matches!(bt, Type::Builtin(Builtin::I32))
                {
                    self.error(span, "gamepad_button args must be i32");
                }
                Some((
                    HirExpr::GamepadButton {
                        pad: Box::new(pad),
                        button: Box::new(button),
                    },
                    Type::Builtin(Builtin::I32),
                ))
            }
            "collision_count" => {
                if !args.is_empty() {
                    self.error(span, "collision_count() expects 0 args");
                }
                Some((HirExpr::CollisionCount, Type::Builtin(Builtin::I32)))
            }
            "collision_entity_a" => {
                if args.len() != 1 {
                    self.error(span, "collision_entity_a(i) expects 1 arg");
                }
                let (i, it) = self.check_arg(args, 0);
                if !matches!(it, Type::Builtin(Builtin::I32)) {
                    self.error(span, "collision_entity_a i must be i32");
                }
                Some((
                    HirExpr::CollisionEntityA(Box::new(i)),
                    Type::Builtin(Builtin::I32),
                ))
            }
            "collision_entity_b" => {
                if args.len() != 1 {
                    self.error(span, "collision_entity_b(i) expects 1 arg");
                }
                let (i, it) = self.check_arg(args, 0);
                if !matches!(it, Type::Builtin(Builtin::I32)) {
                    self.error(span, "collision_entity_b i must be i32");
                }
                Some((
                    HirExpr::CollisionEntityB(Box::new(i)),
                    Type::Builtin(Builtin::I32),
                ))
            }
            "collision_is_trigger" => {
                if args.len() != 1 {
                    self.error(span, "collision_is_trigger(i) expects 1 arg");
                }
                let (i, it) = self.check_arg(args, 0);
                if !matches!(it, Type::Builtin(Builtin::I32)) {
                    self.error(span, "collision_is_trigger i must be i32");
                }
                Some((
                    HirExpr::CollisionIsTrigger(Box::new(i)),
                    Type::Builtin(Builtin::I32),
                ))
            }
            "rigidbody2d_set_vel" => {
                if args.len() != 3 {
                    self.error(span, "rigidbody2d_set_vel(id, vx, vy) expects 3 args");
                }
                let (id, it) = self.check_arg(args, 0);
                if !matches!(it, Type::Builtin(Builtin::I32)) {
                    self.error(span, "rigidbody2d_set_vel id must be i32");
                }
                let (vx, vt) = self.check_arg(args, 1);
                let (vy, yt) = self.check_arg(args, 2);
                self.expect_f32ish(&vt, span, "rigidbody2d_set_vel vx");
                self.expect_f32ish(&yt, span, "rigidbody2d_set_vel vy");
                Some((
                    HirExpr::Rigidbody2dSetVel {
                        id: Box::new(id),
                        vx: Box::new(vx),
                        vy: Box::new(vy),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "rigidbody2d_get_grounded" => {
                if args.len() != 1 {
                    self.error(span, "rigidbody2d_get_grounded(id) expects 1 arg");
                }
                let (id, it) = self.check_arg(args, 0);
                if !matches!(it, Type::Builtin(Builtin::I32)) {
                    self.error(span, "rigidbody2d_get_grounded id must be i32");
                }
                Some((
                    HirExpr::Rigidbody2dGetGrounded(Box::new(id)),
                    Type::Builtin(Builtin::I32),
                ))
            }
            "collider2d_set" => {
                if args.len() != 6 {
                    self.error(
                        span,
                        "collider2d_set(id, kind, w, h, radius, solid) expects 6 args",
                    );
                }
                let (id, it) = self.check_arg(args, 0);
                let (kind, kt) = self.check_arg(args, 1);
                if !matches!(it, Type::Builtin(Builtin::I32))
                    || !matches!(kt, Type::Builtin(Builtin::I32))
                {
                    self.error(span, "collider2d_set id/kind must be i32");
                }
                let mut xs = Vec::new();
                for i in 2..5 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "collider2d_set size");
                    xs.push(e);
                }
                let (solid, st) = self.check_arg(args, 5);
                if !matches!(st, Type::Builtin(Builtin::I32)) {
                    self.error(span, "collider2d_set solid must be i32");
                }
                Some((
                    HirExpr::Collider2dSet {
                        id: Box::new(id),
                        kind: Box::new(kind),
                        w: Box::new(xs.remove(0)),
                        h: Box::new(xs.remove(0)),
                        radius: Box::new(xs.remove(0)),
                        solid: Box::new(solid),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "rigidbody3d_set_vel" => {
                if args.len() != 4 {
                    self.error(span, "rigidbody3d_set_vel(id, vx, vy, vz) expects 4 args");
                }
                let (id, it) = self.check_arg(args, 0);
                if !matches!(it, Type::Builtin(Builtin::I32)) {
                    self.error(span, "rigidbody3d_set_vel id must be i32");
                }
                let (vx, vt) = self.check_arg(args, 1);
                let (vy, yt) = self.check_arg(args, 2);
                let (vz, zt) = self.check_arg(args, 3);
                self.expect_f32ish(&vt, span, "rigidbody3d_set_vel vx");
                self.expect_f32ish(&yt, span, "rigidbody3d_set_vel vy");
                self.expect_f32ish(&zt, span, "rigidbody3d_set_vel vz");
                Some((
                    HirExpr::Rigidbody3dSetVel {
                        id: Box::new(id),
                        vx: Box::new(vx),
                        vy: Box::new(vy),
                        vz: Box::new(vz),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "rigidbody3d_get_grounded" => {
                if args.len() != 1 {
                    self.error(span, "rigidbody3d_get_grounded(id) expects 1 arg");
                }
                let (id, it) = self.check_arg(args, 0);
                if !matches!(it, Type::Builtin(Builtin::I32)) {
                    self.error(span, "rigidbody3d_get_grounded id must be i32");
                }
                Some((
                    HirExpr::Rigidbody3dGetGrounded(Box::new(id)),
                    Type::Builtin(Builtin::I32),
                ))
            }
            "collider3d_set" => {
                if args.len() != 6 {
                    self.error(
                        span,
                        "collider3d_set(id, kind, w, h, d, solid) expects 6 args",
                    );
                }
                let (id, it) = self.check_arg(args, 0);
                let (kind, kt) = self.check_arg(args, 1);
                if !matches!(it, Type::Builtin(Builtin::I32))
                    || !matches!(kt, Type::Builtin(Builtin::I32))
                {
                    self.error(span, "collider3d_set id/kind must be i32");
                }
                let mut xs = Vec::new();
                for i in 2..5 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "collider3d_set size");
                    xs.push(e);
                }
                let (solid, st) = self.check_arg(args, 5);
                if !matches!(st, Type::Builtin(Builtin::I32)) {
                    self.error(span, "collider3d_set solid must be i32");
                }
                Some((
                    HirExpr::Collider3dSet {
                        id: Box::new(id),
                        kind: Box::new(kind),
                        w: Box::new(xs.remove(0)),
                        h: Box::new(xs.remove(0)),
                        d: Box::new(xs.remove(0)),
                        solid: Box::new(solid),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "transform3d_sync_from_2d" => {
                if args.len() != 1 {
                    self.error(span, "transform3d_sync_from_2d(id) expects 1 arg");
                }
                let (id, it) = self.check_arg(args, 0);
                if !matches!(it, Type::Builtin(Builtin::I32)) {
                    self.error(span, "transform3d_sync_from_2d id must be i32");
                }
                Some((
                    HirExpr::Transform3dSyncFrom2d(Box::new(id)),
                    Type::Builtin(Builtin::Void),
                ))
            }
            "anim_play" => {
                if args.len() != 2 {
                    self.error(span, "anim_play(id, clip) expects 2 args");
                }
                let (id, it) = self.check_arg(args, 0);
                let (clip, ct) = self.check_arg(args, 1);
                if !matches!(it, Type::Builtin(Builtin::I32)) {
                    self.error(span, "anim_play id must be i32");
                }
                if !matches!(ct, Type::Builtin(Builtin::Str)) {
                    self.error(span, "anim_play clip must be str");
                }
                Some((
                    HirExpr::AnimPlay {
                        id: Box::new(id),
                        clip: Box::new(clip),
                    },
                    Type::Builtin(Builtin::I32),
                ))
            }
            "anim_stop" => {
                if args.len() != 1 {
                    self.error(span, "anim_stop(id) expects 1 arg");
                }
                let (id, it) = self.check_arg(args, 0);
                if !matches!(it, Type::Builtin(Builtin::I32)) {
                    self.error(span, "anim_stop id must be i32");
                }
                Some((
                    HirExpr::AnimStop(Box::new(id)),
                    Type::Builtin(Builtin::Void),
                ))
            }
            "camera2d_follow" => {
                if args.len() != 3 {
                    self.error(span, "camera2d_follow(cam, target, smooth) expects 3 args");
                }
                let (cam, ct) = self.check_arg(args, 0);
                let (target, tt) = self.check_arg(args, 1);
                if !matches!(ct, Type::Builtin(Builtin::I32))
                    || !matches!(tt, Type::Builtin(Builtin::I32))
                {
                    self.error(span, "camera2d_follow cam/target must be i32");
                }
                let (smooth, st) = self.check_arg(args, 2);
                self.expect_f32ish(&st, span, "camera2d_follow smooth");
                Some((
                    HirExpr::Camera2dFollow {
                        cam: Box::new(cam),
                        target: Box::new(target),
                        smooth: Box::new(smooth),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "prefab_spawn" => {
                if args.len() != 3 {
                    self.error(span, "prefab_spawn(path, x, y) expects 3 args");
                }
                let (path, pt) = self.check_arg(args, 0);
                if !matches!(pt, Type::Builtin(Builtin::Str)) {
                    self.error(span, "prefab_spawn path must be str");
                }
                let (x, xt) = self.check_arg(args, 1);
                let (y, yt) = self.check_arg(args, 2);
                self.expect_f32ish(&xt, span, "prefab_spawn x");
                self.expect_f32ish(&yt, span, "prefab_spawn y");
                Some((
                    HirExpr::PrefabSpawn {
                        path: Box::new(path),
                        x: Box::new(x),
                        y: Box::new(y),
                    },
                    Type::Builtin(Builtin::I32),
                ))
            }
            "world_draw3d" => {
                if args.len() != 1 {
                    self.error(span, "world_draw3d(cam) expects 1 arg");
                }
                let (cam, ct) = self.check_arg(args, 0);
                if !matches!(ct, Type::Builtin(Builtin::I32)) {
                    self.error(span, "world_draw3d cam must be i32");
                }
                Some((
                    HirExpr::WorldDraw3d(Box::new(cam)),
                    Type::Builtin(Builtin::Void),
                ))
            }
            "scene3d_set_ambient" => {
                if args.len() != 3 {
                    self.error(span, "scene3d_set_ambient(r,g,b) expects 3 args");
                }
                let mut xs = Vec::new();
                for i in 0..3 {
                    let (e, t) = self.check_arg(args, i);
                    self.expect_f32ish(&t, span, "scene3d_set_ambient");
                    xs.push(e);
                }
                Some((
                    HirExpr::Scene3dSetAmbient {
                        r: Box::new(xs.remove(0)),
                        g: Box::new(xs.remove(0)),
                        b: Box::new(xs.remove(0)),
                    },
                    Type::Builtin(Builtin::Void),
                ))
            }
            "scene3d_set_fog" => {
                if args.len() != 1 {
                    self.error(span, "scene3d_set_fog(density) expects 1 arg");
                }
                let (d, dt) = self.check_arg(args, 0);
                self.expect_f32ish(&dt, span, "scene3d_set_fog");
                Some((
                    HirExpr::Scene3dSetFog(Box::new(d)),
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

fn const_i32_expr(expr: &Expr) -> Option<i32> {
    match &expr.kind {
        ExprKind::Int(v) => {
            if *v >= i64::from(i32::MIN) && *v <= i64::from(i32::MAX) {
                Some(*v as i32)
            } else {
                None
            }
        }
        ExprKind::Unary {
            op: UnaryOp::Neg,
            expr: inner,
        } => const_i32_expr(inner).and_then(|n| n.checked_neg()),
        _ => None,
    }
}

fn types_compatible(a: &Type, b: &Type) -> bool {
    match (a, b) {
        (Type::Builtin(x), Type::Builtin(y)) => x == y,
        (Type::Struct(x), Type::Struct(y)) => x == y,
        (Type::TypeParam(x), Type::TypeParam(y)) => x == y,
        (Type::TypeParam(_), _) | (_, Type::TypeParam(_)) => true,
        (Type::Array { elem: e1, len: l1 }, Type::Array { elem: e2, len: l2 }) => {
            l1 == l2 && types_compatible(e1, e2)
        }
        (Type::Ref { mutable: m1, inner: i1 }, Type::Ref { mutable: m2, inner: i2 }) => {
            // expected (a) vs actual (b): `mut ref` required only if expected is mutable;
            // immutable `ref` accepts either.
            types_compatible(i1, i2) && (*m2 || !*m1)
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
    fn array_len_lowers_to_const() {
        let src = r#"fn main() -> i32:
    let xs = [1, 2, 3, 4]
    return array_len(xs)
"#;
        let m = parse(src).unwrap();
        let hir = check_ok(&m).unwrap();
        let main = hir.functions.iter().find(|f| f.name == "main").unwrap();
        assert!(
            main.body.stmts.iter().any(|s| {
                matches!(s, HirStmt::Return(Some(HirExpr::Int(4))))
            }),
            "expected `return array_len(xs)` to lower to `return 4`: {:?}",
            main.body
        );
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

    #[test]
    fn entry_export_fn_is_wasm_export() {
        let src = r#"export fn player_on_update(entity_id: i32, dt: f32) -> i32:
    return entity_id

fn main() -> i32:
    return 0
"#;
        let m = parse(src).unwrap();
        let hir = check_ok(&m).unwrap();
        let f = hir
            .functions
            .iter()
            .find(|f| f.name == "player_on_update")
            .expect("player_on_update");
        assert!(f.export, "entry export fn should be a WASM export");
        assert_eq!(f.name, "player_on_update");
    }

    #[test]
    fn non_entry_export_fn_is_not_wasm_export() {
        use crate::program::{check_program_ok, ProgramModule};

        let math = parse(
            r#"export fn player_on_update(entity_id: i32, dt: f32) -> i32:
    return entity_id
"#,
        )
        .unwrap();
        let main = parse(
            r#"import math

fn main() -> i32:
    return math.player_on_update(1, 0.0)
"#,
        )
        .unwrap();

        let modules = vec![
            ProgramModule {
                name: "math".into(),
                file: Some("src/math.juni".into()),
                module: math,
            },
            ProgramModule {
                name: "main".into(),
                file: Some("src/main.juni".into()),
                module: main,
            },
        ];

        let program = check_program_ok(&modules, "main").unwrap();
        let math_mod = program.modules.iter().find(|m| m.name == "math").unwrap();
        let f = &math_mod.functions[0];
        assert!(!f.export, "library export fn must not be a raw WASM export");
        assert_eq!(f.name, "math::player_on_update");
    }

    #[test]
    fn check_multi_module_import() {
        use crate::program::{check_program_ok, ProgramModule};

        let math = parse(
            r#"export fn greet() -> i32:
    return 42
"#,
        )
        .unwrap();
        let main = parse(
            r#"import math

fn main() -> i32:
    return math.greet()
"#,
        )
        .unwrap();

        let modules = vec![
            ProgramModule {
                name: "math".into(),
                file: Some("src/math.juni".into()),
                module: math,
            },
            ProgramModule {
                name: "main".into(),
                file: Some("src/main.juni".into()),
                module: main,
            },
        ];

        let program = check_program_ok(&modules, "main").unwrap();
        assert_eq!(program.modules.len(), 2);
        let math_mod = program.modules.iter().find(|m| m.name == "math").unwrap();
        assert_eq!(math_mod.functions[0].name, "math::greet");
    }

    #[test]
    fn check_from_import_unqualified() {
        use crate::program::{check_program, ProgramModule};
        use crate::diag::Severity;

        let math = parse(
            r#"export fn clamp(x: f32, lo: f32, hi: f32) -> f32:
    if x < lo:
        return lo
    if x > hi:
        return hi
    return x
"#,
        )
        .unwrap();
        let main = parse(
            r#"from math import clamp

fn main() -> i32:
    let x = clamp(1.5, 0.0, 1.0)
    return as_i32(x)
"#,
        )
        .unwrap();

        let modules = vec![
            ProgramModule {
                name: "math".into(),
                file: None,
                module: math,
            },
            ProgramModule {
                name: "main".into(),
                file: None,
                module: main,
            },
        ];

        let result = check_program(&modules, "main");
        assert!(!result
            .diagnostics
            .iter()
            .any(|d| d.severity == Severity::Error));
    }

    #[test]
    fn check_scene3d_graph_and_materials() {
        let src = r#"state:
    cam: i32 = 0
    root: i32 = 0
    mesh: i32 = 0
    mat: i32 = 0

fn main() -> i32:
    scene3d_init(640, 360)
    cam = camera3d_perspective(60.0, 1.777, 0.1, 100.0)
    root = scene3d_create_node()
    mesh = mesh3d_box(1.0, 1.0, 1.0)
    mat = material3d_color(0.35, 0.75, 1.0, 1.0)
    mesh3d_set_material(mesh, mat)
    scene3d_set_parent(mesh, root)
    mesh3d_set_pose(root, 0.0, 0.0, -4.0, 0.0, 0.0, 0.0)
    return 0

fn frame(dt: f32) -> i32:
    scene3d_clear(0.05, 0.06, 0.1, 1.0)
    camera3d_look_at(cam, 4.0, 3.0, 4.0, 0.0, 0.0, 0.0)
    mesh3d_rotate(root, 0.0, dt * 0.7, 0.0)
    scene3d_draw(mesh, cam)
    return 0
"#;
        let m = parse(src).unwrap();
        check_ok(&m).unwrap();
    }

    #[test]
    fn check_mesh3d_custom_array_args() {
        let src = r#"fn main() -> i32:
    let mesh = mesh3d_custom([0.0, 1.0, 0.0, 1.0, 0.2, 0.3], 1, [0], 1)
    return mesh
"#;
        let m = parse(src).unwrap();
        check_ok(&m).unwrap();
    }

    #[test]
    fn check_generic_min() {
        let src = r#"fn gmin[T: Ord](a: T, b: T) -> T:
    if a < b:
        return a
    return b

fn main() -> i32:
    let x = gmin(3, 7)
    let y = gmin(2.5, 1.0)
    print(y)
    return as_i32(x)
"#;
        let m = parse(src).unwrap();
        let result = check(&m);
        assert!(
            !result
                .diagnostics
                .iter()
                .any(|d| d.severity == Severity::Error),
            "{:?}",
            result.diagnostics
        );
        assert_eq!(result.module.functions.len(), 3);
        assert!(
            result
                .module
                .functions
                .iter()
                .any(|f| f.name.contains("gmin")),
            "{:?}",
            result.module.functions.iter().map(|f| &f.name).collect::<Vec<_>>()
        );
    }

    #[test]
    fn check_aabb_intrinsics() {
        let src = r#"struct Aabb:
    x: f32
    y: f32
    w: f32
    h: f32

fn main() -> i32:
    let a = Aabb(x=0.0, y=0.0, w=10.0, h=10.0)
    let b = Aabb(x=5.0, y=5.0, w=10.0, h=10.0)
    if aabb_overlap(a, b):
        let v = aabb_resolve_x(a, b, 3.0)
        return as_i32(v)
    return 0
"#;
        let m = parse(src).unwrap();
        check_ok(&m).unwrap();
    }

    #[test]
    fn check_audio_intrinsics() {
        let src = r#"fn main() -> i32:
    let h = audio_load("sfx/hit.wav")
    audio_play(h)
    audio_play_loop(h)
    audio_set_volume(h, 0.5)
    audio_set_bus_volume(0.8)
    audio_stop(h)
    return h
"#;
        let m = parse(src).unwrap();
        check_ok(&m).unwrap();
    }

    #[test]
    fn check_anim_intrinsics() {
        let src = r#"fn main() -> i32:
    let id = entity_create()
    let ok = anim_play(id, "walk")
    anim_stop(id)
    return ok
"#;
        let m = parse(src).unwrap();
        check_ok(&m).unwrap();
    }

    #[test]
    fn check_asset_intrinsics() {
        let src = r#"state:
    tex: i32 = 0

fn main() -> i32:
    canvas_init(640, 360)
    tex = asset_load_str("sprites/juni.png")
    return 0

fn frame(dt: f32) -> i32:
    sprite_draw(tex, 100.0, 120.0, 64.0, 64.0)
    let mesh = mesh_load_obj("models/ship.obj")
    return mesh
"#;
        let m = parse(src).unwrap();
        check_ok(&m).unwrap();
    }

    #[test]
    fn check_delete_stmt() {
        let src = r#"struct Node:
    v: i32

fn main() -> i32:
    let p = new Node(v=1)
    delete p
    return 0
"#;
        let m = parse(src).unwrap();
        check_ok(&m).unwrap();
    }

    #[test]
    fn reject_const_array_index_oob() {
        let src = r#"fn main() -> i32:
    let xs = [1, 2, 3]
    return xs[3]
"#;
        let m = parse(src).unwrap();
        let r = check(&m);
        assert!(
            r.diagnostics.iter().any(|d| {
                d.severity == Severity::Error && d.message.contains("out of bounds")
            }),
            "{:?}",
            r.diagnostics
        );
    }

    #[test]
    fn did_you_mean_unknown_fn() {
        let src = r#"fn main() -> i32:
    let x = clmap(1.0, 0.0, 1.0)
    return 0
"#;
        let m = parse(src).unwrap();
        let r = check(&m);
        assert!(
            r.diagnostics.iter().any(|d| {
                d.severity == Severity::Error
                    && d.message.contains("unknown function")
                    && d.notes.iter().any(|n| n.contains("clamp"))
            }),
            "{:?}",
            r.diagnostics
        );
    }

    #[test]
    fn reject_write_through_imm_ref() {
        let src = r#"struct Node:
    v: i32

fn bump(p: ref Node) -> i32:
    p.v = 1
    return p.v

fn main() -> i32:
    let a = new Node(v=0)
    return bump(a)
"#;
        let m = parse(src).unwrap();
        let r = check(&m);
        assert!(
            r.diagnostics.iter().any(|d| {
                d.severity == Severity::Error && d.message.contains("immutable `ref T`")
            }),
            "{:?}",
            r.diagnostics
        );
    }

    #[test]
    fn reject_conflicting_mut_aliases_in_call() {
        let src = r#"struct Node:
    v: i32

fn both(a: mut ref Node, b: ref Node) -> i32:
    return a.v + b.v

fn main() -> i32:
    let p = new Node(v=1)
    return both(p, p)
"#;
        let m = parse(src).unwrap();
        let r = check(&m);
        assert!(
            r.diagnostics.iter().any(|d| {
                d.severity == Severity::Error
                    && d.message.contains("conflicting borrows")
                    && !d.message.contains("local#")
            }),
            "{:?}",
            r.diagnostics
        );
    }

    #[test]
    fn mut_ref_move_allows_exclusive_use() {
        let src = r#"struct Node:
    v: i32

fn bump(p: mut ref Node) -> i32:
    p.v = p.v + 1
    return p.v

fn main() -> i32:
    let a = new Node(v=1)
    let b = a
    return bump(b)
"#;
        let m = parse(src).unwrap();
        check_ok(&m).unwrap();
    }

    #[test]
    fn reject_use_of_moved_mut_ref() {
        let src = r#"struct Node:
    v: i32

fn main() -> i32:
    let a = new Node(v=1)
    let b = a
    return a.v
"#;
        let m = parse(src).unwrap();
        let r = check(&m);
        assert!(
            r.diagnostics.iter().any(|d| {
                d.severity == Severity::Error
                    && d.message.contains("moved")
                    && d.message.contains("`a`")
                    && !d.message.contains("local#")
            }),
            "{:?}",
            r.diagnostics
        );
    }

    #[test]
    fn reject_param_ref_store_to_static() {
        let src = r#"struct Node:
    v: i32

state:
    held: i32 = 0

fn stash(p: mut ref Node) -> i32:
    held = p
    return 0

fn main() -> i32:
    return 0
"#;
        let m = parse(src).unwrap();
        let r = check(&m);
        assert!(
            r.diagnostics.iter().any(|d| d.severity == Severity::Error),
            "expected error assigning mut ref to i32 static or escape: {:?}",
            r.diagnostics
        );
    }

    #[test]
    fn reject_param_ref_escape_into_ref_static() {
        let src = r#"struct Node:
    v: i32

state:
    held: mut ref Node = new Node(v=0)

fn stash(p: mut ref Node) -> i32:
    held = p
    return 0

fn main() -> i32:
    let a = new Node(v=1)
    return stash(a)
"#;
        let m = parse(src).unwrap();
        let r = check(&m);
        assert!(
            r.diagnostics.iter().any(|d| {
                d.severity == Severity::Error
                    && (d.message.contains("escape") || d.message.contains("store parameter"))
            }),
            "{:?}",
            r.diagnostics
        );
    }

    fn find_index_len(expr: &HirExpr) -> Option<u32> {
        match expr {
            HirExpr::Index { len, base, index, .. } => find_index_len(base)
                .or_else(|| find_index_len(index))
                .or(Some(*len)),
            HirExpr::Unary { expr, .. } | HirExpr::AsI32(expr) | HirExpr::AsF32(expr) => {
                find_index_len(expr)
            }
            HirExpr::Binary { left, right, .. } => {
                find_index_len(left).or_else(|| find_index_len(right))
            }
            HirExpr::Call { args, .. } => args.iter().find_map(find_index_len),
            _ => None,
        }
    }

    fn find_index_len_stmt(stmt: &HirStmt) -> Option<u32> {
        match stmt {
            HirStmt::Return(Some(e)) | HirStmt::Expr(e) | HirStmt::Let { init: e, .. } => {
                find_index_len(e)
            }
            HirStmt::AssignIndex { len, .. } => Some(*len),
            HirStmt::Block(b) | HirStmt::While { body: b, .. } => {
                b.stmts.iter().find_map(find_index_len_stmt)
            }
            HirStmt::If {
                then_block,
                else_block,
                ..
            } => then_block
                .stmts
                .iter()
                .find_map(find_index_len_stmt)
                .or_else(|| {
                    else_block
                        .as_ref()
                        .and_then(|b| b.stmts.iter().find_map(find_index_len_stmt))
                }),
            _ => None,
        }
    }

    #[test]
    fn index_hir_carries_array_len() {
        let src = r#"fn main() -> i32:
    let xs = [10, 20, 30]
    let i = 1
    return xs[i]
"#;
        let m = parse(src).unwrap();
        let hir = check_ok(&m).unwrap();
        let main = hir.functions.iter().find(|f| f.name == "main").unwrap();
        let len = main
            .body
            .stmts
            .iter()
            .find_map(find_index_len_stmt)
            .expect("expected Index in main");
        assert_eq!(len, 3);
    }

    #[test]
    fn assign_index_hir_carries_array_len() {
        let src = r#"fn main() -> i32:
    let xs = [10, 20, 30]
    let i = 2
    xs[i] = 99
    return xs[0]
"#;
        let m = parse(src).unwrap();
        let hir = check_ok(&m).unwrap();
        let main = hir.functions.iter().find(|f| f.name == "main").unwrap();
        let len = main
            .body
            .stmts
            .iter()
            .find_map(find_index_len_stmt)
            .expect("expected AssignIndex in main");
        assert_eq!(len, 3);
    }
}
