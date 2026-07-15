//! Diagnostics for the Juni checker.

use juni_syntax::Span;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diagnostic {
    pub severity: Severity,
    pub span: Span,
    pub message: String,
    /// Source file path when checking multi-module projects.
    pub file: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiagnosticJson {
    pub severity: String,
    pub line: u32,
    pub col: u32,
    pub end_line: u32,
    pub end_col: u32,
    pub message: String,
}

impl Diagnostic {
    pub fn format(&self, filename: &str) -> String {
        let kind = match self.severity {
            Severity::Error => "error",
            Severity::Warning => "warning",
        };
        let file = self.file.as_deref().unwrap_or(filename);
        format!(
            "{file}:{}:{}: {kind}: {}",
            self.span.line, self.span.col, self.message
        )
    }

    /// Build a JSON-friendly diagnostic with end position derived from `source`.
    pub fn to_json(&self, source: &str) -> DiagnosticJson {
        let (end_line, end_col) = offset_to_line_col(source, self.span.end);
        let severity = match self.severity {
            Severity::Error => "error",
            Severity::Warning => "warning",
        };
        DiagnosticJson {
            severity: severity.to_string(),
            line: self.span.line,
            col: self.span.col,
            end_line,
            end_col: end_col.max(self.span.col),
            message: self.message.clone(),
        }
    }
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

pub fn diagnostics_to_json(diags: &[Diagnostic], source: &str) -> Vec<DiagnosticJson> {
    diags.iter().map(|d| d.to_json(source)).collect()
}
