//! Source spans for diagnostics.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Span {
    pub start: usize,
    pub end: usize,
    pub line: u32,
    pub col: u32,
}

impl Span {
    pub fn new(start: usize, end: usize, line: u32, col: u32) -> Self {
        Self {
            start,
            end,
            line,
            col,
        }
    }

    pub fn dummy() -> Self {
        Self {
            start: 0,
            end: 0,
            line: 1,
            col: 1,
        }
    }

    pub fn merge(self, other: Span) -> Span {
        Span {
            start: self.start.min(other.start),
            end: self.end.max(other.end),
            line: self.line,
            col: self.col,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Spanned<T> {
    pub value: T,
    pub span: Span,
}

impl<T> Spanned<T> {
    pub fn new(value: T, span: Span) -> Self {
        Self { value, span }
    }
}
