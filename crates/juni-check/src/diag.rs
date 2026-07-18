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
    /// Secondary notes (e.g. "did you mean `foo`?").
    pub notes: Vec<String>,
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
    /// Primary message; notes are appended as `note: ...` lines for consumers
    /// that only read `message`.
    pub message: String,
    pub notes: Vec<String>,
}

impl Diagnostic {
    pub fn error(span: Span, message: impl Into<String>) -> Self {
        Self {
            severity: Severity::Error,
            span,
            message: message.into(),
            notes: Vec::new(),
            file: None,
        }
    }

    pub fn with_note(mut self, note: impl Into<String>) -> Self {
        self.notes.push(note.into());
        self
    }

    pub fn with_notes(mut self, notes: impl IntoIterator<Item = String>) -> Self {
        self.notes.extend(notes);
        self
    }

    pub fn format(&self, filename: &str) -> String {
        let kind = match self.severity {
            Severity::Error => "error",
            Severity::Warning => "warning",
        };
        let file = self.file.as_deref().unwrap_or(filename);
        let mut out = format!(
            "{file}:{}:{}: {kind}: {}",
            self.span.line, self.span.col, self.message
        );
        for note in &self.notes {
            out.push_str(&format!("\n{file}:{}:{}: note: {note}", self.span.line, self.span.col));
        }
        out
    }

    /// Build a JSON-friendly diagnostic with end position derived from `source`.
    pub fn to_json(&self, source: &str) -> DiagnosticJson {
        let (end_line, end_col) = offset_to_line_col(source, self.span.end);
        let severity = match self.severity {
            Severity::Error => "error",
            Severity::Warning => "warning",
        };
        let mut message = self.message.clone();
        for note in &self.notes {
            message.push_str("\nnote: ");
            message.push_str(note);
        }
        DiagnosticJson {
            severity: severity.to_string(),
            line: self.span.line,
            col: self.span.col,
            end_line,
            end_col: end_col.max(self.span.col),
            message,
            notes: self.notes.clone(),
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

/// Levenshtein edit distance (small strings: names, keywords).
pub fn edit_distance(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let (n, m) = (a.len(), b.len());
    if n == 0 {
        return m;
    }
    if m == 0 {
        return n;
    }
    let mut prev: Vec<usize> = (0..=m).collect();
    let mut cur = vec![0; m + 1];
    for i in 1..=n {
        cur[0] = i;
        for j in 1..=m {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            cur[j] = (prev[j] + 1)
                .min(cur[j - 1] + 1)
                .min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[m]
}

/// Pick the closest candidate name for a "did you mean" note.
pub fn did_you_mean<'a>(name: &str, candidates: impl IntoIterator<Item = &'a str>) -> Option<String> {
    let mut best: Option<(usize, &'a str)> = None;
    for c in candidates {
        if c == name || c.is_empty() {
            continue;
        }
        let d = edit_distance(name, c);
        // Allow small typos; tighten for short names.
        let max_dist = if name.len() <= 3 { 1 } else { 2 };
        if d == 0 || d > max_dist {
            continue;
        }
        if best.map(|(bd, _)| d < bd).unwrap_or(true) {
            best = Some((d, c));
        }
    }
    best.map(|(_, s)| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn edit_distance_basic() {
        assert_eq!(edit_distance("foo", "foo"), 0);
        assert_eq!(edit_distance("foo", "fo"), 1);
        assert_eq!(edit_distance("clamp", "clmap"), 2);
    }

    #[test]
    fn did_you_mean_picks_close() {
        assert_eq!(
            did_you_mean("clmap", ["clamp", "min", "max"]),
            Some("clamp".into())
        );
        assert_eq!(did_you_mean("zzzz", ["clamp", "min"]), None);
    }
}
