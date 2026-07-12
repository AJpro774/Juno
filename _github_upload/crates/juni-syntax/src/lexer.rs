//! Indentation-aware lexer for Juni.

use crate::span::Span;
use crate::token::{Token, TokenKind};
use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum LexError {
    #[error("unexpected character `{0}` at line {1}, column {2}")]
    UnexpectedChar(char, u32, u32),
    #[error("invalid number at line {0}, column {1}")]
    InvalidNumber(u32, u32),
    #[error("inconsistent indentation at line {0}")]
    InconsistentIndent(u32),
    #[error("unterminated string at line {0}, column {1}")]
    UnterminatedString(u32, u32),
}

pub fn lex(source: &str) -> Result<Vec<Token>, LexError> {
    Lexer::new(source).tokenize()
}

struct Lexer<'a> {
    src: &'a str,
    pos: usize,
    line: u32,
    col: u32,
    indent_stack: Vec<usize>,
    at_line_start: bool,
    pending: Vec<Token>,
}

impl<'a> Lexer<'a> {
    fn new(src: &'a str) -> Self {
        Self {
            src,
            pos: 0,
            line: 1,
            col: 1,
            indent_stack: vec![0],
            at_line_start: true,
            pending: Vec::new(),
        }
    }

    fn peek(&self) -> Option<char> {
        self.src[self.pos..].chars().next()
    }

    fn peek2(&self) -> Option<(char, char)> {
        let mut chars = self.src[self.pos..].chars();
        let a = chars.next()?;
        let b = chars.next()?;
        Some((a, b))
    }

    fn bump(&mut self) -> Option<char> {
        let ch = self.peek()?;
        let len = ch.len_utf8();
        self.pos += len;
        if ch == '\n' {
            self.line += 1;
            self.col = 1;
            self.at_line_start = true;
        } else {
            self.col += 1;
        }
        Some(ch)
    }

    fn span_from(&self, start: usize, start_line: u32, start_col: u32) -> Span {
        Span::new(start, self.pos, start_line, start_col)
    }

    fn emit(&mut self, kind: TokenKind, span: Span) {
        self.pending.push(Token { kind, span });
    }

    fn handle_indent(&mut self) -> Result<(), LexError> {
        let start = self.pos;
        let start_line = self.line;
        let start_col = self.col;
        let mut spaces = 0usize;

        while let Some(ch) = self.peek() {
            match ch {
                ' ' => {
                    spaces += 1;
                    self.bump();
                }
                '\t' => {
                    return Err(LexError::UnexpectedChar('\t', self.line, self.col));
                }
                '#' => {
                    while let Some(c) = self.peek() {
                        if c == '\n' {
                            break;
                        }
                        self.bump();
                    }
                    return Ok(());
                }
                '\n' => {
                    self.bump();
                    return Ok(());
                }
                '\r' => {
                    self.bump();
                    continue;
                }
                _ => break,
            }
        }

        if self.peek().is_none() {
            return Ok(());
        }

        let current = *self.indent_stack.last().unwrap();
        if spaces == current {
            self.at_line_start = false;
            return Ok(());
        }
        if spaces > current {
            if spaces - current == 0 || (spaces > current && !self.indent_stack.contains(&spaces) && spaces % 4 != 0 && spaces - current != 2 && spaces - current != 4) {
                // Allow any increase; push new level
            }
            self.indent_stack.push(spaces);
            self.emit(
                TokenKind::Indent,
                self.span_from(start, start_line, start_col),
            );
            self.at_line_start = false;
            return Ok(());
        }

        // Dedent
        while let Some(&top) = self.indent_stack.last() {
            if top == spaces {
                break;
            }
            if top < spaces {
                return Err(LexError::InconsistentIndent(start_line));
            }
            self.indent_stack.pop();
            self.emit(
                TokenKind::Dedent,
                self.span_from(start, start_line, start_col),
            );
        }
        if self.indent_stack.last().copied() != Some(spaces) {
            return Err(LexError::InconsistentIndent(start_line));
        }
        self.at_line_start = false;
        Ok(())
    }

    fn tokenize(mut self) -> Result<Vec<Token>, LexError> {
        let mut tokens = Vec::new();

        loop {
            if !self.pending.is_empty() {
                tokens.extend(self.pending.drain(..));
            }

            if self.peek().is_none() {
                break;
            }

            if self.at_line_start {
                self.handle_indent()?;
                if !self.pending.is_empty() || self.at_line_start {
                    // Pending INDENT/DEDENT, or a blank/comment line was skipped.
                    continue;
                }
            }

            // Skip spaces and carriage returns mid-line
            while let Some(ch) = self.peek() {
                if ch == ' ' || ch == '\r' {
                    self.bump();
                } else {
                    break;
                }
            }

            // Comments
            if self.peek() == Some('#') {
                while let Some(c) = self.peek() {
                    if c == '\n' {
                        break;
                    }
                    self.bump();
                }
                continue;
            }

            let Some(ch) = self.peek() else {
                break;
            };

            let start = self.pos;
            let start_line = self.line;
            let start_col = self.col;

            if ch == '\n' {
                self.bump();
                tokens.push(Token {
                    kind: TokenKind::Newline,
                    span: self.span_from(start, start_line, start_col),
                });
                continue;
            }

            // Two-char operators
            if let Some((a, b)) = self.peek2() {
                let kind = match (a, b) {
                    ('-', '>') => Some(TokenKind::Arrow),
                    ('.', '.') => Some(TokenKind::DotDot),
                    ('=', '=') => Some(TokenKind::Eq),
                    ('!', '=') => Some(TokenKind::Ne),
                    ('<', '=') => Some(TokenKind::Le),
                    ('>', '=') => Some(TokenKind::Ge),
                    _ => None,
                };
                if let Some(kind) = kind {
                    self.bump();
                    self.bump();
                    tokens.push(Token {
                        kind,
                        span: self.span_from(start, start_line, start_col),
                    });
                    continue;
                }
            }

            // Single-char
            let single = match ch {
                ':' => Some(TokenKind::Colon),
                ',' => Some(TokenKind::Comma),
                '.' => Some(TokenKind::Dot),
                '(' => Some(TokenKind::LParen),
                ')' => Some(TokenKind::RParen),
                '[' => Some(TokenKind::LBracket),
                ']' => Some(TokenKind::RBracket),
                '=' => Some(TokenKind::Assign),
                '<' => Some(TokenKind::Lt),
                '>' => Some(TokenKind::Gt),
                '+' => Some(TokenKind::Plus),
                '-' => Some(TokenKind::Minus),
                '*' => Some(TokenKind::Star),
                '/' => Some(TokenKind::Slash),
                '%' => Some(TokenKind::Percent),
                _ => None,
            };
            if let Some(kind) = single {
                self.bump();
                tokens.push(Token {
                    kind,
                    span: self.span_from(start, start_line, start_col),
                });
                continue;
            }

            if ch.is_ascii_digit() {
                tokens.push(self.lex_number()?);
                continue;
            }

            if ch == '"' {
                tokens.push(self.lex_string()?);
                continue;
            }

            if ch == '_' || ch.is_ascii_alphabetic() {
                tokens.push(self.lex_ident());
                continue;
            }

            return Err(LexError::UnexpectedChar(ch, start_line, start_col));
        }

        // Closing dedents
        while self.indent_stack.len() > 1 {
            self.indent_stack.pop();
            tokens.push(Token {
                kind: TokenKind::Dedent,
                span: Span::new(self.pos, self.pos, self.line, self.col),
            });
        }

        tokens.push(Token {
            kind: TokenKind::Eof,
            span: Span::new(self.pos, self.pos, self.line, self.col),
        });

        // Collapse multiple newlines
        let mut cleaned = Vec::new();
        let mut last_nl = false;
        for t in tokens {
            match t.kind {
                TokenKind::Newline => {
                    if !last_nl && !cleaned.is_empty() {
                        cleaned.push(t);
                        last_nl = true;
                    }
                }
                TokenKind::Eof => {
                    cleaned.push(t);
                }
                _ => {
                    cleaned.push(t);
                    last_nl = false;
                }
            }
        }
        Ok(cleaned)
    }

    fn lex_ident(&mut self) -> Token {
        let start = self.pos;
        let start_line = self.line;
        let start_col = self.col;
        while let Some(ch) = self.peek() {
            if ch == '_' || ch.is_ascii_alphanumeric() {
                self.bump();
            } else {
                break;
            }
        }
        let text = &self.src[start..self.pos];
        let kind = TokenKind::keyword(text).unwrap_or_else(|| TokenKind::Ident(text.to_string()));
        Token {
            kind,
            span: self.span_from(start, start_line, start_col),
        }
    }

    fn lex_string(&mut self) -> Result<Token, LexError> {
        let start = self.pos;
        let start_line = self.line;
        let start_col = self.col;
        self.bump(); // opening "
        let mut value = String::new();
        loop {
            match self.peek() {
                None => return Err(LexError::UnterminatedString(start_line, start_col)),
                Some('"') => {
                    self.bump();
                    break;
                }
                Some('\\') => {
                    self.bump();
                    match self.peek() {
                        Some('n') => {
                            self.bump();
                            value.push('\n');
                        }
                        Some('t') => {
                            self.bump();
                            value.push('\t');
                        }
                        Some('\\') => {
                            self.bump();
                            value.push('\\');
                        }
                        Some('"') => {
                            self.bump();
                            value.push('"');
                        }
                        Some(c) => {
                            self.bump();
                            value.push(c);
                        }
                        None => return Err(LexError::UnterminatedString(start_line, start_col)),
                    }
                }
                Some('\n') => return Err(LexError::UnterminatedString(start_line, start_col)),
                Some(c) => {
                    self.bump();
                    value.push(c);
                }
            }
        }
        Ok(Token {
            kind: TokenKind::Str(value),
            span: self.span_from(start, start_line, start_col),
        })
    }

    fn lex_number(&mut self) -> Result<Token, LexError> {
        let start = self.pos;
        let start_line = self.line;
        let start_col = self.col;
        let mut is_float = false;

        while let Some(ch) = self.peek() {
            if ch.is_ascii_digit() {
                self.bump();
            } else {
                break;
            }
        }

        if self.peek() == Some('.') {
            let rest = &self.src[self.pos + 1..];
            if rest.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                is_float = true;
                self.bump(); // .
                while let Some(ch) = self.peek() {
                    if ch.is_ascii_digit() {
                        self.bump();
                    } else {
                        break;
                    }
                }
            }
        }

        let text = &self.src[start..self.pos];
        let span = self.span_from(start, start_line, start_col);
        if is_float {
            let v: f64 = text
                .parse()
                .map_err(|_| LexError::InvalidNumber(start_line, start_col))?;
            Ok(Token {
                kind: TokenKind::Float(v),
                span,
            })
        } else {
            let v: i64 = text
                .parse()
                .map_err(|_| LexError::InvalidNumber(start_line, start_col))?;
            Ok(Token {
                kind: TokenKind::Int(v),
                span,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lex_hello() {
        let src = "fn main() -> i32:\n    return 0\n";
        let tokens = lex(src).unwrap();
        assert!(tokens.iter().any(|t| t.kind == TokenKind::Fn));
        assert!(tokens.iter().any(|t| t.kind == TokenKind::Indent));
        assert!(tokens.iter().any(|t| t.kind == TokenKind::Dedent));
    }

    #[test]
    fn lex_struct_then_fn() {
        let src = "struct Vec2:\n    x: f32\n    y: f32\n\nfn main() -> i32:\n    return 0\n";
        let tokens = lex(src).expect("lex");
        let kinds: Vec<_> = tokens.iter().map(|t| format!("{:?}", t.kind)).collect();
        assert!(
            kinds.iter().any(|k| k.contains("Struct")),
            "tokens: {kinds:?}"
        );
        assert!(kinds.iter().any(|k| k == "Dedent"), "tokens: {kinds:?}");
        assert!(kinds.iter().any(|k| k == "Fn"), "tokens: {kinds:?}");
    }

    #[test]
    fn lex_nested_if() {
        let src = "fn main() -> i32:\n    if 1 > 0:\n        return 1\n    return 0\n";
        lex(src).expect("lex nested");
    }

    #[test]
    fn lex_struct_no_blank() {
        let src = "struct Vec2:\n    x: f32\n    y: f32\nfn main() -> i32:\n    return 0\n";
        lex(src).expect("lex no blank");
    }
}
