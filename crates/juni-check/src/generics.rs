//! Generic function monomorphization helpers.

use std::collections::HashMap;

use juni_syntax::ast::{FnDef, TypeExpr, TypeExprKind};

use crate::types::{Builtin, Type};

pub fn mangle_generic_instance(name: &str, types: &[Type]) -> String {
    let suffix: String = types
        .iter()
        .map(|t| match t {
            Type::Builtin(Builtin::I32) => "i32".into(),
            Type::Builtin(Builtin::F32) => "f32".into(),
            Type::Builtin(Builtin::Bool) => "bool".into(),
            Type::Builtin(Builtin::Str) => "str".into(),
            other => other.to_string().replace("::", "_"),
        })
        .collect::<Vec<_>>()
        .join("_");
    format!("{name}${suffix}")
}

pub fn substitute_type_expr(te: &TypeExpr, subst: &HashMap<String, Type>) -> TypeExpr {
    match &te.kind {
        TypeExprKind::Named(name) => {
            if let Some(concrete) = subst.get(name) {
                TypeExpr {
                    kind: type_to_expr_kind(concrete),
                    span: te.span,
                }
            } else {
                te.clone()
            }
        }
        TypeExprKind::Array { elem, len } => TypeExpr {
            kind: TypeExprKind::Array {
                elem: Box::new(substitute_type_expr(elem, subst)),
                len: *len,
            },
            span: te.span,
        },
        TypeExprKind::Ref { mutable, inner } => TypeExpr {
            kind: TypeExprKind::Ref {
                mutable: *mutable,
                inner: Box::new(substitute_type_expr(inner, subst)),
            },
            span: te.span,
        },
    }
}

fn type_to_expr_kind(ty: &Type) -> TypeExprKind {
    match ty {
        Type::Builtin(Builtin::I32) => TypeExprKind::Named("i32".into()),
        Type::Builtin(Builtin::F32) => TypeExprKind::Named("f32".into()),
        Type::Builtin(Builtin::Bool) => TypeExprKind::Named("bool".into()),
        Type::Builtin(Builtin::Str) => TypeExprKind::Named("str".into()),
        Type::Builtin(Builtin::Void) => TypeExprKind::Named("void".into()),
        Type::Builtin(Builtin::I64) => TypeExprKind::Named("i64".into()),
        Type::Builtin(Builtin::F64) => TypeExprKind::Named("f64".into()),
        Type::Struct(n) => TypeExprKind::Named(n.clone()),
        Type::Array { elem, len } => TypeExprKind::Array {
            elem: Box::new(TypeExpr {
                kind: type_to_expr_kind(elem),
                span: juni_syntax::Span::dummy(),
            }),
            len: *len,
        },
        Type::Ref { mutable, inner } => TypeExprKind::Ref {
            mutable: *mutable,
            inner: Box::new(TypeExpr {
                kind: type_to_expr_kind(inner),
                span: juni_syntax::Span::dummy(),
            }),
        },
        Type::TypeParam(n) => TypeExprKind::Named(n.clone()),
    }
}

pub fn instantiate_fn_def(template: &FnDef, subst: &HashMap<String, Type>, inst_name: String) -> FnDef {
    FnDef {
        name: inst_name,
        type_params: Vec::new(),
        params: template
            .params
            .iter()
            .map(|p| juni_syntax::Param {
                name: p.name.clone(),
                ty: substitute_type_expr(&p.ty, subst),
                span: p.span,
            })
            .collect(),
        ret: substitute_type_expr(&template.ret, subst),
        body: template.body.clone(),
        span: template.span,
    }
}

pub fn infer_substitution(
    template: &FnDef,
    arg_types: &[Type],
) -> Result<HashMap<String, Type>, String> {
    if template.type_params.len() != 1 {
        return Err("only single type parameter generics are supported in v5".into());
    }
    let tp_name = &template.type_params[0].name;
    if template.params.is_empty() {
        return Err(format!("generic `{tp_name}` has no parameters to infer from"));
    }
    let mut subst = HashMap::new();
    for (param, arg_ty) in template.params.iter().zip(arg_types.iter()) {
        let param_ty = resolve_type_expr_for_infer(&param.ty, &subst);
        unify_type_param(tp_name, &param_ty, arg_ty, &mut subst)?;
    }
    if let Some(t) = subst.get(tp_name) {
        if !t.is_ord() {
            return Err(format!("type `{t}` does not satisfy Ord"));
        }
    } else {
        return Err(format!("could not infer type parameter `{tp_name}`"));
    }
    Ok(subst)
}

fn resolve_type_expr_for_infer(te: &TypeExpr, subst: &HashMap<String, Type>) -> Type {
    match &te.kind {
        TypeExprKind::Named(name) => {
            if let Some(t) = subst.get(name) {
                return t.clone();
            }
            match name.as_str() {
                "i32" => Type::Builtin(Builtin::I32),
                "f32" => Type::Builtin(Builtin::F32),
                "bool" => Type::Builtin(Builtin::Bool),
                "str" => Type::Builtin(Builtin::Str),
                other => Type::TypeParam(other.to_string()),
            }
        }
        TypeExprKind::Array { elem, len } => Type::Array {
            elem: Box::new(resolve_type_expr_for_infer(elem, subst)),
            len: *len,
        },
        TypeExprKind::Ref { mutable, inner } => Type::Ref {
            mutable: *mutable,
            inner: Box::new(resolve_type_expr_for_infer(inner, subst)),
        },
    }
}

fn unify_type_param(
    tp: &str,
    expected: &Type,
    actual: &Type,
    subst: &mut HashMap<String, Type>,
) -> Result<(), String> {
    match expected {
        Type::TypeParam(name) if name == tp => {
            if let Some(existing) = subst.get(tp) {
                if existing != actual {
                    return Err(format!("conflicting types for `{tp}`"));
                }
            } else {
                subst.insert(tp.to_string(), actual.clone());
            }
            Ok(())
        }
        Type::Array { elem, len } => match actual {
            Type::Array {
                elem: a_elem,
                len: a_len,
            } if len == a_len => unify_type_param(tp, elem, a_elem, subst),
            _ => Err("array type mismatch".into()),
        },
        Type::Ref { mutable, inner } => match actual {
            Type::Ref {
                mutable: a_mut,
                inner: a_inner,
            } if mutable == a_mut => unify_type_param(tp, inner, a_inner, subst),
            _ => Err("ref type mismatch".into()),
        },
        other => {
            if other == actual {
                Ok(())
            } else {
                Err(format!("type mismatch: expected {other}, got {actual}"))
            }
        }
    }
}
