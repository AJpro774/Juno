//! Juni compiler CLI.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand};
use juni_check::diag::Severity;
use juni_check::{check, check_ok, check_program, ProgramModule};
use juni_codegen::{emit_wasm, emit_wasm_program};
use juni_driver::{build_asset_pack, load_project, DriverError, Project};
use juni_lsp::run_stdio_server;
use juni_syntax::parse;

#[derive(Parser, Debug)]
#[command(name = "juni", version, about = "Juni compiler — Python-feel, C++ power, WASM target")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Typecheck a .juni file or project (reads juni.toml in cwd when no file given)
    Check {
        /// Single .juni source file
        file: Option<PathBuf>,
        /// Project root directory (contains juni.toml)
        #[arg(long)]
        project: Option<PathBuf>,
    },
    /// Compile a .juni file or project to WebAssembly
    Build {
        /// Single .juni source file
        file: Option<PathBuf>,
        /// Project root directory (contains juni.toml)
        #[arg(long)]
        project: Option<PathBuf>,
        /// Output .wasm path
        #[arg(short, long)]
        output: Option<PathBuf>,
    },
    /// Run the Juni language server (stdio)
    Lsp,
    /// Export a project as a static web folder (index.html + wasm + runtime)
    ExportWeb {
        /// Project root directory (contains juni.toml)
        #[arg(long)]
        project: Option<PathBuf>,
        /// Output directory (default: dist/web)
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
        Commands::Check { file, project } => check_cmd(file, project),
        Commands::Build { file, project, output } => build_cmd(file, project, output),
        Commands::ExportWeb { project, output } => export_web_cmd(project, output),
        Commands::Lsp => {
            run_stdio_server();
            Ok(())
        }
    }
}

fn check_cmd(file: Option<PathBuf>, project: Option<PathBuf>) -> Result<()> {
    match resolve_target(file, project)? {
        Target::Single(path) => check_single_file(&path),
        Target::Project(root) => check_project_dir(&root),
    }
}

fn build_cmd(
    file: Option<PathBuf>,
    project: Option<PathBuf>,
    output: Option<PathBuf>,
) -> Result<()> {
    match resolve_target(file, project)? {
        Target::Single(path) => build_single_file(&path, output),
        Target::Project(root) => build_project_dir(&root, output),
    }
}

enum Target {
    Single(PathBuf),
    Project(PathBuf),
}

fn resolve_target(file: Option<PathBuf>, project: Option<PathBuf>) -> Result<Target> {
    match (file, project) {
        (Some(f), None) => Ok(Target::Single(f)),
        (None, Some(root)) => Ok(Target::Project(root)),
        (None, None) => Ok(Target::Project(env::current_dir().context("current directory")?)),
        (Some(_), Some(_)) => bail!("pass either a file path or --project, not both"),
    }
}

fn check_single_file(file: &Path) -> Result<()> {
    let src = fs::read_to_string(file).with_context(|| format!("reading {}", file.display()))?;
    let filename = file.display().to_string();
    let module = parse(&src).map_err(|e| anyhow::anyhow!("parse error: {e}"))?;
    let result = check(&module);
    print_diagnostics(&result.diagnostics, &filename);
    if result.diagnostics.iter().any(|d| d.severity == Severity::Error) {
        bail!("typecheck failed");
    }
    println!("ok: {}", file.display());
    Ok(())
}

fn build_single_file(file: &Path, output: Option<PathBuf>) -> Result<()> {
    let src = fs::read_to_string(file).with_context(|| format!("reading {}", file.display()))?;
    let filename = file.display().to_string();
    let module = parse(&src).map_err(|e| anyhow::anyhow!("parse error: {e}"))?;
    let hir = match check_ok(&module) {
        Ok(h) => h,
        Err(diags) => {
            print_diagnostics(&diags, &filename);
            bail!("typecheck failed");
        }
    };
    let wasm = emit_wasm(&hir);
    let out = output.unwrap_or_else(|| file.with_extension("wasm"));
    fs::write(&out, &wasm).with_context(|| format!("writing {}", out.display()))?;
    println!("wrote {} ({} bytes)", out.display(), wasm.len());
    Ok(())
}

fn check_project_dir(root: &Path) -> Result<()> {
    let project = load_project(root).map_err(driver_err)?;
    if let Some(err) = project_parse_errors(&project) {
        return Err(err);
    }
    let result = check_loaded_project(&project);
    print_project_diagnostics(&project, &result.diagnostics);
    if result.diagnostics.iter().any(|d| d.severity == Severity::Error) {
        bail!("typecheck failed");
    }
    println!("ok: project {} ({})", project.config.name, root.display());
    Ok(())
}

fn build_project_dir(root: &Path, output: Option<PathBuf>) -> Result<()> {
    let project = load_project(root).map_err(driver_err)?;
    if let Some(err) = project_parse_errors(&project) {
        return Err(err);
    }
    let result = check_loaded_project(&project);
    print_project_diagnostics(&project, &result.diagnostics);
    if result.diagnostics.iter().any(|d| d.severity == Severity::Error) {
        bail!("typecheck failed");
    }
    let wasm = emit_wasm_program(&result.program);
    let out = output.unwrap_or_else(|| {
        root.join(format!("{}.wasm", project.config.name))
    });
    fs::write(&out, &wasm).with_context(|| format!("writing {}", out.display()))?;
    println!("wrote {} ({} bytes)", out.display(), wasm.len());

    let (pack, pack_path) = build_asset_pack(root, &project.config.assets)
        .map_err(|e| anyhow::anyhow!("asset pack: {e}"))?;
    println!(
        "wrote {} ({} assets)",
        pack_path.display(),
        pack.assets.len()
    );
    Ok(())
}

fn export_web_cmd(project: Option<PathBuf>, output: Option<PathBuf>) -> Result<()> {
    let root = match project {
        Some(p) => p,
        None => env::current_dir().context("current directory")?,
    };
    let out_dir = output.unwrap_or_else(|| root.join("dist/web"));
    fs::create_dir_all(&out_dir).with_context(|| format!("creating {}", out_dir.display()))?;

    let project = load_project(&root).map_err(driver_err)?;
    if let Some(err) = project_parse_errors(&project) {
        return Err(err);
    }
    let result = check_loaded_project(&project);
    print_project_diagnostics(&project, &result.diagnostics);
    if result.diagnostics.iter().any(|d| d.severity == Severity::Error) {
        bail!("typecheck failed");
    }
    let wasm = emit_wasm_program(&result.program);
    let wasm_path = out_dir.join("game.wasm");
    fs::write(&wasm_path, &wasm).with_context(|| format!("writing {}", wasm_path.display()))?;

    let (pack, _) = build_asset_pack(&root, &project.config.assets)
        .map_err(|e| anyhow::anyhow!("asset pack: {e}"))?;
    let pack_json = serde_json::to_string_pretty(&pack).unwrap_or_else(|_| "{}".into());
    fs::write(out_dir.join("assets.pack.json"), pack_json)?;

    let title = &project.config.name;
    let index = format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <style>
    html, body {{ margin: 0; height: 100%; background: #0e0f12; color: #e8e1d4; font-family: system-ui, sans-serif; }}
    #wrap {{ display: grid; place-items: center; min-height: 100%; padding: 1rem; }}
    canvas {{ max-width: 100%; background: #000; }}
    #log {{ max-width: 40rem; margin: 1rem auto; font: 12px/1.4 ui-monospace, monospace; white-space: pre-wrap; opacity: .7; }}
  </style>
</head>
<body>
  <div id="wrap">
    <canvas id="c2d" width="640" height="360"></canvas>
    <canvas id="cgpu" width="640" height="360" hidden></canvas>
  </div>
  <pre id="log"></pre>
  <script type="module" src="./play.js"></script>
</body>
</html>
"#
    );
    fs::write(out_dir.join("index.html"), index)?;

    let play = r#"import { instantiateJuni, startFrameLoop } from "./runtime/browser.js";
const logEl = document.getElementById("log");
const log = (t) => { if (logEl) logEl.textContent += t + "\n"; };
const wasm = await (await fetch("./game.wasm")).arrayBuffer();
const assets = await (await fetch("./assets.pack.json")).json();
const canvas2d = document.getElementById("c2d");
const canvasGpu = document.getElementById("cgpu");
const opts = {
  onPrint: log,
  canvasEl: canvas2d,
  gpuCanvasEl: canvasGpu,
  mode: "canvas2d",
  assetPack: assets,
  getAssetText: (path) => {
    const a = assets?.assets?.[path];
    if (!a?.embed) return null;
    try { return atob(a.embed); } catch { return null; }
  },
};
const instance = await instantiateJuni(new Uint8Array(wasm), opts);
const exports = instance.exports;
if (typeof exports.main === "function") log("main() => " + exports.main());
startFrameLoop(instance, opts);
log("Running.");
"#;
    fs::write(out_dir.join("play.js"), play)?;

    // Copy runtime/dist → out_dir/runtime
    let runtime_src = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../runtime/dist");
    let runtime_dst = out_dir.join("runtime");
    copy_dir_recursive(&runtime_src, &runtime_dst)?;

    let netlify = r#"[build]
  publish = "."
  command = "echo static"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
"#;
    fs::write(out_dir.join("netlify.toml"), netlify)?;

    println!("exported web build → {}", out_dir.display());
    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    if !src.is_dir() {
        bail!(
            "runtime dist missing at {} — run `cd runtime && npm run build`",
            src.display()
        );
    }
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &to)?;
        } else {
            fs::copy(entry.path(), &to)?;
        }
    }
    Ok(())
}

fn check_loaded_project(project: &Project) -> juni_check::ProgramCheckResult {
    let modules = program_modules_from_project(project);
    check_program(&modules, &project.entry)
}

fn program_modules_from_project(project: &Project) -> Vec<ProgramModule> {
    project
        .modules
        .iter()
        .filter_map(|m| {
            let ast = m.ast.clone()?;
            Some(ProgramModule {
                name: m.name.clone(),
                file: Some(m.path.display().to_string()),
                module: ast,
            })
        })
        .collect()
}

fn print_diagnostics(diags: &[juni_check::Diagnostic], fallback_file: &str) {
    for d in diags {
        eprintln!("{}", d.format(fallback_file));
    }
}

fn print_project_diagnostics(project: &Project, diags: &[juni_check::Diagnostic]) {
    for d in diags {
        let fallback = project
            .root
            .join(d.file.as_deref().unwrap_or("unknown"))
            .display()
            .to_string();
        eprintln!("{}", d.format(&fallback));
    }
}

fn project_parse_errors(project: &Project) -> Option<anyhow::Error> {
    let mut failed = false;
    for m in &project.modules {
        if let Some(err) = &m.parse_error {
            eprintln!("{}: parse error: {err}", m.path.display());
            failed = true;
        }
    }
    if failed {
        Some(anyhow::anyhow!("parse failed"))
    } else {
        None
    }
}

fn driver_err(err: DriverError) -> anyhow::Error {
    anyhow::Error::from(err)
}
