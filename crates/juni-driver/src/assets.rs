//! Scan project `assets/` and emit `assets.pack.json`.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::manifest::AssetConfig;

#[derive(Debug, Error)]
pub enum AssetError {
    #[error("failed to read {path}: {source}")]
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("failed to write asset pack: {0}")]
    Write(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetPack {
    pub version: u32,
    pub assets: BTreeMap<String, AssetEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetEntry {
    pub id: u32,
    pub kind: String,
    pub w: u32,
    pub h: u32,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub embed: Option<String>,
}

/// Scan `root/{config.root}` and build an asset manifest.
pub fn scan_assets(root: &Path, config: &AssetConfig) -> Result<AssetPack, AssetError> {
    let assets_dir = root.join(&config.root);
    let mut pack = AssetPack {
        version: 1,
        assets: BTreeMap::new(),
    };

    if !assets_dir.is_dir() {
        return Ok(pack);
    }

    let mut files = Vec::new();
    walk_asset_files(&assets_dir, &mut files)?;
    files.sort();

    let mut next_id = 1u32;
    for path in files {
        let rel = path
            .strip_prefix(&assets_dir)
            .map_err(|e| AssetError::Write(e.to_string()))?;
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        if !matches_any_pattern(&rel_str, &config.include) {
            continue;
        }

        let data = std::fs::read(&path).map_err(|source| AssetError::Io {
            path: path.clone(),
            source,
        })?;
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let kind = asset_kind(&ext);
        let (w, h) = image_dimensions(&ext, &data);

        let embed = if data.len() <= config.embed_max_bytes {
            Some(STANDARD.encode(&data))
        } else {
            None
        };

        pack.assets.insert(
            rel_str.clone(),
            AssetEntry {
                id: next_id,
                kind,
                w,
                h,
                path: rel_str,
                embed,
            },
        );
        next_id += 1;
    }

    Ok(pack)
}

/// Write `assets.pack.json` to `root.join(config.pack)`.
pub fn write_asset_pack(root: &Path, config: &AssetConfig, pack: &AssetPack) -> Result<PathBuf, AssetError> {
    let out = root.join(&config.pack);
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent).map_err(|e| AssetError::Write(e.to_string()))?;
    }
    let json = serde_json::to_string_pretty(pack).map_err(|e| AssetError::Write(e.to_string()))?;
    std::fs::write(&out, json).map_err(|e| AssetError::Write(e.to_string()))?;
    Ok(out)
}

/// Scan assets and write the pack file.
pub fn build_asset_pack(root: &Path, config: &AssetConfig) -> Result<(AssetPack, PathBuf), AssetError> {
    let pack = scan_assets(root, config)?;
    let path = write_asset_pack(root, config, &pack)?;
    Ok((pack, path))
}

fn walk_asset_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), AssetError> {
    for entry in std::fs::read_dir(dir).map_err(|source| AssetError::Io {
        path: dir.to_path_buf(),
        source,
    })? {
        let entry = entry.map_err(|source| AssetError::Io {
            path: dir.to_path_buf(),
            source,
        })?;
        let path = entry.path();
        if path.is_dir() {
            walk_asset_files(&path, out)?;
        } else if path.is_file() {
            out.push(path);
        }
    }
    Ok(())
}

fn asset_kind(ext: &str) -> String {
    match ext {
        "png" | "jpg" | "jpeg" | "gif" | "webp" => "image".to_string(),
        "obj" => "mesh".to_string(),
        "gltf" => "gltf".to_string(),
        "jscene" => "scene".to_string(),
        "json" => "tilemap".to_string(),
        "wav" | "mp3" | "ogg" => "audio".to_string(),
        _ => "blob".to_string(),
    }
}

fn image_dimensions(ext: &str, data: &[u8]) -> (u32, u32) {
    match ext {
        "png" => png_dimensions(data).unwrap_or((0, 0)),
        _ => (0, 0),
    }
}

fn png_dimensions(data: &[u8]) -> Option<(u32, u32)> {
    if data.len() < 24 || &data[0..8] != b"\x89PNG\r\n\x1a\n" {
        return None;
    }
    let w = u32::from_be_bytes([data[16], data[17], data[18], data[19]]);
    let h = u32::from_be_bytes([data[20], data[21], data[22], data[23]]);
    Some((w, h))
}

fn matches_any_pattern(path: &str, patterns: &[String]) -> bool {
    patterns.iter().any(|p| matches_glob(path, p))
}

fn matches_glob(path: &str, pattern: &str) -> bool {
    let path = path.replace('\\', "/");
    let pattern = pattern.replace('\\', "/");

    if pattern.contains("**/") {
        if let Some(rest) = pattern.split("**/").nth(1) {
            if let Some(suffix) = rest.strip_prefix('*') {
                return path.ends_with(suffix);
            }
            return path.ends_with(rest) || path == rest;
        }
        return true;
    }

    if let Some((prefix, suffix)) = pattern.split_once('*') {
        return path.starts_with(prefix) && path.ends_with(suffix);
    }

    path == pattern
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tiny_png() -> Vec<u8> {
        // 1x1 RGBA PNG
        vec![
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
        ]
    }

    #[test]
    fn scans_png_assets() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let sprites = root.join("assets/sprites");
        std::fs::create_dir_all(&sprites).unwrap();
        std::fs::write(sprites.join("player.png"), tiny_png()).unwrap();

        let config = AssetConfig::default();
        let pack = scan_assets(root, &config).expect("scan");
        assert_eq!(pack.assets.len(), 1);
        let entry = pack.assets.get("sprites/player.png").unwrap();
        assert_eq!(entry.id, 1);
        assert_eq!(entry.kind, "image");
        assert_eq!(entry.w, 1);
        assert_eq!(entry.h, 1);
        assert!(entry.embed.is_some());
    }

    #[test]
    fn writes_pack_json() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let sprites = root.join("assets/sprites");
        std::fs::create_dir_all(&sprites).unwrap();
        std::fs::write(sprites.join("icon.png"), tiny_png()).unwrap();

        let config = AssetConfig {
            pack: PathBuf::from("dist/assets.pack.json"),
            ..AssetConfig::default()
        };
        let (pack, path) = build_asset_pack(root, &config).expect("build");
        assert!(path.ends_with("dist/assets.pack.json"));
        assert_eq!(pack.assets.len(), 1);
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("sprites/icon.png"));
    }

    #[test]
    fn glob_patterns_filter_files() {
        assert!(matches_glob("sprites/a.png", "**/*.png"));
        assert!(!matches_glob("sprites/a.obj", "**/*.png"));
        assert!(matches_glob("sprites/a.png", "sprites/*.png"));
    }
}
