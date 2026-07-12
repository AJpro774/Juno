//! Multi-module program checking and linking.

use std::collections::HashMap;

use juni_syntax::{
    ast::{ExportItem, ImportKind, Item},
    Module,
};

use crate::diag::{Diagnostic, Severity};
use crate::hir::{HirProgram, ModuleId};
use crate::Checker;

/// One parsed source module participating in a program check.
#[derive(Debug, Clone)]
pub struct ProgramModule {
    pub name: String,
    pub file: Option<String>,
    pub module: Module,
}

#[derive(Debug)]
pub struct ProgramCheckResult {
    pub program: HirProgram,
    pub diagnostics: Vec<Diagnostic>,
}

/// Type-checked multi-module program in dependency (topological) order.
pub fn check_program(modules: &[ProgramModule], entry: &str) -> ProgramCheckResult {
    let entry_idx = modules
        .iter()
        .position(|m| m.name == entry)
        .unwrap_or(0);
    let entry_id = ModuleId(entry_idx);

    let mut diagnostics = Vec::new();
    let mut hir_modules = Vec::new();
    let mut export_tables: HashMap<String, crate::ExportTable> = HashMap::new();
    let mut next_func_id = 0u32;
    let mut next_static_id = 0u32;
    let mut static_region_offset = 0u32;

    for (idx, pm) in modules.iter().enumerate() {
        let mut checker = Checker::for_program_module(
            pm.name.clone(),
            pm.file.clone(),
            ModuleId(idx),
            idx == entry_idx,
            &export_tables,
            next_func_id,
            next_static_id,
            static_region_offset,
        );
        checker.process_imports(&pm.module);
        checker.check_module(&pm.module);

        next_func_id += checker.functions.len() as u32;
        next_static_id += checker.hir.statics.len() as u32;
        static_region_offset += checker.hir.static_region_size;

        export_tables.insert(pm.name.clone(), checker.export_table());
        diagnostics.extend(std::mem::take(&mut checker.diagnostics));
        hir_modules.push(checker.into_hir_module());
    }

    ProgramCheckResult {
        program: HirProgram {
            modules: hir_modules,
            entry_module_id: entry_id,
        },
        diagnostics,
    }
}

pub fn check_program_ok(
    modules: &[ProgramModule],
    entry: &str,
) -> Result<HirProgram, Vec<Diagnostic>> {
    let result = check_program(modules, entry);
    if result
        .diagnostics
        .iter()
        .any(|d| d.severity == Severity::Error)
    {
        Err(result.diagnostics)
    } else {
        Ok(result.program)
    }
}

/// Flatten top-level items, unwrapping `export` wrappers.
pub fn flatten_items(module: &Module) -> Vec<FlatItem<'_>> {
    let mut out = Vec::new();
    for item in &module.items {
        match item {
            Item::Export(decl) => match &decl.item {
                ExportItem::Struct(s) => out.push(FlatItem::Struct(s, true)),
                ExportItem::Fn(f) => out.push(FlatItem::Fn(f, true)),
                ExportItem::Global(g) => out.push(FlatItem::Global(g, true)),
                ExportItem::State(s) => out.push(FlatItem::State(s, true)),
            },
            Item::Struct(s) => out.push(FlatItem::Struct(s, false)),
            Item::Fn(f) => out.push(FlatItem::Fn(f, false)),
            Item::Global(g) => out.push(FlatItem::Global(g, false)),
            Item::State(s) => out.push(FlatItem::State(s, false)),
            Item::Import(_) => {}
        }
    }
    out
}

pub enum FlatItem<'a> {
    Struct(&'a juni_syntax::StructDef, bool),
    Fn(&'a juni_syntax::FnDef, bool),
    Global(&'a juni_syntax::GlobalDef, bool),
    State(&'a juni_syntax::StateDef, bool),
}

pub(crate) fn imports_from_module(module: &Module) -> ImportBindings {
    let mut bindings = ImportBindings::default();
    for item in &module.items {
        let Item::Import(decl) = item else {
            continue;
        };
        match &decl.kind {
            ImportKind::Module { name, alias } => {
                let local = alias.clone().unwrap_or_else(|| name.clone());
                bindings.module_aliases.insert(local, name.clone());
            }
            ImportKind::From { module, names } => {
                for import_name in names {
                    let local = import_name
                        .alias
                        .clone()
                        .unwrap_or_else(|| import_name.name.clone());
                    bindings.from_imports.insert(
                        local,
                        (module.clone(), import_name.name.clone()),
                    );
                }
            }
        }
    }
    bindings
}

#[derive(Debug, Default)]
pub(crate) struct ImportBindings {
    /// Local alias -> logical module name (`import math as m`).
    pub module_aliases: HashMap<String, String>,
    /// Local name -> (module, exported symbol).
    pub from_imports: HashMap<String, (String, String)>,
}
