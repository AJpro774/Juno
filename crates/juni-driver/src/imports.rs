//! Extract `import` / `from` dependencies from source.
//!
//! Uses the parsed AST when import nodes are available; otherwise scans top-level
//! lines for Python-style import syntax.

use std::collections::HashSet;

use juni_syntax::ast::Module;

/// Return logical module names referenced by import declarations.
pub fn extract_imports(source: &str, parsed: Option<&Module>) -> Vec<String> {
    #[cfg(feature = "import-ast")]
    if let Some(module) = parsed {
        let from_ast = imports_from_ast(module);
        if !from_ast.is_empty() {
            return from_ast;
        }
    }
    let _ = parsed;
    imports_from_source(source)
}

#[cfg(feature = "import-ast")]
fn imports_from_ast(module: &Module) -> Vec<String> {
    use juni_syntax::ast::{ImportKind, Item};
    let mut deps = Vec::new();
    for item in &module.items {
        if let Item::Import(decl) = item {
            match &decl.kind {
                ImportKind::Module { name, .. } => deps.push(name.clone()),
                ImportKind::From { module, .. } => deps.push(module.clone()),
            }
        }
    }
    deps.sort();
    deps.dedup();
    deps
}

fn imports_from_source(source: &str) -> Vec<String> {
    let mut deps = HashSet::new();
    for line in source.lines() {
        let trimmed = line.trim();
        if let Some(name) = parse_import_line(trimmed) {
            deps.insert(name);
        } else if let Some(name) = parse_from_line(trimmed) {
            deps.insert(name);
        }
    }
    let mut out: Vec<_> = deps.into_iter().collect();
    out.sort();
    out
}

fn parse_import_line(line: &str) -> Option<String> {
    // `import math` or `import math as m`
    let rest = line.strip_prefix("import ")?.trim();
    let name = rest.split_whitespace().next()?.trim_end_matches(',');
    if name.is_empty() || !is_ident(name) {
        return None;
    }
    Some(name.to_string())
}

fn parse_from_line(line: &str) -> Option<String> {
    // `from math import clamp, Vec2`
    let rest = line.strip_prefix("from ")?.trim();
    let module = rest.split_whitespace().next()?;
    if !rest[module.len()..].trim_start().starts_with("import ") {
        return None;
    }
    if module.is_empty() || !is_ident(module) {
        return None;
    }
    Some(module.to_string())
}

fn is_ident(s: &str) -> bool {
    let mut chars = s.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !first.is_ascii_alphabetic() && first != '_' {
        return false;
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scans_import_and_from() {
        let src = r#"
import math
from utils import clamp

fn main() -> i32:
    return 0
"#;
        assert_eq!(extract_imports(src, None), vec!["math", "utils"]);
    }

    #[test]
    #[cfg(feature = "import-ast")]
    fn extracts_imports_from_ast() {
        use juni_syntax::parse;
        let src = "import math\nfrom utils import clamp\nfn main() -> i32:\n    return 0\n";
        let module = parse(src).unwrap();
        assert_eq!(extract_imports(src, Some(&module)), vec!["math", "utils"]);
    }
}
