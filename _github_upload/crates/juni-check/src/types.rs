//! Type system for Juni.

use std::collections::HashMap;
use std::fmt;

#[derive(Debug, Clone)]
pub struct FieldLayout {
    pub name: String,
    pub ty: Type,
    pub offset: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Builtin {
    I32,
    I64,
    F32,
    F64,
    Bool,
    Void,
    Str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Type {
    Builtin(Builtin),
    Struct(String),
    Array { elem: Box<Type>, len: u32 },
    Ref { mutable: bool, inner: Box<Type> },
}

impl Type {
    pub fn is_numeric(&self) -> bool {
        matches!(
            self,
            Type::Builtin(Builtin::I32 | Builtin::I64 | Builtin::F32 | Builtin::F64)
        )
    }

    pub fn is_float(&self) -> bool {
        matches!(self, Type::Builtin(Builtin::F32 | Builtin::F64))
    }

    pub fn is_int(&self) -> bool {
        matches!(
            self,
            Type::Builtin(Builtin::I32 | Builtin::I64 | Builtin::Bool)
        )
    }

    pub fn size(&self, structs: &HashMap<String, StructLayout>) -> u32 {
        match self {
            Type::Builtin(Builtin::I32 | Builtin::F32 | Builtin::Bool | Builtin::Str) => 4,
            Type::Builtin(Builtin::I64 | Builtin::F64) => 8,
            Type::Builtin(Builtin::Void) => 0,
            Type::Ref { .. } => 4,
            Type::Array { elem, len } => elem.size(structs).saturating_mul(*len),
            Type::Struct(name) => structs.get(name).map(|s| s.size).unwrap_or(4),
        }
    }

    pub fn align(&self) -> u32 {
        match self {
            Type::Builtin(Builtin::I64 | Builtin::F64) => 8,
            Type::Builtin(Builtin::Void) => 1,
            Type::Array { elem, .. } => elem.align(),
            _ => 4,
        }
    }

    pub fn elem_size(&self, structs: &HashMap<String, StructLayout>) -> u32 {
        match self {
            Type::Array { elem, .. } => elem.size(structs),
            _ => 4,
        }
    }

    /// WASM representation: structs, refs, and arrays are i32 pointers.
    pub fn wasm_is_i32_ptr(&self) -> bool {
        matches!(
            self,
            Type::Struct(_) | Type::Ref { .. } | Type::Array { .. }
        )
    }
}

impl fmt::Display for Type {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Type::Builtin(Builtin::I32) => write!(f, "i32"),
            Type::Builtin(Builtin::I64) => write!(f, "i64"),
            Type::Builtin(Builtin::F32) => write!(f, "f32"),
            Type::Builtin(Builtin::F64) => write!(f, "f64"),
            Type::Builtin(Builtin::Bool) => write!(f, "bool"),
            Type::Builtin(Builtin::Void) => write!(f, "void"),
            Type::Builtin(Builtin::Str) => write!(f, "str"),
            Type::Struct(n) => write!(f, "{n}"),
            Type::Array { elem, len } => write!(f, "{elem}[{len}]"),
            Type::Ref {
                mutable: true,
                inner,
            } => write!(f, "mut ref {inner}"),
            Type::Ref {
                mutable: false,
                inner,
            } => write!(f, "ref {inner}"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct StructLayout {
    pub name: String,
    pub fields: Vec<FieldLayout>,
    pub size: u32,
}
