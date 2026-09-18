//! In-process compilation for embedders (game engines, editors, MCP tools).
//!
//! A host typically ships one or more **prelude** modules — Juni source that
//! declares its `extern` imports and helper functions — and compiles a single
//! user file against them. Every export of a prelude is visible unqualified in
//! the user file, so a script can call `set_pos(...)` without importing.
//!
//! ```no_run
//! use juni_driver::{compile_single_with_prelude, PreludeSource};
//!
//! let prelude = PreludeSource {
//!     name: "kerabit",
//!     source: "export extern \"kerabit\":\n    fn quit()\n",
//! };
//! let out = compile_single_with_prelude("main", Some("game.juni"),
//!     "fn main() -> i32:\n    quit()\n    return 0\n", &[prelude]).unwrap();
//! assert_eq!(out.externs[0].name, "quit");
//! ```

use juni_check::diag::{Diagnostic, Severity};
use juni_check::{check_program_with_preludes, HirExtern, ProgramModule};
use juni_codegen::emit_program;
use juni_syntax::parse;

/// A host-provided module compiled before the user's file.
#[derive(Debug, Clone, Copy)]
pub struct PreludeSource<'a> {
    /// Logical module name (also usable via `import <name>`).
    pub name: &'a str,
    pub source: &'a str,
}

/// Successful compile: wasm bytes plus the import contract.
#[derive(Debug, Clone)]
pub struct CompileOutput {
    pub wasm: Vec<u8>,
    /// `env` builtins the module imports, in import order.
    pub builtins: Vec<&'static str>,
    /// `extern` host imports, in import order (after `builtins`).
    pub externs: Vec<HirExtern>,
    /// Non-error diagnostics (warnings).
    pub warnings: Vec<Diagnostic>,
}

/// Parse preludes + `source` into checkable modules. Parse failures become
/// positioned diagnostics tagged with the module's file name.
fn parse_modules(
    entry_name: &str,
    entry_file: Option<&str>,
    source: &str,
    preludes: &[PreludeSource<'_>],
) -> Result<Vec<ProgramModule>, Vec<Diagnostic>> {
    let mut modules = Vec::with_capacity(preludes.len() + 1);
    let mut errors = Vec::new();
    for p in preludes {
        match parse(p.source) {
            Ok(module) => modules.push(ProgramModule {
                name: p.name.to_string(),
                file: Some(format!("<prelude {}>", p.name)),
                module,
            }),
            Err(e) => errors.push(Diagnostic::from_parse_error(
                &e,
                Some(format!("<prelude {}>", p.name)),
            )),
        }
    }
    match parse(source) {
        Ok(module) => modules.push(ProgramModule {
            name: entry_name.to_string(),
            file: entry_file.map(str::to_string),
            module,
        }),
        Err(e) => errors.push(Diagnostic::from_parse_error(
            &e,
            entry_file.map(str::to_string),
        )),
    }
    if errors.is_empty() {
        Ok(modules)
    } else {
        Err(errors)
    }
}

fn split_errors(diags: Vec<Diagnostic>) -> Result<Vec<Diagnostic>, Vec<Diagnostic>> {
    if diags.iter().any(|d| d.severity == Severity::Error) {
        Err(diags)
    } else {
        Ok(diags)
    }
}

/// Type-check `source` against `preludes` without emitting code.
/// `Ok` carries warnings; `Err` carries every diagnostic (errors + warnings).
pub fn check_single_with_prelude(
    entry_name: &str,
    entry_file: Option<&str>,
    source: &str,
    preludes: &[PreludeSource<'_>],
) -> Result<Vec<Diagnostic>, Vec<Diagnostic>> {
    let modules = parse_modules(entry_name, entry_file, source, preludes)?;
    let prelude_names: Vec<&str> = preludes.iter().map(|p| p.name).collect();
    let result = check_program_with_preludes(&modules, entry_name, &prelude_names);
    split_errors(result.diagnostics)
}

/// Compile a single Juni file against host preludes into one WASM module.
///
/// `entry_name` is the logical module name for the user file (`"main"` is
/// conventional); `entry_file` is only used to label diagnostics.
pub fn compile_single_with_prelude(
    entry_name: &str,
    entry_file: Option<&str>,
    source: &str,
    preludes: &[PreludeSource<'_>],
) -> Result<CompileOutput, Vec<Diagnostic>> {
    let modules = parse_modules(entry_name, entry_file, source, preludes)?;
    let prelude_names: Vec<&str> = preludes.iter().map(|p| p.name).collect();
    let result = check_program_with_preludes(&modules, entry_name, &prelude_names);
    let warnings = split_errors(result.diagnostics)?;
    let emitted = emit_program(&result.program);
    Ok(CompileOutput {
        wasm: emitted.wasm,
        builtins: emitted.builtins,
        externs: emitted.externs,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const PRELUDE: &str = r#"export extern "kerabit":
    fn entity(name: str) -> i32
    fn set_pos(e: i32, x: f32, y: f32, z: f32)
    fn key_down(name: str) -> bool
    fn quit()

export fn clamp01(x: f32) -> f32:
    return clamp(x, 0.0, 1.0)
"#;

    fn imports_of(wasm: &[u8]) -> Vec<(String, String)> {
        wasmparser::Validator::new()
            .validate_all(wasm)
            .expect("emitted wasm must validate");
        let mut out = Vec::new();
        for payload in wasmparser::Parser::new(0).parse_all(wasm) {
            if let wasmparser::Payload::ImportSection(reader) = payload.unwrap() {
                for imp in reader {
                    let imp = imp.unwrap();
                    out.push((imp.module.to_string(), imp.name.to_string()));
                }
            }
        }
        out
    }

    #[test]
    fn compiles_script_against_prelude() {
        let game = r#"state:
    player: i32 = 0

fn main() -> i32:
    player = entity("player")
    set_pos(player, 0.0, 0.5, 0.0)
    return 0

fn frame(dt: f32) -> i32:
    if key_down("Escape"):
        quit()
    set_pos(player, clamp01(dt), 0.5, 0.0)
    return 0
"#;
        let prelude = PreludeSource {
            name: "kerabit",
            source: PRELUDE,
        };
        let out = compile_single_with_prelude("main", Some("game.juni"), game, &[prelude])
            .expect("compile");
        assert!(out.warnings.is_empty());
        let imports = imports_of(&out.wasm);
        assert_eq!(
            imports,
            vec![
                ("env".to_string(), "clamp_f32".to_string()),
                ("kerabit".to_string(), "entity".to_string()),
                ("kerabit".to_string(), "set_pos".to_string()),
                ("kerabit".to_string(), "key_down".to_string()),
                ("kerabit".to_string(), "quit".to_string()),
            ]
        );
        assert_eq!(out.builtins, vec!["clamp_f32"]);
        let names: Vec<&str> = out.externs.iter().map(|x| x.name.as_str()).collect();
        assert_eq!(names, vec!["entity", "set_pos", "key_down", "quit"]);
    }

    #[test]
    fn user_errors_are_positioned_and_labelled() {
        let game = "fn main() -> i32:\n    set_pos(1, 2)\n    return 0\n";
        let prelude = PreludeSource {
            name: "kerabit",
            source: PRELUDE,
        };
        let errs = compile_single_with_prelude("main", Some("game.juni"), game, &[prelude])
            .expect_err("arity error");
        assert_eq!(errs.len(), 1);
        assert_eq!(errs[0].file.as_deref(), Some("game.juni"));
        assert_eq!(errs[0].span.line, 2);
        assert!(errs[0].message.contains("expects 4 args, got 2"));
    }

    #[test]
    fn parse_errors_become_diagnostics() {
        let game = "fn main() -> i32\n    return 0\n";
        let errs = check_single_with_prelude("main", Some("bad.juni"), game, &[])
            .expect_err("parse error");
        assert_eq!(errs[0].file.as_deref(), Some("bad.juni"));
        assert_eq!(errs[0].span.line, 1);
        assert!(errs[0].message.contains("expected"));
    }

    #[test]
    fn broken_prelude_is_reported_against_the_prelude() {
        let prelude = PreludeSource {
            name: "kerabit",
            source: "extern \"kerabit\"\n    fn quit()\n",
        };
        let errs = check_single_with_prelude("main", None, "fn main() -> i32:\n    return 0\n", &[prelude])
            .expect_err("prelude parse error");
        assert_eq!(errs[0].file.as_deref(), Some("<prelude kerabit>"));
    }

    #[test]
    fn check_only_reports_ok_for_valid_script() {
        let prelude = PreludeSource {
            name: "kerabit",
            source: PRELUDE,
        };
        let warnings = check_single_with_prelude(
            "main",
            None,
            "fn main() -> i32:\n    quit()\n    return 0\n",
            &[prelude],
        )
        .expect("ok");
        assert!(warnings.is_empty());
    }
}
