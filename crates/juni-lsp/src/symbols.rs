//! Symbol indexing for completion and go-to-definition.

use std::collections::HashMap;

use juni_syntax::{
    ast::{ExportItem, ImportKind, Item},
    parse, Module, Span,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Symbol {
    pub name: String,
    pub kind: SymbolKind,
    pub span: Span,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SymbolKind {
    Function,
    Struct,
    Global,
    Param,
    Local,
    Module,
    Keyword,
    Builtin,
}

#[derive(Debug, Clone)]
pub struct ModuleSymbols {
    pub name: String,
    pub file: String,
    pub source: String,
    pub exports: HashMap<String, Symbol>,
    pub locals: HashMap<String, Symbol>,
}

#[derive(Debug, Clone)]
pub struct ImportMap {
    /// Local alias -> target module name (`import math as m`).
    pub module_aliases: HashMap<String, String>,
    /// Local name -> (module, exported symbol).
    pub from_imports: HashMap<String, (String, String)>,
}

pub fn imports_from_module(module: &Module) -> ImportMap {
    let mut map = ImportMap {
        module_aliases: HashMap::new(),
        from_imports: HashMap::new(),
    };
    for item in &module.items {
        let Item::Import(decl) = item else {
            continue;
        };
        match &decl.kind {
            ImportKind::Module { name, alias } => {
                let local = alias.clone().unwrap_or_else(|| name.clone());
                map.module_aliases.insert(local, name.clone());
            }
            ImportKind::From { module, names } => {
                for import_name in names {
                    let local = import_name
                        .alias
                        .clone()
                        .unwrap_or_else(|| import_name.name.clone());
                    map.from_imports
                        .insert(local, (module.clone(), import_name.name.clone()));
                }
            }
        }
    }
    map
}

pub fn index_module(name: String, file: String, source: String, module: &Module) -> ModuleSymbols {
    let mut exports = HashMap::new();
    let mut locals = HashMap::new();

    for item in &module.items {
        match item {
            Item::Struct(s) => {
                locals.insert(
                    s.name.clone(),
                    Symbol {
                        name: s.name.clone(),
                        kind: SymbolKind::Struct,
                        span: s.span,
                        detail: Some("struct".into()),
                    },
                );
            }
            Item::Fn(f) => {
                for p in &f.params {
                    locals.insert(
                        p.name.clone(),
                        Symbol {
                            name: p.name.clone(),
                            kind: SymbolKind::Param,
                            span: p.span,
                            detail: Some("param".into()),
                        },
                    );
                }
                locals.insert(
                    f.name.clone(),
                    Symbol {
                        name: f.name.clone(),
                        kind: SymbolKind::Function,
                        span: f.span,
                        detail: Some("fn".into()),
                    },
                );
            }
            Item::Global(g) => {
                locals.insert(
                    g.name.clone(),
                    Symbol {
                        name: g.name.clone(),
                        kind: SymbolKind::Global,
                        span: g.span,
                        detail: Some("let".into()),
                    },
                );
            }
            Item::State(s) => {
                for field in &s.fields {
                    locals.insert(
                        field.name.clone(),
                        Symbol {
                            name: field.name.clone(),
                            kind: SymbolKind::Global,
                            span: field.span,
                            detail: Some("state".into()),
                        },
                    );
                }
            }
            Item::Export(decl) => match &decl.item {
                ExportItem::Struct(s) => {
                    let sym = Symbol {
                        name: s.name.clone(),
                        kind: SymbolKind::Struct,
                        span: s.span,
                        detail: Some("export struct".into()),
                    };
                    exports.insert(s.name.clone(), sym.clone());
                    locals.insert(s.name.clone(), sym);
                }
                ExportItem::Fn(f) => {
                    let sym = Symbol {
                        name: f.name.clone(),
                        kind: SymbolKind::Function,
                        span: f.span,
                        detail: Some("export fn".into()),
                    };
                    exports.insert(f.name.clone(), sym.clone());
                    locals.insert(f.name.clone(), sym);
                }
                ExportItem::Global(g) => {
                    let sym = Symbol {
                        name: g.name.clone(),
                        kind: SymbolKind::Global,
                        span: g.span,
                        detail: Some("export let".into()),
                    };
                    exports.insert(g.name.clone(), sym.clone());
                    locals.insert(g.name.clone(), sym);
                }
                ExportItem::State(s) => {
                    for field in &s.fields {
                        let sym = Symbol {
                            name: field.name.clone(),
                            kind: SymbolKind::Global,
                            span: field.span,
                            detail: Some("export state".into()),
                        };
                        exports.insert(field.name.clone(), sym.clone());
                        locals.insert(field.name.clone(), sym);
                    }
                }
            },
            Item::Import(_) => {}
        }
    }

    collect_block_locals(&module, &mut locals);

    ModuleSymbols {
        name,
        file,
        source,
        exports,
        locals,
    }
}

fn collect_block_locals(module: &Module, locals: &mut HashMap<String, Symbol>) {
    for item in &module.items {
        if let Item::Fn(f) = item {
            collect_block_bindings(&f.body, locals);
        }
        if let Item::Export(decl) = item {
            if let ExportItem::Fn(f) = &decl.item {
                collect_block_bindings(&f.body, locals);
            }
        }
    }
}

fn collect_block_bindings(block: &juni_syntax::Block, locals: &mut HashMap<String, Symbol>) {
    for stmt in &block.stmts {
        if let juni_syntax::Stmt::Let { name, span, .. } = stmt {
            locals.insert(
                name.clone(),
                Symbol {
                    name: name.clone(),
                    kind: SymbolKind::Local,
                    span: *span,
                    detail: Some("let".into()),
                },
            );
        }
        if let juni_syntax::Stmt::For { var, body, span, .. } = stmt {
            locals.insert(
                var.clone(),
                Symbol {
                    name: var.clone(),
                    kind: SymbolKind::Local,
                    span: *span,
                    detail: Some("for".into()),
                },
            );
            collect_block_bindings(body, locals);
        }
        if let juni_syntax::Stmt::If {
            then_block,
            else_block,
            ..
        } = stmt
        {
            collect_block_bindings(then_block, locals);
            if let Some(eb) = else_block {
                collect_block_bindings(eb, locals);
            }
        }
        if let juni_syntax::Stmt::While { body, .. } = stmt {
            collect_block_bindings(body, locals);
        }
    }
}

pub fn index_single_file(file: &str, source: &str) -> Option<ModuleSymbols> {
    let module = parse(source).ok()?;
    Some(index_module(String::new(), file.to_string(), source.to_string(), &module))
}

pub fn builtins() -> &'static [&'static str] {
    &[
        "print", "sqrt", "sin", "cos", "tan", "abs", "floor", "ceil", "min", "max", "rand", "now",
        "clamp", "lerp", "pow", "sign", "fmod", "smoothstep", "deg_to_rad", "rad_to_deg", "dist2",
        "pi", "str_len", "str_eq", "str_concat", "str_substr", "len2", "dot2", "abs_i32", "imin",
        "imax", "iclamp", "as_i32", "as_f32", "key_down", "mouse_x", "mouse_y", "mouse_down",
        "canvas_init", "canvas_clear", "canvas_fill_rect", "canvas_fill_circle", "canvas_fill_text",
        "canvas_draw_line", "canvas_stroke_rect", "gpu_clear", "gpu_draw_triangle", "scene3d_init",
        "scene3d_clear", "scene3d_draw", "camera3d_perspective", "mesh3d_box", "mesh3d_set_pose",
        "mesh3d_rotate",
    ]
}

pub fn keywords() -> &'static [&'static str] {
    &[
        "fn", "struct", "let", "state", "if", "else", "while", "for", "in", "break", "continue",
        "return", "new", "delete", "ref", "mut", "true", "false", "and", "or", "not", "import",
        "from", "export", "as",
    ]
}

pub fn types() -> &'static [&'static str] {
    &["i32", "i64", "f32", "f64", "bool", "void", "str"]
}

/// Return the identifier or qualified name at a 1-based line/col position.
pub fn identifier_at(source: &str, line: u32, col: u32) -> Option<(String, Span)> {
    let (start, end) = word_range_at(source, line, col)?;
    let word = &source[start..end];
    if word.is_empty() {
        return None;
    }

    // Extend left for `module.` prefix
    if start > 0 && source.as_bytes()[start - 1] == b'.' {
        if let Some((pstart, pend)) = word_range_before(source, start - 1) {
            let prefix = &source[pstart..pend];
            if !prefix.is_empty() {
                let combined = format!("{prefix}.{word}");
                let span = span_for_range(source, pstart, end);
                return Some((combined, span));
            }
        }
    }

    let span = span_for_range(source, start, end);
    Some((word.to_string(), span))
}

fn span_for_range(source: &str, start: usize, end: usize) -> Span {
    let (line, col) = offset_to_line_col(source, start);
    Span::new(start, end, line, col)
}

pub fn offset_to_line_col(source: &str, offset: usize) -> (u32, u32) {
    let offset = offset.min(source.len());
    let mut line = 1u32;
    let mut col = 1u32;
    for (i, ch) in source.char_indices() {
        if i >= offset {
            break;
        }
        if ch == '\n' {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
    }
    (line, col)
}

pub fn word_range_at(source: &str, line: u32, col: u32) -> Option<(usize, usize)> {
    let target_line = line.max(1);
    let target_col = col.max(1);
    let mut current_line = 1u32;
    let mut line_start = 0usize;

    for (i, ch) in source.char_indices() {
        if ch == '\n' {
            if current_line == target_line {
                return word_in_line(&source[line_start..i], target_col)
                    .map(|(s, e)| (line_start + s, line_start + e));
            }
            current_line += 1;
            line_start = i + ch.len_utf8();
        }
    }

    if current_line == target_line {
        word_in_line(&source[line_start..], target_col).map(|(s, e)| (line_start + s, line_start + e))
    } else {
        None
    }
}

fn word_range_before(source: &str, offset: usize) -> Option<(usize, usize)> {
    if offset == 0 {
        return None;
    }
    let bytes = source.as_bytes();
    let mut end = offset;
    while end > 0 && !is_ident_char(bytes[end - 1]) {
        end -= 1;
    }
    if end == 0 {
        return None;
    }
    let mut start = end;
    while start > 0 && is_ident_char(bytes[start - 1]) {
        start -= 1;
    }
    Some((start, end))
}

fn word_in_line(line: &str, col: u32) -> Option<(usize, usize)> {
    let col_idx = (col as usize).saturating_sub(1);
    let bytes = line.as_bytes();
    if col_idx >= bytes.len() {
        // cursor may be just past last char on line
        let mut pos = bytes.len();
        while pos > 0 && !is_ident_char(bytes[pos - 1]) {
            pos -= 1;
        }
        if pos == bytes.len() {
            return None;
        }
        let mut start = pos;
        while start > 0 && is_ident_char(bytes[start - 1]) {
            start -= 1;
        }
        return Some((start, pos));
    }

    let mut idx = col_idx;
    if idx < bytes.len() && !is_ident_char(bytes[idx]) && idx > 0 && is_ident_char(bytes[idx - 1]) {
        idx -= 1;
    }
    if idx >= bytes.len() || !is_ident_char(bytes[idx]) {
        return None;
    }
    let mut start = idx;
    while start > 0 && is_ident_char(bytes[start - 1]) {
        start -= 1;
    }
    let mut end = idx + 1;
    while end < bytes.len() && is_ident_char(bytes[end]) {
        end += 1;
    }
    Some((start, end))
}

fn is_ident_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn indexes_exports() {
        let src = r#"export fn greet() -> i32:
    return 0
"#;
        let m = parse(src).unwrap();
        let syms = index_module("math".into(), "src/math.juni".into(), src.into(), &m);
        assert!(syms.exports.contains_key("greet"));
    }

    #[test]
    fn finds_identifier_at_cursor() {
        let src = "fn main() -> i32:\n    return math.greet()\n";
        let (name, _) = identifier_at(src, 2, 18).unwrap();
        assert_eq!(name, "math.greet");
    }
}
