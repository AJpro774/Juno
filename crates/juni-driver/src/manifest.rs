//! Parse `juni.toml` project manifest.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ManifestError {
    #[error("juni.toml not found at {0}")]
    NotFound(PathBuf),
    #[error("failed to read juni.toml: {0}")]
    Io(#[from] std::io::Error),
    #[error("failed to parse juni.toml: {0}")]
    Parse(String),
    #[error("missing required field [project].entry in juni.toml")]
    MissingEntry,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectConfig {
    pub name: String,
    pub version: String,
    pub entry: PathBuf,
    /// Optional logical-name → relative-path overrides from `[modules]`.
    pub module_overrides: HashMap<String, PathBuf>,
    /// Asset pipeline settings from `[assets]`.
    pub assets: AssetConfig,
}

/// `[assets]` section in `juni.toml`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AssetConfig {
    pub root: PathBuf,
    pub include: Vec<String>,
    pub embed_max_bytes: usize,
    pub pack: PathBuf,
}

impl Default for AssetConfig {
    fn default() -> Self {
        Self {
            root: PathBuf::from("assets"),
            include: vec![
                "**/*.png".into(),
                "**/*.jpg".into(),
                "**/*.jpeg".into(),
                "**/*.wav".into(),
                "**/*.obj".into(),
            ],
            embed_max_bytes: 65536,
            pack: PathBuf::from("assets.pack.json"),
        }
    }
}

#[derive(Debug, Deserialize)]
struct JuniManifest {
    project: ProjectSection,
    #[serde(default)]
    modules: HashMap<String, String>,
    #[serde(default = "default_assets_section")]
    assets: AssetsSection,
}

#[derive(Debug, Deserialize)]
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
    ]
}

fn default_embed_max() -> usize {
    65536
}

fn default_pack() -> String {
    "assets.pack.json".to_string()
}

#[derive(Debug, Deserialize)]
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

pub fn load_manifest(root: &Path) -> Result<ProjectConfig, ManifestError> {
    let path = root.join("juni.toml");
    if !path.is_file() {
        return Err(ManifestError::NotFound(path));
    }
    let text = std::fs::read_to_string(&path)?;
    let raw: JuniManifest =
        toml::from_str(&text).map_err(|e| ManifestError::Parse(e.to_string()))?;

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
    })
}
