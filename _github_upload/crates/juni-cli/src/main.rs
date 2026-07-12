//! Juni compiler CLI.

use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand};
use juni_check::{check, check_ok};
use juni_codegen::emit_wasm;
use juni_syntax::parse;

#[derive(Parser, Debug)]
#[command(name = "juni", version, about = "Juni compiler — Python-feel, C++ power, WASM target")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Typecheck a .juni source file
    Check {
        /// Source file
        file: PathBuf,
    },
    /// Compile a .juni source file to WebAssembly
    Build {
        /// Source file
        file: PathBuf,
        /// Output .wasm path
        #[arg(short, long)]
        output: Option<PathBuf>,
    },
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e:#}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Check { file } => {
            let src = fs::read_to_string(&file)
                .with_context(|| format!("reading {}", file.display()))?;
            let filename = file.display().to_string();
            let module = parse(&src).map_err(|e| anyhow::anyhow!("parse error: {e}"))?;
            let result = check(&module);
            let mut has_error = false;
            for d in &result.diagnostics {
                eprintln!("{}", d.format(&filename));
                if d.severity == juni_check::diag::Severity::Error {
                    has_error = true;
                }
            }
            if has_error {
                bail!("typecheck failed");
            }
            println!("ok: {}", file.display());
            Ok(())
        }
        Commands::Build { file, output } => {
            let src = fs::read_to_string(&file)
                .with_context(|| format!("reading {}", file.display()))?;
            let filename = file.display().to_string();
            let module = parse(&src).map_err(|e| anyhow::anyhow!("parse error: {e}"))?;
            let hir = match check_ok(&module) {
                Ok(h) => h,
                Err(diags) => {
                    for d in &diags {
                        eprintln!("{}", d.format(&filename));
                    }
                    bail!("typecheck failed");
                }
            };
            let wasm = emit_wasm(&hir);
            let out = output.unwrap_or_else(|| file.with_extension("wasm"));
            fs::write(&out, &wasm).with_context(|| format!("writing {}", out.display()))?;
            println!("wrote {} ({} bytes)", out.display(), wasm.len());
            Ok(())
        }
    }
}
