//! Juni project driver: `juni.toml` parsing, source discovery, module graph.

pub mod assets;
pub mod discover;
pub mod imports;
pub mod manifest;
pub mod resolve;

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use juni_syntax::{parse, Module, ParseError};
use thiserror::Error;

pub use assets::{build_asset_pack, scan_assets, write_asset_pack, AssetEntry, AssetError, AssetPack};
pub use discover::{discover_sources, logical_name_for_path};
pub use imports::extract_imports;
pub use manifest::{load_manifest, AssetConfig, ManifestError, ProjectConfig, SceneConfig};
pub use resolve::{build_graph, resolve_module_path, ModuleNode, ResolveError};

#[derive(Debug, Error)]
pub enum DriverError {
    #[error(transparent)]
    Manifest(#[from] ManifestError),
    #[error(transparent)]
    Discover(#[from] discover::DiscoverError),
    #[error(transparent)]
    Resolve(#[from] ResolveError),
    #[error("failed to read {path}: {source}")]
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
}

/// A loaded Juni source file with parse result and resolved dependencies.
#[derive(Debug, Clone, PartialEq)]
pub struct SourceModule {
    /// Logical module name (file stem or `[modules]` override key).
    pub name: String,
    /// Path relative to project root.
    pub path: PathBuf,
    /// Raw source text.
    pub source: String,
    /// Parsed AST when syntax is valid (import syntax may fail until v5 lexer lands).
    pub ast: Option<Module>,
    /// Parse diagnostics when `ast` is `None`.
    pub parse_error: Option<ParseError>,
    /// Logical names of imported modules (topologically earlier).
    pub dependencies: Vec<String>,
}

/// Fully loaded Juni project ready for multi-module check/codegen.
#[derive(Debug, Clone, PartialEq)]
pub struct Project {
    pub root: PathBuf,
    pub config: ProjectConfig,
    /// Logical name of the entry module.
    pub entry: String,
    /// All project modules in topological (dependency) order.
    pub modules: Vec<SourceModule>,
}

/// Load a Juni project from `root` (directory containing `juni.toml`).
pub fn load_project(root: &Path) -> Result<Project, DriverError> {
    let root = root.canonicalize().map_err(|e| DriverError::Io {
        path: root.to_path_buf(),
        source: e,
    })?;

    let config = load_manifest(&root)?;

    let discovered = discover_sources(&root)?;
    let mut sources: Vec<(PathBuf, String)> = Vec::new();
    for path in &discovered {
        let text = std::fs::read_to_string(path).map_err(|e| DriverError::Io {
            path: path.clone(),
            source: e,
        })?;
        sources.push((path.clone(), text));
    }

    build_project(root, config, sources)
}

/// Build a project from in-memory sources (for IDE / wasm API).
///
/// `files` maps project-relative paths to source text. Must include `juni.toml`.
pub fn load_project_from_files(
    root: PathBuf,
    files: HashMap<String, String>,
) -> Result<Project, DriverError> {
    let config = parse_manifest_text(
        files
            .get("juni.toml")
            .ok_or_else(|| DriverError::Manifest(ManifestError::NotFound(root.join("juni.toml"))))?,
    )?;

    let mut sources: Vec<(PathBuf, String)> = Vec::new();
    for (rel, source) in files {
        if rel == "juni.toml" {
            continue;
        }
        if rel.ends_with(".juni") {
            sources.push((root.join(&rel), source));
        }
    }
    sources.sort_by(|a, b| a.0.cmp(&b.0));

    build_project(root, config, sources)
}

fn parse_manifest_text(text: &str) -> Result<ProjectConfig, ManifestError> {
    #[derive(serde::Deserialize)]
    struct JuniManifest {
        project: ProjectSection,
        #[serde(default)]
        modules: HashMap<String, String>,
        #[serde(default = "default_assets_section")]
        assets: AssetsSection,
        #[serde(default)]
        scene: SceneSection,
    }

    #[derive(serde::Deserialize, Default)]
    struct SceneSection {
        #[serde(default)]
        default: Option<String>,
    }

    #[derive(serde::Deserialize)]
    struct AssetsSection {
        #[serde(default = "default_asset_root")]
        root: String,
        #[serde(default = "default_include")]
        include: Vec<String>,
        #[serde(default = "default_embed_max")]
        embed_max_bytes: usize,
        #[serde(default = "default_pack")]
        pack: String,
    }

    fn default_assets_section() -> AssetsSection {
        AssetsSection {
            root: default_asset_root(),
            include: default_include(),
            embed_max_bytes: default_embed_max(),
            pack: default_pack(),
        }
    }

    fn default_asset_root() -> String {
        "assets".to_string()
    }

    fn default_include() -> Vec<String> {
        vec![
            "**/*.png".into(),
            "**/*.jpg".into(),
            "**/*.jpeg".into(),
            "**/*.wav".into(),
            "**/*.obj".into(),
            "**/*.jscene".into(),
            "**/*.gltf".into(),
            "**/*.json".into(),
        ]
    }

    fn default_embed_max() -> usize {
        65536
    }

    fn default_pack() -> String {
        "assets.pack.json".to_string()
    }

    #[derive(serde::Deserialize)]
    struct ProjectSection {
        #[serde(default = "default_name")]
        name: String,
        #[serde(default = "default_version")]
        version: String,
        entry: String,
    }

    fn default_name() -> String {
        "unnamed".to_string()
    }

    fn default_version() -> String {
        "0.1.0".to_string()
    }

    let raw: JuniManifest =
        toml::from_str(text).map_err(|e| ManifestError::Parse(e.to_string()))?;

    if raw.project.entry.trim().is_empty() {
        return Err(ManifestError::MissingEntry);
    }

    let module_overrides = raw
        .modules
        .into_iter()
        .map(|(name, path)| (name, PathBuf::from(path)))
        .collect();

    Ok(ProjectConfig {
        name: raw.project.name,
        version: raw.project.version,
        entry: PathBuf::from(raw.project.entry),
        module_overrides,
        assets: AssetConfig {
            root: PathBuf::from(raw.assets.root),
            include: raw.assets.include,
            embed_max_bytes: raw.assets.embed_max_bytes,
            pack: PathBuf::from(raw.assets.pack),
        },
        scene: SceneConfig {
            default: raw.scene.default.map(PathBuf::from),
        },
    })
}

fn build_project(
    root: PathBuf,
    config: ProjectConfig,
    sources: Vec<(PathBuf, String)>,
) -> Result<Project, DriverError> {
    let mut parsed: HashMap<PathBuf, Module> = HashMap::new();
    for (path, source) in &sources {
        if let Ok(module) = parse(source) {
            parsed.insert(path.clone(), module);
        }
    }

    let (nodes, entry) = build_graph(
        &root,
        &config.entry,
        &config.module_overrides,
        &sources,
        &parsed,
    )?;

    let modules: Vec<SourceModule> = nodes
        .into_iter()
        .map(|node| {
            let parse_result = parse(&node.source);
            SourceModule {
                name: node.name,
                path: node.path,
                source: node.source,
                ast: parse_result.as_ref().ok().cloned(),
                parse_error: parse_result.err(),
                dependencies: node.dependencies,
            }
        })
        .collect();

    Ok(Project {
        root,
        config,
        entry,
        modules,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixture_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/projects/hello_modules")
    }

    #[test]
    fn loads_hello_modules_fixture() {
        let project = load_project(&fixture_root()).expect("load project");
        assert_eq!(project.config.name, "hello_modules");
        assert_eq!(project.entry, "main");
        assert_eq!(project.modules.len(), 2);

        let names: Vec<_> = project.modules.iter().map(|m| m.name.as_str()).collect();
        assert_eq!(names, vec!["math", "main"]);

        let main = project.modules.iter().find(|m| m.name == "main").unwrap();
        assert_eq!(main.dependencies, vec!["math"]);
    }

    #[test]
    fn detects_circular_imports() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        std::fs::write(
            root.join("juni.toml"),
            r#"
[project]
name = "cycle"
entry = "src/a.juni"
"#,
        )
        .unwrap();
        std::fs::create_dir(root.join("src")).unwrap();
        std::fs::write(root.join("src/a.juni"), "import b\nfn main() -> i32:\n    return 0\n")
            .unwrap();
        std::fs::write(root.join("src/b.juni"), "import a\nfn foo() -> i32:\n    return 0\n")
            .unwrap();

        let err = load_project(root).unwrap_err();
        assert!(matches!(err, DriverError::Resolve(ResolveError::CircularImport(_))));
    }

    #[test]
    fn reports_missing_module() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        std::fs::write(
            root.join("juni.toml"),
            r#"
[project]
name = "missing"
entry = "src/main.juni"
"#,
        )
        .unwrap();
        std::fs::create_dir(root.join("src")).unwrap();
        std::fs::write(
            root.join("src/main.juni"),
            "import ghost\nfn main() -> i32:\n    return 0\n",
        )
        .unwrap();

        let err = load_project(root).unwrap_err();
        assert!(matches!(
            err,
            DriverError::Resolve(ResolveError::ModuleNotFound { module, .. }) if module == "ghost"
        ));
    }

    #[test]
    fn generates_asset_pack_for_project() {
        use crate::assets::build_asset_pack;

        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::write(
            root.join("juni.toml"),
            r#"
[project]
name = "assets_demo"
entry = "src/main.juni"

[assets]
root = "assets"
include = ["**/*.png"]
"#,
        )
        .unwrap();
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(
            root.join("src/main.juni"),
            "fn main() -> i32:\n    return 0\n",
        )
        .unwrap();
        std::fs::create_dir_all(root.join("assets/sprites")).unwrap();
        let png: [u8; 67] = [
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
        ];
        std::fs::write(root.join("assets/sprites/icon.png"), &png).unwrap();

        let project = load_project(root).expect("load project");
        let (pack, path) = build_asset_pack(root, &project.config.assets).expect("asset pack");
        assert_eq!(pack.assets.len(), 1);
        assert!(path.exists());
    }

    #[test]
    fn hello_modules_compiles_end_to_end() {
        use juni_check::program::{check_program_ok, ProgramModule};
        use juni_codegen::emit_wasm_program;

        let project = load_project(&fixture_root()).expect("load project");
        let modules: Vec<ProgramModule> = project
            .modules
            .iter()
            .filter_map(|m| {
                Some(ProgramModule {
                    name: m.name.clone(),
                    file: Some(m.path.display().to_string()),
                    module: m.ast.clone()?,
                })
            })
            .collect();

        let program = check_program_ok(&modules, &project.entry).expect("check program");
        assert_eq!(program.modules.len(), 2);

        let math = program.modules.iter().find(|m| m.name == "math").unwrap();
        assert!(math.functions.iter().any(|f| f.name == "math::greet"));

        let main = program.modules.iter().find(|m| m.name == "main").unwrap();
        assert!(main.functions.iter().any(|f| f.name == "main" && f.export));

        let wasm = emit_wasm_program(&program);
        assert!(wasm.len() > 8);
        assert_eq!(&wasm[0..4], b"\0asm");
    }
}
