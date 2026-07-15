//! Juni project workspace for IDE / LSP features.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use juni_driver::{load_project, load_project_from_files, DriverError, Project};
use juni_syntax::parse;
use thiserror::Error;

use crate::symbols::{
    identifier_at, imports_from_module, index_module, builtins, keywords, types, word_range_at,
    ImportMap, ModuleSymbols, Symbol, SymbolKind,
};

#[derive(Debug, Error)]
pub enum WorkspaceError {
    #[error(transparent)]
    Driver(#[from] DriverError),
    #[error("file not in workspace: {0}")]
    UnknownFile(String),
    #[error("parse error in {file}: {message}")]
    Parse { file: String, message: String },
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CompletionItem {
    pub label: String,
    pub kind: String,
    pub detail: Option<String>,
    pub insert_text: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Location {
    pub file: String,
    pub line: u32,
    pub col: u32,
    pub end_line: u32,
    pub end_col: u32,
}

#[derive(Debug, Clone)]
pub struct Workspace {
    pub root: PathBuf,
    pub entry: String,
    modules: HashMap<String, ModuleSymbols>,
    file_to_module: HashMap<String, String>,
    import_maps: HashMap<String, ImportMap>,
}

impl Workspace {
    pub fn from_project_root(root: &Path) -> Result<Self, WorkspaceError> {
        let project = load_project(root)?;
        Self::from_project(project)
    }

    pub fn from_project(project: Project) -> Result<Self, WorkspaceError> {
        let mut modules = HashMap::new();
        let mut file_to_module = HashMap::new();
        let mut import_maps = HashMap::new();

        for m in &project.modules {
            let file = m.path.display().to_string();
            let ast = match &m.ast {
                Some(ast) => ast.clone(),
                None => {
                    if let Some(err) = &m.parse_error {
                        return Err(WorkspaceError::Parse {
                            file: file.clone(),
                            message: err.to_string(),
                        });
                    }
                    continue;
                }
            };
            import_maps.insert(m.name.clone(), imports_from_module(&ast));
            let syms = index_module(
                m.name.clone(),
                file.clone(),
                m.source.clone(),
                &ast,
            );
            file_to_module.insert(file, m.name.clone());
            modules.insert(m.name.clone(), syms);
        }

        Ok(Self {
            root: project.root,
            entry: project.entry,
            modules,
            file_to_module,
            import_maps,
        })
    }

    pub fn from_files(root: PathBuf, files: HashMap<String, String>) -> Result<Self, WorkspaceError> {
        let project = load_project_from_files(root, files)?;
        Self::from_project(project)
    }

    pub fn from_single_file(path: &str, source: &str) -> Result<Self, WorkspaceError> {
        let module = parse(source).map_err(|e| WorkspaceError::Parse {
            file: path.to_string(),
            message: e.to_string(),
        })?;
        let syms = index_module(String::new(), path.to_string(), source.to_string(), &module);
        let mut modules = HashMap::new();
        modules.insert(String::new(), syms);
        let mut file_to_module = HashMap::new();
        file_to_module.insert(path.to_string(), String::new());
        let mut import_maps = HashMap::new();
        import_maps.insert(String::new(), imports_from_module(&module));
        Ok(Self {
            root: PathBuf::from("."),
            entry: String::new(),
            modules,
            file_to_module,
            import_maps,
        })
    }

    pub fn module_for_file(&self, file: &str) -> Option<&ModuleSymbols> {
        let name = self.file_to_module.get(file)?;
        self.modules.get(name)
    }

    pub fn complete(&self, file: &str, line: u32, col: u32) -> Vec<CompletionItem> {
        let Some(mod_syms) = self.module_for_file(file) else {
            return Vec::new();
        };

        let prefix = prefix_at(&mod_syms.source, line, col);
        let context = completion_context(&mod_syms.source, line, col);

        let mut items = Vec::new();
        let mut seen = HashMap::new();

        let add = |items: &mut Vec<CompletionItem>, seen: &mut HashMap<String, ()>, item: CompletionItem| {
            if seen.contains_key(&item.label) {
                return;
            }
            seen.insert(item.label.clone(), ());
            items.push(item);
        };

        match context.as_deref() {
            Some("import") => {
                for name in self.modules.keys() {
                    if name.is_empty() {
                        continue;
                    }
                    if prefix_matches(name, &prefix) {
                        add(
                            &mut items,
                            &mut seen,
                            CompletionItem {
                                label: name.clone(),
                                kind: "module".into(),
                                detail: Some("module".into()),
                                insert_text: None,
                            },
                        );
                    }
                }
                return items;
            }
            Some(ctx) if ctx.starts_with("from:") => {
                let module = ctx.strip_prefix("from:").unwrap_or("");
                if let Some(target) = self.modules.get(module) {
                    for (name, sym) in &target.exports {
                        if prefix_matches(name, &prefix) {
                            add(
                                &mut items,
                                &mut seen,
                                sym_to_completion(name, sym),
                            );
                        }
                    }
                }
                return items;
            }
            Some(ctx) if ctx.starts_with("module:") => {
                let module = ctx.strip_prefix("module:").unwrap_or("");
                if let Some(target) = self.modules.get(module) {
                    for (name, sym) in &target.exports {
                        if prefix_matches(name, &prefix) {
                            add(
                                &mut items,
                                &mut seen,
                                sym_to_completion(name, sym),
                            );
                        }
                    }
                }
                return items;
            }
            _ => {}
        }

        for kw in keywords() {
            if prefix_matches(kw, &prefix) {
                add(
                    &mut items,
                    &mut seen,
                    CompletionItem {
                        label: (*kw).into(),
                        kind: "keyword".into(),
                        detail: None,
                        insert_text: None,
                    },
                );
            }
        }

        for ty in types() {
            if prefix_matches(ty, &prefix) {
                add(
                    &mut items,
                    &mut seen,
                    CompletionItem {
                        label: (*ty).into(),
                        kind: "type".into(),
                        detail: None,
                        insert_text: None,
                    },
                );
            }
        }

        for builtin in builtins() {
            if prefix_matches(builtin, &prefix) {
                add(
                    &mut items,
                    &mut seen,
                    CompletionItem {
                        label: (*builtin).into(),
                        kind: "function".into(),
                        detail: Some("builtin".into()),
                        insert_text: None,
                    },
                );
            }
        }

        for (name, sym) in &mod_syms.locals {
            if prefix_matches(name, &prefix) {
                add(&mut items, &mut seen, sym_to_completion(name, sym));
            }
        }

        let module_name = self.file_to_module.get(file).cloned().unwrap_or_default();
        if let Some(imports) = self.import_maps.get(&module_name) {
            for (alias, target) in &imports.module_aliases {
                if prefix_matches(alias, &prefix) {
                    add(
                        &mut items,
                        &mut seen,
                        CompletionItem {
                            label: alias.clone(),
                            kind: "module".into(),
                            detail: Some(format!("import {target}")),
                            insert_text: None,
                        },
                    );
                }
            }
            for (local, (target, sym_name)) in &imports.from_imports {
                if prefix_matches(local, &prefix) {
                    if let Some(target_mod) = self.modules.get(target) {
                        if let Some(sym) = target_mod.exports.get(sym_name) {
                            add(&mut items, &mut seen, sym_to_completion(local, sym));
                        }
                    }
                }
            }
        }

        items
    }

    pub fn goto_definition(&self, file: &str, line: u32, col: u32) -> Option<Location> {
        let mod_syms = self.module_for_file(file)?;
        let (ident, _) = identifier_at(&mod_syms.source, line, col)?;
        let module_name = self.file_to_module.get(file).cloned().unwrap_or_default();

        if let Some((module, name)) = ident.split_once('.') {
            let resolved_module = self
                .import_maps
                .get(&module_name)
                .and_then(|m| m.module_aliases.get(module).cloned())
                .unwrap_or_else(|| module.to_string());
            if let Some(target) = self.modules.get(&resolved_module) {
                if let Some(sym) = target.exports.get(name).or_else(|| target.locals.get(name)) {
                    return Some(location_from_symbol(&target.file, sym));
                }
            }
            return None;
        }

        if let Some(sym) = mod_syms.locals.get(&ident) {
            return Some(location_from_symbol(file, sym));
        }

        if let Some(imports) = self.import_maps.get(&module_name) {
            if let Some((target, sym_name)) = imports.from_imports.get(&ident) {
                if let Some(target_mod) = self.modules.get(target) {
                    if let Some(sym) = target_mod.exports.get(sym_name) {
                        return Some(location_from_symbol(&target_mod.file, sym));
                    }
                }
            }
        }

        None
    }

    pub fn update_file(&mut self, file: &str, source: &str) -> Result<(), WorkspaceError> {
        let module = parse(source).map_err(|e| WorkspaceError::Parse {
            file: file.to_string(),
            message: e.to_string(),
        })?;
        let module_name = self
            .file_to_module
            .get(file)
            .cloned()
            .unwrap_or_else(|| {
                let stem = Path::new(file)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("main")
                    .to_string();
                self.file_to_module.insert(file.to_string(), stem.clone());
                stem
            });
        self.import_maps
            .insert(module_name.clone(), imports_from_module(&module));
        let syms = index_module(module_name.clone(), file.to_string(), source.to_string(), &module);
        self.modules.insert(module_name, syms);
        Ok(())
    }
}

fn sym_to_completion(label: &str, sym: &Symbol) -> CompletionItem {
    CompletionItem {
        label: label.to_string(),
        kind: match sym.kind {
            SymbolKind::Function => "function",
            SymbolKind::Struct => "struct",
            SymbolKind::Global | SymbolKind::Local => "variable",
            SymbolKind::Param => "parameter",
            SymbolKind::Module => "module",
            SymbolKind::Keyword => "keyword",
            SymbolKind::Builtin => "function",
        }
        .into(),
        detail: sym.detail.clone(),
        insert_text: None,
    }
}

fn location_from_symbol(file: &str, sym: &Symbol) -> Location {
    Location {
        file: file.to_string(),
        line: sym.span.line,
        col: sym.span.col,
        end_line: sym.span.line,
        end_col: sym.span.col + sym.name.len() as u32,
    }
}

fn prefix_at(source: &str, line: u32, col: u32) -> String {
    if let Some((start, end)) = word_range_at(source, line, col) {
        return source[start..end].to_string();
    }
    String::new()
}

fn prefix_matches(label: &str, prefix: &str) -> bool {
    prefix.is_empty() || label.starts_with(prefix)
}

fn completion_context(source: &str, line: u32, col: u32) -> Option<String> {
    let line_text = line_text_at(source, line)?;
    let col_idx = (col as usize).saturating_sub(1).min(line_text.len());
    let before = &line_text[..col_idx];

    if before.ends_with("import ") || before.ends_with("import") {
        return Some("import".into());
    }

    if let Some(rest) = before.strip_prefix("from ") {
        if let Some((module, after)) = rest.split_once(" import ") {
            let module = module.trim();
            if !module.is_empty() && (after.is_empty() || !after.contains(':')) {
                return Some(format!("from:{module}"));
            }
        }
    }

    if let Some(dot) = before.rfind('.') {
        let module = before[..dot]
            .rsplit_once(|c: char| !c.is_alphanumeric() && c != '_')
            .map(|(_, m)| m)
            .unwrap_or(&before[..dot]);
        if !module.is_empty() {
            return Some(format!("module:{module}"));
        }
    }

    None
}

fn line_text_at(source: &str, line: u32) -> Option<String> {
    let mut current = 1u32;
    for part in source.split('\n') {
        if current == line {
            return Some(part.to_string());
        }
        current += 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn hello_modules_files() -> HashMap<String, String> {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../juni-driver/tests/projects/hello_modules");
        HashMap::from([
            (
                "juni.toml".into(),
                std::fs::read_to_string(root.join("juni.toml")).unwrap(),
            ),
            (
                "src/main.juni".into(),
                std::fs::read_to_string(root.join("src/main.juni")).unwrap(),
            ),
            (
                "src/math.juni".into(),
                std::fs::read_to_string(root.join("src/math.juni")).unwrap(),
            ),
        ])
    }

    #[test]
    fn completes_imported_module_exports() {
        let ws = Workspace::from_files(PathBuf::from("."), hello_modules_files()).unwrap();
        let items = ws.complete("src/main.juni", 1, 8);
        assert!(items.iter().any(|i| i.label == "math"));
    }

    #[test]
    fn goto_def_cross_module() {
        let ws = Workspace::from_files(PathBuf::from("."), hello_modules_files()).unwrap();
        let loc = ws.goto_definition("src/main.juni", 4, 17).unwrap();
        assert_eq!(loc.file, "src/math.juni");
        assert_eq!(loc.line, 1);
    }
}
