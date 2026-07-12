use std::collections::HashMap;
use std::path::PathBuf;
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
            lsp_request,
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

    let folder = app
        .dialog()
        .file()
        .blocking_pick_folder();

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

#[tauri::command]
fn lsp_request(
    request: LspRequest,
    state: tauri::State<'_, Mutex<LspState>>,
) -> Result<Value, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    let ws = guard.workspace.as_ref().ok_or("no workspace open")?;

    match request.method.as_str() {
        "textDocument/completion" => {
            let file = request
                .params
                .pointer("/textDocument/uri")
                .and_then(|v| v.as_str())
                .unwrap_or("src/main.juni");
            let line = request
                .params
                .pointer("/position/line")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32
                + 1;
            let col = request
                .params
                .pointer("/position/character")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32
                + 1;
            let rel = normalize_file(file, guard.root.as_ref());
            let items = ws.complete(&rel, line, col);
            Ok(serde_json::json!({ "items": items }))
        }
        "textDocument/definition" => {
            let file = request
                .params
                .pointer("/textDocument/uri")
                .and_then(|v| v.as_str())
                .unwrap_or("src/main.juni");
            let line = request
                .params
                .pointer("/position/line")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32
                + 1;
            let col = request
                .params
                .pointer("/position/character")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32
                + 1;
            let rel = normalize_file(file, guard.root.as_ref());
            let location = ws.goto_definition(&rel, line, col);
            Ok(serde_json::json!({ "location": location }))
        }
        other => Err(format!("unsupported LSP method: {other}")),
    }
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
    }
    path_str.to_string()
}
