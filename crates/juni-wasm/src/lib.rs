//! Browser-facing Juni compiler API.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use juni_check::diag::{Diagnostic, DiagnosticJson, Severity};
use juni_check::{check, check_ok, check_program, ProgramModule};
use juni_codegen::{emit_wasm, emit_wasm_program};
use juni_driver::{load_project, load_project_from_files, Project};
use juni_lsp::Workspace;
use juni_syntax::parse;
use serde::Deserialize;
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Serialize, Deserialize)]
struct CompileResult {
    ok: bool,
    diagnostics: Vec<DiagOut>,
    wasm: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiagOut {
    severity: String,
    line: u32,
    col: u32,
    end_line: u32,
    end_col: u32,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    file: Option<String>,
}

impl From<DiagnosticJson> for DiagOut {
    fn from(d: DiagnosticJson) -> Self {
        Self {
            severity: d.severity,
            line: d.line,
            col: d.col,
            end_line: d.end_line,
            end_col: d.end_col,
            message: d.message,
            file: None,
        }
    }
}

#[derive(Debug, Deserialize)]
struct CompileProjectInput {
    /// Project root path (used when loading from disk or as virtual root).
    #[serde(default)]
    root: Option<String>,
    /// In-memory project files: relative path -> source.
    #[serde(default)]
    files: HashMap<String, String>,
}

fn parse_error_diag(source: &str, err: juni_syntax::ParseError) -> Diagnostic {
    let msg = err.to_string();
    let (line, col) = match &err {
        juni_syntax::ParseError::Unexpected { line, col, .. } => (*line, *col),
        juni_syntax::ParseError::Lex(e) => match e {
            juni_syntax::lexer::LexError::UnexpectedChar(_, l, c)
            | juni_syntax::lexer::LexError::InvalidNumber(l, c)
            | juni_syntax::lexer::LexError::UnterminatedString(l, c) => (*l, *c),
            juni_syntax::lexer::LexError::InconsistentIndent(l) => (*l, 1),
        },
        juni_syntax::ParseError::Message(_) => (1, 1),
    };
    let _ = source;
    Diagnostic {
        severity: Severity::Error,
        span: juni_syntax::Span::new(0, 0, line, col),
        message: msg,
        notes: Vec::new(),
        file: None,
    }
}

fn diag_out(d: &Diagnostic, source: &str) -> DiagOut {
    let json = d.to_json(source);
    DiagOut {
        severity: json.severity,
        line: json.line,
        col: json.col,
        end_line: json.end_line,
        end_col: json.end_col,
        message: json.message,
        file: d.file.clone(),
    }
}

fn compile_result(ok: bool, diagnostics: Vec<DiagOut>, wasm: Option<String>) -> String {
    let out = CompileResult {
        ok,
        diagnostics,
        wasm,
    };
    serde_json::to_string(&out).unwrap_or_else(|_| {
        r#"{"ok":false,"diagnostics":[{"severity":"error","line":1,"col":1,"endLine":1,"endCol":1,"message":"serialize failed"}],"wasm":null}"#.into()
    })
}

/// Compile Juni source. Returns JSON: `{ ok, diagnostics, wasm? }` (wasm is base64).
#[wasm_bindgen]
pub fn compile(source: &str) -> String {
    match parse(source) {
        Err(e) => {
            let d = parse_error_diag(source, e);
            compile_result(
                false,
                vec![diag_out(&d, source)],
                None,
            )
        }
        Ok(module) => match check_ok(&module) {
            Ok(hir) => {
                let wasm = emit_wasm(&hir);
                compile_result(true, vec![], Some(B64.encode(wasm)))
            }
            Err(diags) => compile_result(
                false,
                diags
                    .iter()
                    .map(|d| diag_out(d, source))
                    .collect(),
                None,
            ),
        },
    }
}

/// Typecheck only; returns the same JSON shape with `wasm` always null.
#[wasm_bindgen]
pub fn check_source(source: &str) -> String {
    match parse(source) {
        Err(e) => {
            let d = parse_error_diag(source, e);
            compile_result(false, vec![diag_out(&d, source)], None)
        }
        Ok(module) => {
            let result = check(&module);
            let has_err = result
                .diagnostics
                .iter()
                .any(|d| d.severity == Severity::Error);
            compile_result(
                !has_err,
                result
                    .diagnostics
                    .iter()
                    .map(|d| diag_out(d, source))
                    .collect(),
                None,
            )
        }
    }
}

/// Completion-lite for the browser IDE.
///
/// Returns JSON: `{ items: [{ label, kind, detail? }] }`
#[wasm_bindgen]
pub fn complete_source(source: &str, line: u32, col: u32) -> String {
    match Workspace::from_single_file("main.juni", source) {
        Ok(ws) => {
            let items = ws.complete("main.juni", line, col);
            serde_json::to_string(&serde_json::json!({ "items": items }))
                .unwrap_or_else(|_| r#"{"items":[]}"#.into())
        }
        Err(e) => serde_json::to_string(&serde_json::json!({
            "items": [],
            "error": e.to_string(),
        }))
        .unwrap_or_else(|_| r#"{"items":[]}"#.into()),
    }
}

/// Go-to-definition for the browser IDE.
///
/// Returns JSON: `{ location: { file, line, col, endLine, endCol } | null }`
#[wasm_bindgen]
pub fn goto_def_source(source: &str, line: u32, col: u32) -> String {
    match Workspace::from_single_file("main.juni", source) {
        Ok(ws) => {
            let location = ws.goto_definition("main.juni", line, col);
            serde_json::to_string(&serde_json::json!({ "location": location }))
                .unwrap_or_else(|_| r#"{"location":null}"#.into())
        }
        Err(_) => r#"{"location":null}"#.into(),
    }
}

/// Hover for the browser IDE (parity with desktop LSP).
///
/// Returns JSON: `{ hover: { contents, line, col, end_line, end_col } | null }`
#[wasm_bindgen]
pub fn hover_source(source: &str, line: u32, col: u32) -> String {
    match Workspace::from_single_file("main.juni", source) {
        Ok(ws) => {
            let hover = ws.hover("main.juni", line, col);
            serde_json::to_string(&serde_json::json!({ "hover": hover }))
                .unwrap_or_else(|_| r#"{"hover":null}"#.into())
        }
        Err(_) => r#"{"hover":null}"#.into(),
    }
}

/// Diagnostics for the browser IDE (parity with desktop LSP).
///
/// Returns JSON: `{ items: [{ severity, message, line, col, end_line, end_col, file }] }`
#[wasm_bindgen]
pub fn diagnostics_source(source: &str) -> String {
    match Workspace::from_single_file("main.juni", source) {
        Ok(ws) => {
            let items = ws.diagnostics("main.juni");
            serde_json::to_string(&serde_json::json!({ "items": items }))
                .unwrap_or_else(|_| r#"{"items":[]}"#.into())
        }
        Err(_) => r#"{"items":[]}"#.into(),
    }
}

/// Compile a multi-file Juni project.
///
/// Accepts JSON: `{ root?, files: { "juni.toml": "...", "src/main.juni": "..." } }`
/// or `{ root: "/path/to/project" }` to load from disk (native targets only).
///
/// Returns JSON: `{ ok, diagnostics, wasm? }` with per-file diagnostics and base64 wasm.
#[wasm_bindgen]
pub fn compile_project(json: &str) -> String {
    match compile_project_inner(json) {
        Ok(out) => out,
        Err(msg) => compile_result(
            false,
            vec![DiagOut {
                severity: "error".into(),
                line: 1,
                col: 1,
                end_line: 1,
                end_col: 1,
                message: msg,
                file: None,
            }],
            None,
        ),
    }
}

fn compile_project_inner(json: &str) -> Result<String, String> {
    let input: CompileProjectInput =
        serde_json::from_str(json).map_err(|e| format!("invalid project JSON: {e}"))?;

    let project = if !input.files.is_empty() {
        let root = PathBuf::from(input.root.as_deref().unwrap_or("."));
        load_project_from_files(root, input.files)
            .map_err(|e| e.to_string())?
    } else if let Some(root) = input.root {
        load_project(Path::new(&root)).map_err(|e| e.to_string())?
    } else {
        return Err("project JSON requires `files` or `root`".into());
    };

    compile_loaded_project(&project)
}

fn compile_loaded_project(project: &Project) -> Result<String, String> {
    let mut diagnostics = Vec::new();

    for m in &project.modules {
        if let Some(err) = &m.parse_error {
            diagnostics.push(DiagOut {
                severity: "error".into(),
                line: 1,
                col: 1,
                end_line: 1,
                end_col: 1,
                message: err.to_string(),
                file: Some(m.path.display().to_string()),
            });
        }
    }

    if diagnostics.iter().any(|d| d.severity == "error") {
        return Ok(compile_result(false, diagnostics, None));
    }

    let modules: Vec<ProgramModule> = project
        .modules
        .iter()
        .filter_map(|m| {
            let ast = m.ast.clone()?;
            Some(ProgramModule {
                name: m.name.clone(),
                file: Some(m.path.display().to_string()),
                module: ast,
            })
        })
        .collect();

    let result = check_program(&modules, &project.entry);
    let source_by_file: HashMap<String, &str> = project
        .modules
        .iter()
        .map(|m| (m.path.display().to_string(), m.source.as_str()))
        .collect();

    for d in &result.diagnostics {
        let source = d
            .file
            .as_deref()
            .and_then(|f| source_by_file.get(f).copied())
            .unwrap_or("");
        diagnostics.push(diag_out(d, source));
    }

    let has_err = diagnostics.iter().any(|d| d.severity == "error");
    if has_err {
        return Ok(compile_result(false, diagnostics, None));
    }

    let wasm = emit_wasm_program(&result.program);
    Ok(compile_result(true, diagnostics, Some(B64.encode(wasm))))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compile_project_hello_modules_json() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../juni-driver/tests/projects/hello_modules");
        let juni_toml = std::fs::read_to_string(root.join("juni.toml")).unwrap();
        let main_src = std::fs::read_to_string(root.join("src/main.juni")).unwrap();
        let math_src = std::fs::read_to_string(root.join("src/math.juni")).unwrap();

        let input = serde_json::json!({
            "root": ".",
            "files": {
                "juni.toml": juni_toml,
                "src/main.juni": main_src,
                "src/math.juni": math_src,
            }
        });

        let out = compile_project(&input.to_string());
        let parsed: CompileResult = serde_json::from_str(&out).expect("valid json");
        assert!(parsed.ok, "expected ok, got: {out}");
        assert!(parsed.wasm.is_some());
        assert!(parsed.diagnostics.is_empty());
    }

    #[test]
    fn compile_project_scene3d_custom_json() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../examples/projects/scene3d_custom");
        let juni_toml = std::fs::read_to_string(root.join("juni.toml")).unwrap();
        let main_src = std::fs::read_to_string(root.join("src/main.juni")).unwrap();

        let input = serde_json::json!({
            "root": ".",
            "files": {
                "juni.toml": juni_toml,
                "src/main.juni": main_src,
            }
        });

        let out = compile_project(&input.to_string());
        let parsed: CompileResult = serde_json::from_str(&out).expect("valid json");
        assert!(parsed.ok, "expected ok, got: {out}");
        assert!(parsed.wasm.is_some());
        assert!(parsed.diagnostics.is_empty());
    }

    #[test]
    fn hover_and_diagnostics_source_json() {
        let src = "fn main() -> i32:\n    let x = 1\n    return x\n";
        let hover = hover_source(src, 2, 9);
        assert!(hover.contains("hover"), "hover json: {hover}");
        let diags = diagnostics_source(src);
        assert!(diags.contains("items"), "diags json: {diags}");
        let bad = diagnostics_source("fn main() -> i32:\n    return \"nope\"\n");
        assert!(
            bad.contains("error") || bad.contains("message"),
            "expected diagnostic: {bad}"
        );
    }
}
