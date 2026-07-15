//! Module graph resolution, topological sort, and cycle detection.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use thiserror::Error;

use crate::discover;
use crate::imports;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ResolveError {
    #[error("entry module not found: {0}")]
    EntryNotFound(PathBuf),
    #[error("module '{module}' not found (referenced from {from})")]
    ModuleNotFound { module: String, from: PathBuf },
    #[error("circular import: {0}")]
    CircularImport(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModuleNode {
    pub name: String,
    pub path: PathBuf,
    pub source: String,
    pub dependencies: Vec<String>,
}

/// Build the module graph from discovered sources and import declarations.
pub fn build_graph(
    root: &Path,
    entry_path: &Path,
    overrides: &HashMap<String, PathBuf>,
    sources: &[(PathBuf, String)],
    parsed: &HashMap<PathBuf, juni_syntax::Module>,
) -> Result<(Vec<ModuleNode>, String), ResolveError> {
    let entry_abs = root.join(entry_path);
    let entry_in_sources = sources.iter().any(|(path, _)| {
        path == &entry_abs
            || path
                .strip_prefix(root)
                .ok()
                .map(|r| r == entry_path)
                .unwrap_or(false)
    });
    if !entry_abs.is_file() && !entry_in_sources {
        return Err(ResolveError::EntryNotFound(entry_path.to_path_buf()));
    }

    let mut name_to_path: HashMap<String, PathBuf> = HashMap::new();
    let mut path_to_name: HashMap<PathBuf, String> = HashMap::new();

    for (path, _) in sources {
        if let Some(name) = discover::logical_name_for_path(path, root) {
            let rel = path.strip_prefix(root).unwrap_or(path).to_path_buf();
            name_to_path.entry(name.clone()).or_insert(rel.clone());
            path_to_name.insert(rel, name);
        }
    }

    for (name, rel) in overrides {
        name_to_path.insert(name.clone(), rel.clone());
        path_to_name.insert(rel.clone(), name.clone());
    }

    let entry_rel = entry_path.to_path_buf();
    let entry_name = path_to_name
        .get(&entry_rel)
        .cloned()
        .or_else(|| {
            entry_path
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
        })
        .ok_or_else(|| ResolveError::EntryNotFound(entry_path.to_path_buf()))?;

    let mut nodes: HashMap<String, ModuleNode> = HashMap::new();

    for (abs_path, source) in sources {
        let rel = abs_path.strip_prefix(root).unwrap_or(abs_path).to_path_buf();
        let name = path_to_name
            .get(&rel)
            .cloned()
            .or_else(|| discover::logical_name_for_path(abs_path, root))
            .unwrap_or_else(|| {
                abs_path
                    .file_stem()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_default()
            });

        let parsed_mod = parsed.get(abs_path);
        let deps = imports::extract_imports(source, parsed_mod);

        nodes.insert(
            name.clone(),
            ModuleNode {
                name,
                path: rel,
                source: source.clone(),
                dependencies: deps,
            },
        );
    }

    if !nodes.contains_key(&entry_name) {
        let source = sources
            .iter()
            .find(|(path, _)| {
                path == &entry_abs
                    || path
                        .strip_prefix(root)
                        .ok()
                        .map(|r| r == entry_path)
                        .unwrap_or(false)
            })
            .map(|(_, s)| s.clone())
            .or_else(|| std::fs::read_to_string(&entry_abs).ok())
            .unwrap_or_default();
        let parsed_mod = parsed.get(&entry_abs);
        let deps = imports::extract_imports(&source, parsed_mod);
        nodes.insert(
            entry_name.clone(),
            ModuleNode {
                name: entry_name.clone(),
                path: entry_rel.clone(),
                source,
                dependencies: deps,
            },
        );
    }

    for node in nodes.values() {
        for dep in &node.dependencies {
            if resolve_module_path(dep, root, overrides).is_none()
                && !name_to_path.contains_key(dep)
            {
                return Err(ResolveError::ModuleNotFound {
                    module: dep.clone(),
                    from: node.path.clone(),
                });
            }
        }
    }

    let order = topological_sort(&nodes)?;
    let sorted: Vec<ModuleNode> = order
        .iter()
        .filter_map(|name| nodes.get(name).cloned())
        .collect();

    Ok((sorted, entry_name))
}

/// Map a logical module name to a project-relative path.
pub fn resolve_module_path(
    name: &str,
    root: &Path,
    overrides: &HashMap<String, PathBuf>,
) -> Option<PathBuf> {
    if let Some(path) = overrides.get(name) {
        let abs = root.join(path);
        if abs.is_file() {
            return Some(path.clone());
        }
    }
    let in_src = PathBuf::from("src").join(format!("{name}.juni"));
    if root.join(&in_src).is_file() {
        return Some(in_src);
    }
    let at_root = PathBuf::from(format!("{name}.juni"));
    if root.join(&at_root).is_file() {
        return Some(at_root);
    }
    None
}

fn topological_sort(nodes: &HashMap<String, ModuleNode>) -> Result<Vec<String>, ResolveError> {
    let mut in_degree: HashMap<String, usize> = HashMap::new();
    let mut adj: HashMap<String, Vec<String>> = HashMap::new();

    for name in nodes.keys() {
        in_degree.entry(name.clone()).or_insert(0);
        adj.entry(name.clone()).or_default();
    }

    for node in nodes.values() {
        for dep in &node.dependencies {
            if nodes.contains_key(dep) {
                adj.entry(dep.clone()).or_default().push(node.name.clone());
                *in_degree.entry(node.name.clone()).or_insert(0) += 1;
            }
        }
    }

    let mut queue: Vec<String> = in_degree
        .iter()
        .filter(|(_, &deg)| deg == 0)
        .map(|(k, _)| k.clone())
        .collect();
    queue.sort();

    let mut order = Vec::new();
    let mut degrees = in_degree.clone();

    while let Some(name) = queue.first().cloned() {
        queue.remove(0);
        order.push(name.clone());
        if let Some(neighbors) = adj.get(&name) {
            for next in neighbors {
                let deg = degrees.get_mut(next).unwrap();
                *deg -= 1;
                if *deg == 0 {
                    queue.push(next.clone());
                    queue.sort();
                }
            }
        }
    }

    if order.len() != nodes.len() {
        let cycle = find_cycle(nodes);
        return Err(ResolveError::CircularImport(cycle));
    }

    Ok(order)
}

fn find_cycle(nodes: &HashMap<String, ModuleNode>) -> String {
    let mut visiting: HashSet<String> = HashSet::new();
    let mut visited: HashSet<String> = HashSet::new();
    let mut path: Vec<String> = Vec::new();

    for start in nodes.keys() {
        if visited.contains(start) {
            continue;
        }
        if let Some(cycle) = dfs_cycle(start, nodes, &mut visiting, &mut visited, &mut path) {
            return cycle;
        }
    }
    "unknown cycle".to_string()
}

fn dfs_cycle(
    name: &str,
    nodes: &HashMap<String, ModuleNode>,
    visiting: &mut HashSet<String>,
    visited: &mut HashSet<String>,
    path: &mut Vec<String>,
) -> Option<String> {
    if visiting.contains(name) {
        let pos = path.iter().position(|p| p == name).unwrap_or(path.len());
        let mut cycle: Vec<_> = path[pos..].to_vec();
        cycle.push(name.to_string());
        return Some(cycle.join(" -> "));
    }
    if visited.contains(name) {
        return None;
    }
    visiting.insert(name.to_string());
    path.push(name.to_string());

    if let Some(node) = nodes.get(name) {
        for dep in &node.dependencies {
            if nodes.contains_key(dep) {
                if let Some(c) = dfs_cycle(dep, nodes, visiting, visited, path) {
                    return Some(c);
                }
            }
        }
    }

    path.pop();
    visiting.remove(name);
    visited.insert(name.to_string());
    None
}
