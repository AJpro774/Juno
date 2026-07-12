//! Recursive-descent parser for Juni.

use crate::ast::*;
use crate::lexer::{lex, LexError};
use crate::span::Span;
use crate::token::{Token, TokenKind};
use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq)]
pub enum ParseError {
    #[error("{0}")]
    Lex(#[from] LexError),
    #[error("unexpected token near line {line}, column {col}: expected {expected}")]
    Unexpected {
        line: u32,
        col: u32,
        expected: String,
    },
    #[error("{0}")]
    Message(String),
}

pub fn parse(source: &str) -> Result<Module, ParseError> {
    let tokens = lex(source)?;
    Parser::new(tokens).parse_module()
}

struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    fn new(tokens: Vec<Token>) -> Self {
        Self { tokens, pos: 0 }
    }

    fn peek(&self) -> &Token {
        &self.tokens[self.pos.min(self.tokens.len() - 1)]
    }

    fn peek_kind(&self) -> &TokenKind {
        &self.peek().kind
    }

    fn bump(&mut self) -> Token {
        let t = self.peek().clone();
        if self.pos < self.tokens.len() - 1 {
            self.pos += 1;
        }
        t
    }

    fn expect(&mut self, kind: TokenKind, expected: &str) -> Result<Token, ParseError> {
        if self.peek_kind() == &kind
            || matches!(
                (self.peek_kind(), &kind),
                (TokenKind::Ident(_), TokenKind::Ident(_))
            )
        {
            if std::mem::discriminant(self.peek_kind()) == std::mem::discriminant(&kind)
                || (matches!(self.peek_kind(), TokenKind::Ident(_))
                    && matches!(kind, TokenKind::Ident(_)))
            {
                return Ok(self.bump());
            }
        }
        if self.peek_kind() == &kind {
            return Ok(self.bump());
        }
        let t = self.peek();
        Err(ParseError::Unexpected {
            line: t.span.line,
            col: t.span.col,
            expected: expected.to_string(),
        })
    }

    fn expect_ident(&mut self) -> Result<(String, Span), ParseError> {
        let t = self.peek().clone();
        match &t.kind {
            TokenKind::Ident(name) => {
                self.bump();
                Ok((name.clone(), t.span))
            }
            _ => Err(ParseError::Unexpected {
                line: t.span.line,
                col: t.span.col,
                expected: "identifier".into(),
            }),
        }
    }

    fn skip_newlines(&mut self) {
        while matches!(self.peek_kind(), TokenKind::Newline) {
            self.bump();
        }
    }

    fn parse_module(&mut self) -> Result<Module, ParseError> {
        let start = self.peek().span;
        let mut items = Vec::new();
        self.skip_newlines();
        while !matches!(self.peek_kind(), TokenKind::Eof) {
            items.push(self.parse_item()?);
            self.skip_newlines();
        }
        let end = self.peek().span;
        Ok(Module {
            items,
            span: start.merge(end),
        })
    }

    fn parse_item(&mut self) -> Result<Item, ParseError> {
        let export_start = if matches!(self.peek_kind(), TokenKind::Export) {
            Some(self.expect(TokenKind::Export, "`export`")?.span)
        } else {
            None
        };

        if matches!(self.peek_kind(), TokenKind::Import) {
            if export_start.is_some() {
                return Err(ParseError::Message(
                    "cannot export an import declaration".into(),
                ));
            }
            return Ok(Item::Import(self.parse_import_module()?));
        }

        if matches!(self.peek_kind(), TokenKind::From) {
            if export_start.is_some() {
                return Err(ParseError::Message(
                    "cannot export an import declaration".into(),
                ));
            }
            return Ok(Item::Import(self.parse_import_from()?));
        }

        let item = match self.peek_kind() {
            TokenKind::Struct => Item::Struct(self.parse_struct()?),
            TokenKind::Fn => Item::Fn(self.parse_fn()?),
            TokenKind::State => Item::State(self.parse_state()?),
            TokenKind::Let => {
                let Stmt::Let {
                    name,
                    ty,
                    init,
                    span,
                } = self.parse_let()?
                else {
                    unreachable!("parse_let always returns Let");
                };
                Item::Global(GlobalDef {
                    name,
                    ty,
                    init,
                    span,
                })
            }
            _ => {
                let t = self.peek();
                return Err(ParseError::Unexpected {
                    line: t.span.line,
                    col: t.span.col,
                    expected: "`import`, `from`, `export`, `struct`, `fn`, `state`, or `let`"
                        .into(),
                });
            }
        };

        if let Some(start) = export_start {
            let span = start.merge(item_span(&item));
            Ok(Item::Export(ExportDecl {
                item: export_item_from_item(item),
                span,
            }))
        } else {
            Ok(item)
        }
    }

    fn parse_import_module(&mut self) -> Result<ImportDecl, ParseError> {
        let start = self.expect(TokenKind::Import, "`import`")?.span;
        let (name, _) = self.expect_ident()?;
        let alias = if matches!(self.peek_kind(), TokenKind::As) {
            self.bump();
            let (alias, _) = self.expect_ident()?;
            Some(alias)
        } else {
            None
        };
        let end = self.peek().span;
        Ok(ImportDecl {
            kind: ImportKind::Module { name, alias },
            span: start.merge(end),
        })
    }

    fn parse_import_from(&mut self) -> Result<ImportDecl, ParseError> {
        let start = self.expect(TokenKind::From, "`from`")?.span;
        let (module, _) = self.expect_ident()?;
        self.expect(TokenKind::Import, "`import`")?;
        let mut names = Vec::new();
        loop {
            let (name, _) = self.expect_ident()?;
            let alias = if matches!(self.peek_kind(), TokenKind::As) {
                self.bump();
                let (alias, _) = self.expect_ident()?;
                Some(alias)
            } else {
                None
            };
            names.push(ImportName { name, alias });
            if matches!(self.peek_kind(), TokenKind::Comma) {
                self.bump();
                continue;
            }
            break;
        }
        let end = self.peek().span;
        Ok(ImportDecl {
            kind: ImportKind::From { module, names },
            span: start.merge(end),
        })
    }

    fn parse_state(&mut self) -> Result<StateDef, ParseError> {
        let start = self.expect(TokenKind::State, "`state`")?.span;
        self.expect(TokenKind::Colon, "`:`")?;
        self.expect(TokenKind::Newline, "newline")?;
        self.expect(TokenKind::Indent, "indented block")?;
        let mut fields = Vec::new();
        while !matches!(self.peek_kind(), TokenKind::Dedent | TokenKind::Eof) {
            self.skip_newlines();
            if matches!(self.peek_kind(), TokenKind::Dedent) {
                break;
            }
            let (name, fspan) = self.expect_ident()?;
            self.expect(TokenKind::Colon, "`:`")?;
            let ty = self.parse_type()?;
            self.expect(TokenKind::Assign, "`=`")?;
            let init = self.parse_expr()?;
            fields.push(StateField {
                name,
                ty,
                init,
                span: fspan,
            });
            if matches!(self.peek_kind(), TokenKind::Newline) {
                self.bump();
            }
        }
        let end = self.expect(TokenKind::Dedent, "dedent")?.span;
        Ok(StateDef {
            fields,
            span: start.merge(end),
        })
    }

    fn parse_struct(&mut self) -> Result<StructDef, ParseError> {
        let start = self.expect(TokenKind::Struct, "`struct`")?.span;
        let (name, _) = self.expect_ident()?;
        self.expect(TokenKind::Colon, "`:`")?;
        self.expect(TokenKind::Newline, "newline")?;
        self.expect(TokenKind::Indent, "indented block")?;
        let mut fields = Vec::new();
        while !matches!(self.peek_kind(), TokenKind::Dedent | TokenKind::Eof) {
            self.skip_newlines();
            if matches!(self.peek_kind(), TokenKind::Dedent) {
                break;
            }
            let (fname, fspan) = self.expect_ident()?;
            self.expect(TokenKind::Colon, "`:`")?;
            let ty = self.parse_type()?;
            fields.push(FieldDef {
                name: fname,
                ty,
                span: fspan,
            });
            if matches!(self.peek_kind(), TokenKind::Newline) {
                self.bump();
            }
        }
        self.expect(TokenKind::Dedent, "dedent")?;
        Ok(StructDef {
            name,
            fields,
            span: start,
        })
    }

    fn parse_type_params(&mut self) -> Result<Vec<TypeParam>, ParseError> {
        self.expect(TokenKind::LBracket, "`[`")?;
        let mut params = Vec::new();
        loop {
            let (name, span) = self.expect_ident()?;
            let constraint = if matches!(self.peek_kind(), TokenKind::Colon) {
                self.bump();
                let (c, _) = self.expect_ident()?;
                Some(c)
            } else {
                None
            };
            params.push(TypeParam {
                name,
                constraint,
                span,
            });
            if matches!(self.peek_kind(), TokenKind::Comma) {
                self.bump();
                continue;
            }
            break;
        }
        self.expect(TokenKind::RBracket, "`]`")?;
        Ok(params)
    }

    fn parse_fn(&mut self) -> Result<FnDef, ParseError> {
        let start = self.expect(TokenKind::Fn, "`fn`")?.span;
        let (name, _) = self.expect_ident()?;
        let type_params = if matches!(self.peek_kind(), TokenKind::LBracket) {
            self.parse_type_params()?
        } else {
            Vec::new()
        };
        self.expect(TokenKind::LParen, "`(`")?;
        let mut params = Vec::new();
        if !matches!(self.peek_kind(), TokenKind::RParen) {
            loop {
                let (pname, pspan) = self.expect_ident()?;
                self.expect(TokenKind::Colon, "`:`")?;
                let ty = self.parse_type()?;
                params.push(Param {
                    name: pname,
                    ty,
                    span: pspan,
                });
                if matches!(self.peek_kind(), TokenKind::Comma) {
                    self.bump();
                    continue;
                }
                break;
            }
        }
        self.expect(TokenKind::RParen, "`)`")?;
        self.expect(TokenKind::Arrow, "`->`")?;
        let ret = self.parse_type()?;
        self.expect(TokenKind::Colon, "`:`")?;
        self.expect(TokenKind::Newline, "newline")?;
        let body = self.parse_block()?;
        Ok(FnDef {
            name,
            type_params,
            params,
            ret,
            body,
            span: start,
        })
    }

    fn parse_block(&mut self) -> Result<Block, ParseError> {
        let start = self.expect(TokenKind::Indent, "indented block")?.span;
        let mut stmts = Vec::new();
        while !matches!(self.peek_kind(), TokenKind::Dedent | TokenKind::Eof) {
            self.skip_newlines();
            if matches!(self.peek_kind(), TokenKind::Dedent) {
                break;
            }
            stmts.push(self.parse_stmt()?);
            self.skip_newlines();
        }
        let end = self.expect(TokenKind::Dedent, "dedent")?.span;
        Ok(Block {
            stmts,
            span: start.merge(end),
        })
    }

    fn parse_stmt(&mut self) -> Result<Stmt, ParseError> {
        match self.peek_kind() {
            TokenKind::Let => self.parse_let(),
            TokenKind::If => self.parse_if(),
            TokenKind::While => self.parse_while(),
            TokenKind::For => self.parse_for(),
            TokenKind::Break => {
                let span = self.expect(TokenKind::Break, "`break`")?.span;
                Ok(Stmt::Break { span })
            }
            TokenKind::Continue => {
                let span = self.expect(TokenKind::Continue, "`continue`")?.span;
                Ok(Stmt::Continue { span })
            }
            TokenKind::Return => self.parse_return(),
            TokenKind::Delete => self.parse_delete(),
            _ => {
                let expr = self.parse_expr()?;
                if matches!(self.peek_kind(), TokenKind::Assign) {
                    let span = expr.span;
                    self.bump();
                    let value = self.parse_expr()?;
                    Ok(Stmt::Assign {
                        target: expr,
                        value,
                        span,
                    })
                } else {
                    let span = expr.span;
                    Ok(Stmt::Expr { expr, span })
                }
            }
        }
    }

    fn parse_let(&mut self) -> Result<Stmt, ParseError> {
        let start = self.expect(TokenKind::Let, "`let`")?.span;
        let (name, _) = self.expect_ident()?;
        let ty = if matches!(self.peek_kind(), TokenKind::Colon) {
            self.bump();
            Some(self.parse_type()?)
        } else {
            None
        };
        self.expect(TokenKind::Assign, "`=`")?;
        let init = self.parse_expr()?;
        Ok(Stmt::Let {
            name,
            ty,
            init,
            span: start,
        })
    }

    fn parse_if(&mut self) -> Result<Stmt, ParseError> {
        let start = self.expect(TokenKind::If, "`if`")?.span;
        let cond = self.parse_expr()?;
        self.expect(TokenKind::Colon, "`:`")?;
        self.expect(TokenKind::Newline, "newline")?;
        let then_block = self.parse_block()?;
        let else_block = if matches!(self.peek_kind(), TokenKind::Else) {
            self.bump();
            self.expect(TokenKind::Colon, "`:`")?;
            self.expect(TokenKind::Newline, "newline")?;
            Some(self.parse_block()?)
        } else {
            None
        };
        Ok(Stmt::If {
            cond,
            then_block,
            else_block,
            span: start,
        })
    }

    fn parse_while(&mut self) -> Result<Stmt, ParseError> {
        let start = self.expect(TokenKind::While, "`while`")?.span;
        let cond = self.parse_expr()?;
        self.expect(TokenKind::Colon, "`:`")?;
        self.expect(TokenKind::Newline, "newline")?;
        let body = self.parse_block()?;
        Ok(Stmt::While {
            cond,
            body,
            span: start,
        })
    }

    fn parse_for(&mut self) -> Result<Stmt, ParseError> {
        let start = self.expect(TokenKind::For, "`for`")?.span;
        let (var, _) = self.expect_ident()?;
        self.expect(TokenKind::In, "`in`")?;
        let range_start = self.parse_expr()?;
        self.expect(TokenKind::DotDot, "`..`")?;
        let range_end = self.parse_expr()?;
        self.expect(TokenKind::Colon, "`:`")?;
        self.expect(TokenKind::Newline, "newline")?;
        let body = self.parse_block()?;
        Ok(Stmt::For {
            var,
            start: range_start,
            end: range_end,
            body,
            span: start,
        })
    }

    fn parse_return(&mut self) -> Result<Stmt, ParseError> {
        let start = self.expect(TokenKind::Return, "`return`")?.span;
        let value = if matches!(
            self.peek_kind(),
            TokenKind::Newline | TokenKind::Dedent | TokenKind::Eof
        ) {
            None
        } else {
            Some(self.parse_expr()?)
        };
        Ok(Stmt::Return { value, span: start })
    }

    fn parse_delete(&mut self) -> Result<Stmt, ParseError> {
        let start = self.expect(TokenKind::Delete, "`delete`")?.span;
        let value = self.parse_expr()?;
        Ok(Stmt::Delete { value, span: start })
    }

    fn parse_type(&mut self) -> Result<TypeExpr, ParseError> {
        let start = self.peek().span;
        if matches!(self.peek_kind(), TokenKind::Mut) {
            self.bump();
            self.expect(TokenKind::Ref, "`ref`")?;
            let inner = self.parse_type()?;
            return Ok(TypeExpr {
                kind: TypeExprKind::Ref {
                    mutable: true,
                    inner: Box::new(inner),
                },
                span: start,
            });
        }
        if matches!(self.peek_kind(), TokenKind::Ref) {
            self.bump();
            let inner = self.parse_type()?;
            return Ok(TypeExpr {
                kind: TypeExprKind::Ref {
                    mutable: false,
                    inner: Box::new(inner),
                },
                span: start,
            });
        }
        let (name, span) = self.expect_ident()?;
        let mut ty = TypeExpr {
            kind: TypeExprKind::Named(name),
            span,
        };
        // Optional fixed array suffix: T[N]
        if matches!(self.peek_kind(), TokenKind::LBracket) {
            self.bump();
            let len_tok = self.bump();
            let len = match len_tok.kind {
                TokenKind::Int(n) if n >= 0 && n <= i64::from(u32::MAX) => n as u32,
                _ => {
                    return Err(ParseError::Unexpected {
                        line: len_tok.span.line,
                        col: len_tok.span.col,
                        expected: "array length integer".into(),
                    });
                }
            };
            let end = self.expect(TokenKind::RBracket, "`]`")?.span;
            ty = TypeExpr {
                kind: TypeExprKind::Array {
                    elem: Box::new(ty),
                    len,
                },
                span: start.merge(end),
            };
        }
        Ok(ty)
    }

    fn parse_expr(&mut self) -> Result<Expr, ParseError> {
        self.parse_or()
    }

    fn parse_or(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_and()?;
        while matches!(self.peek_kind(), TokenKind::Or) {
            self.bump();
            let right = self.parse_and()?;
            let span = left.span.merge(right.span);
            left = Expr {
                kind: ExprKind::Binary {
                    op: BinaryOp::Or,
                    left: Box::new(left),
                    right: Box::new(right),
                },
                span,
            };
        }
        Ok(left)
    }

    fn parse_and(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_cmp()?;
        while matches!(self.peek_kind(), TokenKind::And) {
            self.bump();
            let right = self.parse_cmp()?;
            let span = left.span.merge(right.span);
            left = Expr {
                kind: ExprKind::Binary {
                    op: BinaryOp::And,
                    left: Box::new(left),
                    right: Box::new(right),
                },
                span,
            };
        }
        Ok(left)
    }

    fn parse_cmp(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_add()?;
        loop {
            let op = match self.peek_kind() {
                TokenKind::Eq => BinaryOp::Eq,
                TokenKind::Ne => BinaryOp::Ne,
                TokenKind::Lt => BinaryOp::Lt,
                TokenKind::Le => BinaryOp::Le,
                TokenKind::Gt => BinaryOp::Gt,
                TokenKind::Ge => BinaryOp::Ge,
                _ => break,
            };
            self.bump();
            let right = self.parse_add()?;
            let span = left.span.merge(right.span);
            left = Expr {
                kind: ExprKind::Binary {
                    op,
                    left: Box::new(left),
                    right: Box::new(right),
                },
                span,
            };
        }
        Ok(left)
    }

    fn parse_add(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_mul()?;
        loop {
            let op = match self.peek_kind() {
                TokenKind::Plus => BinaryOp::Add,
                TokenKind::Minus => BinaryOp::Sub,
                _ => break,
            };
            self.bump();
            let right = self.parse_mul()?;
            let span = left.span.merge(right.span);
            left = Expr {
                kind: ExprKind::Binary {
                    op,
                    left: Box::new(left),
                    right: Box::new(right),
                },
                span,
            };
        }
        Ok(left)
    }

    fn parse_mul(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_unary()?;
        loop {
            let op = match self.peek_kind() {
                TokenKind::Star => BinaryOp::Mul,
                TokenKind::Slash => BinaryOp::Div,
                TokenKind::Percent => BinaryOp::Rem,
                _ => break,
            };
            self.bump();
            let right = self.parse_unary()?;
            let span = left.span.merge(right.span);
            left = Expr {
                kind: ExprKind::Binary {
                    op,
                    left: Box::new(left),
                    right: Box::new(right),
                },
                span,
            };
        }
        Ok(left)
    }

    fn parse_unary(&mut self) -> Result<Expr, ParseError> {
        match self.peek_kind() {
            TokenKind::Minus => {
                let start = self.bump().span;
                let expr = self.parse_unary()?;
                Ok(Expr {
                    kind: ExprKind::Unary {
                        op: UnaryOp::Neg,
                        expr: Box::new(expr),
                    },
                    span: start,
                })
            }
            TokenKind::Not => {
                let start = self.bump().span;
                let expr = self.parse_unary()?;
                Ok(Expr {
                    kind: ExprKind::Unary {
                        op: UnaryOp::Not,
                        expr: Box::new(expr),
                    },
                    span: start,
                })
            }
            _ => self.parse_postfix(),
        }
    }

    fn parse_postfix(&mut self) -> Result<Expr, ParseError> {
        let mut expr = self.parse_primary()?;
        loop {
            match self.peek_kind() {
                TokenKind::LParen => {
                    self.bump();
                    let mut args = Vec::new();
                    if !matches!(self.peek_kind(), TokenKind::RParen) {
                        loop {
                            args.push(self.parse_expr()?);
                            if matches!(self.peek_kind(), TokenKind::Comma) {
                                self.bump();
                                continue;
                            }
                            break;
                        }
                    }
                    let end = self.expect(TokenKind::RParen, "`)`")?.span;
                    let span = expr.span.merge(end);
                    expr = Expr {
                        kind: ExprKind::Call {
                            callee: Box::new(expr),
                            args,
                        },
                        span,
                    };
                }
                TokenKind::Dot => {
                    self.bump();
                    let (field, fspan) = self.expect_ident()?;
                    let span = expr.span.merge(fspan);
                    expr = Expr {
                        kind: ExprKind::Field {
                            base: Box::new(expr),
                            field,
                        },
                        span,
                    };
                }
                TokenKind::LBracket => {
                    self.bump();
                    let index = self.parse_expr()?;
                    let end = self.expect(TokenKind::RBracket, "`]`")?.span;
                    let span = expr.span.merge(end);
                    expr = Expr {
                        kind: ExprKind::Index {
                            base: Box::new(expr),
                            index: Box::new(index),
                        },
                        span,
                    };
                }
                _ => break,
            }
        }
        Ok(expr)
    }

    fn parse_primary(&mut self) -> Result<Expr, ParseError> {
        let t = self.peek().clone();
        match &t.kind {
            TokenKind::Int(v) => {
                self.bump();
                Ok(Expr {
                    kind: ExprKind::Int(*v),
                    span: t.span,
                })
            }
            TokenKind::Float(v) => {
                self.bump();
                Ok(Expr {
                    kind: ExprKind::Float(*v),
                    span: t.span,
                })
            }
            TokenKind::True => {
                self.bump();
                Ok(Expr {
                    kind: ExprKind::Bool(true),
                    span: t.span,
                })
            }
            TokenKind::False => {
                self.bump();
                Ok(Expr {
                    kind: ExprKind::Bool(false),
                    span: t.span,
                })
            }
            TokenKind::Str(s) => {
                let s = s.clone();
                self.bump();
                Ok(Expr {
                    kind: ExprKind::Str(s),
                    span: t.span,
                })
            }
            TokenKind::New => {
                let start = self.bump().span;
                let ty = self.parse_type()?;
                self.expect(TokenKind::LParen, "`(`")?;
                let args = self.parse_named_args()?;
                let end = self.expect(TokenKind::RParen, "`)`")?.span;
                Ok(Expr {
                    kind: ExprKind::New { ty, args },
                    span: start.merge(end),
                })
            }
            TokenKind::Ident(name) => {
                let name = name.clone();
                let start = self.bump().span;
                // Struct literal: Name(field=expr, ...)
                if matches!(self.peek_kind(), TokenKind::LParen) {
                    // Could be call or struct lit — look for named args (ident =)
                    let save = self.pos;
                    self.bump(); // (
                    let is_named = matches!(self.peek_kind(), TokenKind::Ident(_))
                        && {
                            let p = self.pos;
                            let _ = self.bump();
                            let eq = matches!(self.peek_kind(), TokenKind::Assign);
                            self.pos = p;
                            eq
                        };
                    if is_named {
                        let fields = self.parse_named_args()?;
                        let end = self.expect(TokenKind::RParen, "`)`")?.span;
                        return Ok(Expr {
                            kind: ExprKind::StructLit { name, fields },
                            span: start.merge(end),
                        });
                    }
                    self.pos = save;
                }
                Ok(Expr {
                    kind: ExprKind::Ident(name),
                    span: start,
                })
            }
            TokenKind::LParen => {
                self.bump();
                let expr = self.parse_expr()?;
                self.expect(TokenKind::RParen, "`)`")?;
                Ok(expr)
            }
            TokenKind::LBracket => {
                let start = self.bump().span;
                let mut elems = Vec::new();
                if !matches!(self.peek_kind(), TokenKind::RBracket) {
                    loop {
                        elems.push(self.parse_expr()?);
                        if matches!(self.peek_kind(), TokenKind::Comma) {
                            self.bump();
                            continue;
                        }
                        break;
                    }
                }
                let end = self.expect(TokenKind::RBracket, "`]`")?.span;
                Ok(Expr {
                    kind: ExprKind::ArrayLit { elems },
                    span: start.merge(end),
                })
            }
            _ => Err(ParseError::Unexpected {
                line: t.span.line,
                col: t.span.col,
                expected: "expression".into(),
            }),
        }
    }

    fn parse_named_args(&mut self) -> Result<Vec<(String, Expr)>, ParseError> {
        let mut fields = Vec::new();
        if matches!(self.peek_kind(), TokenKind::RParen) {
            return Ok(fields);
        }
        loop {
            let (fname, _) = self.expect_ident()?;
            self.expect(TokenKind::Assign, "`=`")?;
            let val = self.parse_expr()?;
            fields.push((fname, val));
            if matches!(self.peek_kind(), TokenKind::Comma) {
                self.bump();
                continue;
            }
            break;
        }
        Ok(fields)
    }
}

fn item_span(item: &Item) -> Span {
    match item {
        Item::Struct(s) => s.span,
        Item::Fn(f) => f.span,
        Item::Global(g) => g.span,
        Item::State(s) => s.span,
        Item::Import(i) => i.span,
        Item::Export(e) => e.span,
    }
}

fn export_item_from_item(item: Item) -> ExportItem {
    match item {
        Item::Struct(s) => ExportItem::Struct(s),
        Item::Fn(f) => ExportItem::Fn(f),
        Item::Global(g) => ExportItem::Global(g),
        Item::State(s) => ExportItem::State(s),
        Item::Import(_) | Item::Export(_) => {
            unreachable!("import/export items cannot be re-exported here")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_hello() {
        let src = "fn main() -> i32:\n    return 0\n";
        let m = parse(src).unwrap();
        assert_eq!(m.items.len(), 1);
        match &m.items[0] {
            Item::Fn(f) => {
                assert_eq!(f.name, "main");
                assert_eq!(f.body.stmts.len(), 1);
            }
            _ => panic!("expected fn"),
        }
    }

    #[test]
    fn parse_struct_and_fn() {
        let src = r#"
struct Vec2:
    x: f32
    y: f32

fn main() -> i32:
    let p = Vec2(x=3.0, y=4.0)
    return 0
"#;
        let m = parse(src).unwrap();
        assert_eq!(m.items.len(), 2);
    }

    #[test]
    fn parse_import_module() {
        let src = "import math\n\nfn main() -> i32:\n    return 0\n";
        let m = parse(src).unwrap();
        assert_eq!(m.items.len(), 2);
        match &m.items[0] {
            Item::Import(ImportDecl {
                kind: ImportKind::Module { name, alias },
                ..
            }) => {
                assert_eq!(name, "math");
                assert!(alias.is_none());
            }
            _ => panic!("expected import math"),
        }
    }

    #[test]
    fn parse_import_module_alias() {
        let src = "import math as m\n";
        let m = parse(src).unwrap();
        match &m.items[0] {
            Item::Import(ImportDecl {
                kind: ImportKind::Module { name, alias },
                ..
            }) => {
                assert_eq!(name, "math");
                assert_eq!(alias.as_deref(), Some("m"));
            }
            _ => panic!("expected import math as m"),
        }
    }

    #[test]
    fn parse_import_from() {
        let src = "from math import clamp, Vec2\n";
        let m = parse(src).unwrap();
        match &m.items[0] {
            Item::Import(ImportDecl {
                kind: ImportKind::From { module, names },
                ..
            }) => {
                assert_eq!(module, "math");
                assert_eq!(names.len(), 2);
                assert_eq!(names[0].name, "clamp");
                assert!(names[0].alias.is_none());
                assert_eq!(names[1].name, "Vec2");
                assert!(names[1].alias.is_none());
            }
            _ => panic!("expected from math import"),
        }
    }

    #[test]
    fn parse_import_from_alias() {
        let src = "from utils import clamp as clamp_f32\n";
        let m = parse(src).unwrap();
        match &m.items[0] {
            Item::Import(ImportDecl {
                kind: ImportKind::From { module, names },
                ..
            }) => {
                assert_eq!(module, "utils");
                assert_eq!(names.len(), 1);
                assert_eq!(names[0].name, "clamp");
                assert_eq!(names[0].alias.as_deref(), Some("clamp_f32"));
            }
            _ => panic!("expected from utils import clamp as clamp_f32"),
        }
    }

    #[test]
    fn parse_export_fn() {
        let src = "export fn clamp(x: f32, lo: f32, hi: f32) -> f32:\n    return x\n";
        let m = parse(src).unwrap();
        match &m.items[0] {
            Item::Export(ExportDecl {
                item: ExportItem::Fn(f),
                ..
            }) => {
                assert_eq!(f.name, "clamp");
                assert_eq!(f.params.len(), 3);
            }
            _ => panic!("expected export fn"),
        }
    }

    #[test]
    fn parse_export_struct() {
        let src = "export struct Vec2:\n    x: f32\n    y: f32\n";
        let m = parse(src).unwrap();
        match &m.items[0] {
            Item::Export(ExportDecl {
                item: ExportItem::Struct(s),
                ..
            }) => {
                assert_eq!(s.name, "Vec2");
                assert_eq!(s.fields.len(), 2);
            }
            _ => panic!("expected export struct"),
        }
    }

    #[test]
    fn parse_export_let() {
        let src = "export let PI: f32 = 3.14159\n";
        let m = parse(src).unwrap();
        match &m.items[0] {
            Item::Export(ExportDecl {
                item: ExportItem::Global(g),
                ..
            }) => {
                assert_eq!(g.name, "PI");
                assert!(matches!(g.init.kind, ExprKind::Float(_)));
            }
            _ => panic!("expected export let"),
        }
    }

    #[test]
    fn parse_module_with_imports_and_exports() {
        let src = r#"
import math
from utils import clamp as clamp_f32

export fn main() -> i32:
    return 0
"#;
        let m = parse(src).unwrap();
        assert_eq!(m.items.len(), 3);
        assert!(matches!(&m.items[0], Item::Import(_)));
        assert!(matches!(&m.items[1], Item::Import(_)));
        assert!(matches!(&m.items[2], Item::Export(_)));
    }

    #[test]
    fn parse_non_exported_still_works() {
        let src = r#"
struct Point:
    x: f32
    y: f32

fn main() -> i32:
    return 0
"#;
        let m = parse(src).unwrap();
        assert_eq!(m.items.len(), 2);
        assert!(matches!(&m.items[0], Item::Struct(_)));
        assert!(matches!(&m.items[1], Item::Fn(_)));
    }

    #[test]
    fn parse_array_literal_in_call() {
        let src = r#"fn main() -> i32:
    mesh3d_custom([0.0, 1.0, 0.0], 1, [0], 1)
    return 0
"#;
        parse(src).unwrap();
    }

    #[test]
    fn parse_generic_fn() {
        let src = "fn min[T: Ord](a: T, b: T) -> T:\n    return a\n";
        let m = parse(src).unwrap();
        match &m.items[0] {
            Item::Fn(f) => {
                assert_eq!(f.name, "min");
                assert_eq!(f.type_params.len(), 1);
                assert_eq!(f.type_params[0].name, "T");
                assert_eq!(f.type_params[0].constraint.as_deref(), Some("Ord"));
            }
            _ => panic!("expected fn"),
        }
    }
}
