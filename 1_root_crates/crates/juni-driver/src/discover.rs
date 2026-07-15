//! Discover `.juni` source files under `src/`.

use std::path::{Path, PathBuf};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum DiscoverError {
    #[error("failed to read directory {path}: {source}")]
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
}

/// Recursively find all `.juni` files under `{root}/src/`.
pub fn discover_sources(root: &Path) -> Result<Vec<PathBuf>, DiscoverError> {
    let src_dir = root.join("src");
    if !src_dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut files = Vec::new();
    walk_juni_files(&src_dir, &mut files)?;
    files.sort();
    Ok(files)
}

fn walk_juni_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), DiscoverError> {
    for entry in std::fs::read_dir(dir).map_err(|e| DiscoverError::Io {
        path: dir.to_path_buf(),
        source: e,
    })? {
        let entry = entry.map_err(|e| DiscoverError::Io {
            path: dir.to_path_buf(),
            source: e,
        })?;
        let path = entry.path();
        if path.is_dir() {
            walk_juni_files(&path, out)?;
        } else if path.extension().is_some_and(|ext| ext == "juni") {
            out.push(path);
        }
    }
    Ok(())
}

/// Logical module name for a file path (file stem under `src/`).
pub fn logical_name_for_path(path: &Path, root: &Path) -> Option<String> {
    let src = root.join("src");
    let rel = path.strip_prefix(&src).ok()?;
    rel.file_stem().map(|s| s.to_string_lossy().into_owned())
}
