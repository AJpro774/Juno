//! Token kinds for Juni.

use crate::span::Span;

#[derive(Debug, Clone, PartialEq)]
pub struct Token {
    pub kind: TokenKind,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TokenKind {
    // Keywords
    Fn,
    Struct,
    Let,
    If,
    Else,
    While,
    For,
    In,
    Return,
    New,
    Delete,
    Ref,
    Mut,
    True,
    False,
    And,
    Or,
    Not,
    State,
    Break,
    Continue,
    Import,
    Export,
    From,
    As,

    // Identifiers and literals
    Ident(String),
    Int(i64),
    Float(f64),
    Str(String),

    // Punctuation
    Colon,
    Comma,
    Dot,
    LParen,
    RParen,
    LBracket,
    RBracket,
    Arrow, // ->
    DotDot, // ..
    Assign,
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
    Plus,
    Minus,
    Star,
    Slash,
    Percent,

    // Indentation
    Newline,
    Indent,
    Dedent,

    Eof,
}

impl TokenKind {
    pub fn keyword(s: &str) -> Option<TokenKind> {
        Some(match s {
            "fn" => TokenKind::Fn,
            "struct" => TokenKind::Struct,
            "let" => TokenKind::Let,
            "if" => TokenKind::If,
            "else" => TokenKind::Else,
            "while" => TokenKind::While,
            "for" => TokenKind::For,
            "in" => TokenKind::In,
            "return" => TokenKind::Return,
            "new" => TokenKind::New,
            "delete" => TokenKind::Delete,
            "ref" => TokenKind::Ref,
            "mut" => TokenKind::Mut,
            "true" => TokenKind::True,
            "false" => TokenKind::False,
            "and" => TokenKind::And,
            "or" => TokenKind::Or,
            "not" => TokenKind::Not,
            "state" => TokenKind::State,
            "break" => TokenKind::Break,
            "continue" => TokenKind::Continue,
            "import" => TokenKind::Import,
            "export" => TokenKind::Export,
            "from" => TokenKind::From,
            "as" => TokenKind::As,
            _ => return None,
        })
    }
}
