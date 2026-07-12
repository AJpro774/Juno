//! Browser-facing Juni compiler API.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use juni_check::diag::{diagnostics_to_json, Diagnostic, DiagnosticJson, Severity};
use juni_check::{check, check_ok};
use juni_codegen::emit_wasm;
use juni_syntax::parse;
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct CompileResult {
    ok: bool,
    diagnostics: Vec<DiagOut>,
    wasm: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagOut {
    severity: String,
    line: u32,
    col: u32,
    end_line: u32,
    end_col: u32,
    message: String,
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
        }
    }
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
    }
}

/// Compile Juni source. Returns JSON: `{ ok, diagnostics, wasm? }` (wasm is base64).
#[wasm_bindgen]
pub fn compile(source: &str) -> String {
    match parse(source) {
        Err(e) => {
            let d = parse_error_diag(source, e);
            let out = CompileResult {
                ok: false,
                diagnostics: diagnostics_to_json(&[d], source)
                    .into_iter()
                    .map(DiagOut::from)
                    .collect(),
                wasm: None,
            };
            serde_json::to_string(&out).unwrap_or_else(|_| {
                r#"{"ok":false,"diagnostics":[{"severity":"error","line":1,"col":1,"endLine":1,"endCol":1,"message":"serialize failed"}],"wasm":null}"#.into()
            })
        }
        Ok(module) => match check_ok(&module) {
            Ok(hir) => {
                let wasm = emit_wasm(&hir);
                let out = CompileResult {
                    ok: true,
                    diagnostics: vec![],
                    wasm: Some(B64.encode(wasm)),
                };
                serde_json::to_string(&out).unwrap()
            }
            Err(diags) => {
                let out = CompileResult {
                    ok: false,
                    diagnostics: diagnostics_to_json(&diags, source)
                        .into_iter()
                        .map(DiagOut::from)
                        .collect(),
                    wasm: None,
                };
                serde_json::to_string(&out).unwrap()
            }
        },
    }
}

/// Typecheck only; returns the same JSON shape with `wasm` always null.
#[wasm_bindgen]
pub fn check_source(source: &str) -> String {
    match parse(source) {
        Err(e) => {
            let d = parse_error_diag(source, e);
            let out = CompileResult {
                ok: false,
                diagnostics: diagnostics_to_json(&[d], source)
                    .into_iter()
                    .map(DiagOut::from)
                    .collect(),
                wasm: None,
            };
            serde_json::to_string(&out).unwrap()
        }
        Ok(module) => {
            let result = check(&module);
            let has_err = result
                .diagnostics
                .iter()
                .any(|d| d.severity == Severity::Error);
            let out = CompileResult {
                ok: !has_err,
                diagnostics: diagnostics_to_json(&result.diagnostics, source)
                    .into_iter()
                    .map(DiagOut::from)
                    .collect(),
                wasm: None,
            };
            serde_json::to_string(&out).unwrap()
        }
    }
}
