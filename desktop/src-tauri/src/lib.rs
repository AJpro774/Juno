use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use juni_driver::load_project;
use juni_lsp::Workspace;
use serde::Deserialize;
use serde_json::Value;

#[derive(Default)]
struct LspState {
    workspace: Option<Workspace>,
    open_docs: HashMap<String, String>,
    root: Option<PathBuf>,
}

#[derive(Debug, Deserialize)]
struct LspRequest {
    method: String,
    params: Value,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(LspState::default()))
        .invoke_handler(tauri::generate_handler![
            open_project_folder,
            load_project_files,
            read_project_file,
            lsp_request,
            save_scene_file,
            write_project_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn open_project_folder(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<LspState>>,
) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;

    let folder = app.dialog().file().blocking_pick_folder();

    let Some(path) = folder else {
        return Ok(String::new());
    };

    let root = path
        .into_path()
        .map_err(|e| format!("invalid folder path: {e}"))?;

    let project = load_project(&root).map_err(|e| e.to_string())?;
    let ws = Workspace::from_project(project).map_err(|e| e.to_string())?;

    let mut guard = state.lock().map_err(|e| e.to_string())?;
    guard.root = Some(root.clone());
    guard.workspace = Some(ws);
    guard.open_docs.clear();

    Ok(root.to_string_lossy().into_owned())
}

/// Read all project text/binary-as-data-URL files under the open root.
#[tauri::command]
fn load_project_files(
    state: tauri::State<'_, Mutex<LspState>>,
) -> Result<HashMap<String, String>, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    let root = guard.root.as_ref().ok_or("no project open")?;
    collect_project_files(root)
}

#[tauri::command]
fn read_project_file(
    relative_path: String,
    state: tauri::State<'_, Mutex<LspState>>,
) -> Result<String, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    let root = guard.root.as_ref().ok_or("no project open")?;
    let path = safe_join(root, &relative_path)?;
    read_file_as_project_content(&path)
}

#[tauri::command]
fn lsp_request(
    request: LspRequest,
    state: tauri::State<'_, Mutex<LspState>>,
) -> Result<Value, String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    let root = guard.root.clone();

    match request.method.as_str() {
        "textDocument/didOpen" | "textDocument/didChange" => {
            let file = request
                .params
                .pointer("/textDocument/uri")
                .and_then(|v| v.as_str())
                .unwrap_or("src/main.juni");
            let text = request
                .params
                .pointer("/textDocument/text")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let rel = normalize_file(file, root.as_ref());
            guard.open_docs.insert(rel.clone(), text.to_string());
            if let Some(ws) = guard.workspace.as_mut() {
                let _ = ws.update_file(&rel, text);
            }
            Ok(Value::Null)
        }
        "textDocument/completion" => {
            let ws = guard.workspace.as_ref().ok_or("no workspace open")?;
            let (rel, line, col) = position_args(&request.params, root.as_ref());
            let items = ws.complete(&rel, line, col);
            Ok(serde_json::json!({ "items": items }))
        }
        "textDocument/definition" => {
            let ws = guard.workspace.as_ref().ok_or("no workspace open")?;
            let (rel, line, col) = position_args(&request.params, root.as_ref());
            let location = ws.goto_definition(&rel, line, col);
            Ok(serde_json::json!({ "location": location }))
        }
        "textDocument/hover" => {
            let ws = guard.workspace.as_ref().ok_or("no workspace open")?;
            let (rel, line, col) = position_args(&request.params, root.as_ref());
            let hover = ws.hover(&rel, line, col);
            Ok(serde_json::json!({ "hover": hover }))
        }
        "textDocument/diagnostic" | "textDocument/publishDiagnostics" => {
            let ws = guard.workspace.as_ref().ok_or("no workspace open")?;
            let file = request
                .params
                .pointer("/textDocument/uri")
                .and_then(|v| v.as_str())
                .unwrap_or("src/main.juni");
            let rel = normalize_file(file, root.as_ref());
            let items = ws.diagnostics(&rel);
            Ok(serde_json::json!({ "items": items }))
        }
        other => Err(format!("unsupported LSP method: {other}")),
    }
}

/// Persist any text file under the open project root.
#[tauri::command]
fn write_project_file(
    relative_path: String,
    contents: String,
    state: tauri::State<'_, Mutex<LspState>>,
) -> Result<(), String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    let root = guard.root.as_ref().ok_or("no project open")?.clone();
    let path = safe_join(&root, &relative_path)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, contents.as_bytes()).map_err(|e| e.to_string())?;

    let rel = relative_path.replace('\\', "/");
    guard.open_docs.insert(rel.clone(), contents.clone());
    if rel.ends_with(".juni") {
        if let Some(ws) = guard.workspace.as_mut() {
            let _ = ws.update_file(&rel, &contents);
        }
    }
    Ok(())
}

/// Persist a `.jscene` JSON document under the open project root.
#[tauri::command]
fn save_scene_file(
    relative_path: String,
    contents: String,
    state: tauri::State<'_, Mutex<LspState>>,
) -> Result<(), String> {
    write_project_file(relative_path, contents, state)
}

fn position_args(params: &Value, root: Option<&PathBuf>) -> (String, u32, u32) {
    let file = params
        .pointer("/textDocument/uri")
        .and_then(|v| v.as_str())
        .unwrap_or("src/main.juni");
    let line = params
        .pointer("/position/line")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32
        + 1;
    let col = params
        .pointer("/position/character")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32
        + 1;
    (normalize_file(file, root), line, col)
}

fn normalize_file(file: &str, root: Option<&PathBuf>) -> String {
    let path_str = file
        .strip_prefix("file://")
        .unwrap_or(file)
        .trim_start_matches('/');
    if let Some(root) = root {
        let candidate = root.join(path_str);
        if candidate.exists() {
            if let Ok(rel) = candidate.strip_prefix(root) {
                return rel.to_string_lossy().replace('\\', "/");
            }
        }
        // Already a project-relative path
        let rel_candidate = root.join(file.trim_start_matches('/'));
        if rel_candidate.exists() {
            if let Ok(rel) = rel_candidate.strip_prefix(root) {
                return rel.to_string_lossy().replace('\\', "/");
            }
        }
    }
    path_str.to_string()
}

fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let rel = relative.replace('\\', "/");
    if rel.contains("..") {
        return Err("path escapes project root".into());
    }
    let path = root.join(&rel);
    let canon_root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    if let Ok(canon) = path.canonicalize() {
        if !canon.starts_with(&canon_root) {
            return Err("path escapes project root".into());
        }
    }
    Ok(path)
}

fn collect_project_files(root: &Path) -> Result<HashMap<String, String>, String> {
    let mut out = HashMap::new();
    collect_dir(root, root, &mut out)?;
    if !out.contains_key("juni.toml") {
        return Err("Selected folder must contain juni.toml at the project root.".into());
    }
    Ok(out)
}

fn collect_dir(root: &Path, dir: &Path, out: &mut HashMap<String, String>) -> Result<(), String> {
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist" {
            continue;
        }
        if path.is_dir() {
            collect_dir(root, &path, out)?;
        } else if path.is_file() {
            let rel = path
                .strip_prefix(root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            match read_file_as_project_content(&path) {
                Ok(content) => {
                    out.insert(rel, content);
                }
                Err(_) => {
                    // Skip unreadable / oversized binaries
                }
            }
        }
    }
    Ok(())
}

fn read_file_as_project_content(path: &Path) -> Result<String, String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    if is_binary_ext(&ext) {
        if bytes.len() > 8 * 1024 * 1024 {
            return Err("file too large".into());
        }
        let mime = match ext.as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "wav" => "audio/wav",
            "ogg" => "audio/ogg",
            "mp3" => "audio/mpeg",
            "bin" => "application/octet-stream",
            _ => "application/octet-stream",
        };
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        Ok(format!("data:{mime};base64,{}", STANDARD.encode(&bytes)))
    } else {
        String::from_utf8(bytes).map_err(|e| e.to_string())
    }
}

fn is_binary_ext(ext: &str) -> bool {
    matches!(
        ext,
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "wav" | "ogg" | "mp3" | "bin" | "wasm"
    )
}
