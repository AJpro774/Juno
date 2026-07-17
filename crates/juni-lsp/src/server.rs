//! tower-lsp Language Server backend.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::RwLock;
use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer, LspService, Server};

use crate::workspace::Workspace;

pub struct JuniLanguageServer {
    client: Client,
    workspace: Arc<RwLock<Option<Workspace>>>,
    open_docs: Arc<RwLock<HashMap<Url, String>>>,
    root: Arc<RwLock<Option<PathBuf>>>,
}

impl JuniLanguageServer {
    pub fn new(client: Client) -> Self {
        Self {
            client,
            workspace: Arc::new(RwLock::new(None)),
            open_docs: Arc::new(RwLock::new(HashMap::new())),
            root: Arc::new(RwLock::new(None)),
        }
    }

    async fn reload_workspace(&self) -> Option<Workspace> {
        let root = self.root.read().await.clone()?;
        match Workspace::from_project_root(&root) {
            Ok(ws) => {
                let mut guard = self.workspace.write().await;
                *guard = Some(ws.clone());
                Some(ws)
            }
            Err(e) => {
                self.client
                    .log_message(MessageType::ERROR, format!("workspace load failed: {e}"))
                    .await;
                None
            }
        }
    }

    fn url_to_rel_path(root: &PathBuf, url: &Url) -> Option<String> {
        let path = url.to_file_path().ok()?;
        path.strip_prefix(root)
            .ok()
            .map(|p| p.to_string_lossy().replace('\\', "/"))
    }

    fn rel_path_to_url(root: &PathBuf, rel: &str) -> Option<Url> {
        let path = root.join(rel);
        Url::from_file_path(path).ok()
    }
}

#[tower_lsp::async_trait]
impl LanguageServer for JuniLanguageServer {
    async fn initialize(&self, params: InitializeParams) -> Result<InitializeResult> {
        if let Some(root_uri) = params.root_uri {
            if let Ok(root) = root_uri.to_file_path() {
                *self.root.write().await = Some(root);
            }
        }
        Ok(InitializeResult {
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::FULL,
                )),
                completion_provider: Some(CompletionOptions {
                    trigger_characters: Some(vec![".".into(), ":".into()]),
                    ..Default::default()
                }),
                definition_provider: Some(OneOf::Left(true)),
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                diagnostic_provider: Some(DiagnosticServerCapabilities::Options(
                    DiagnosticOptions {
                        identifier: Some("juni".into()),
                        inter_file_dependencies: false,
                        workspace_diagnostics: false,
                        ..Default::default()
                    },
                )),
                ..Default::default()
            },
            server_info: Some(ServerInfo {
                name: "juni-lsp".into(),
                version: Some(env!("CARGO_PKG_VERSION").into()),
            }),
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        if self.reload_workspace().await.is_some() {
            self.client
                .log_message(MessageType::INFO, "Juni workspace loaded")
                .await;
        }
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        let uri = params.text_document.uri;
        let text = params.text_document.text;
        self.open_docs.write().await.insert(uri.clone(), text.clone());

        if let Some(root) = self.root.read().await.clone() {
            if let Some(rel) = Self::url_to_rel_path(&root, &uri) {
                if let Some(ws) = self.workspace.write().await.as_mut() {
                    let _ = ws.update_file(&rel, &text);
                }
            }
        }
    }

    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        let uri = params.text_document.uri;
        let text = params
            .content_changes
            .into_iter()
            .next()
            .map(|c| c.text)
            .unwrap_or_default();
        self.open_docs.write().await.insert(uri.clone(), text.clone());

        if let Some(root) = self.root.read().await.clone() {
            if let Some(rel) = Self::url_to_rel_path(&root, &uri) {
                if let Some(ws) = self.workspace.write().await.as_mut() {
                    let _ = ws.update_file(&rel, &text);
                }
            }
        }
    }

    async fn completion(&self, params: CompletionParams) -> Result<Option<CompletionResponse>> {
        let uri = params.text_document_position.text_document.uri;
        let pos = params.text_document_position.position;
        let line = pos.line + 1;
        let col = pos.character + 1;

        let root = self.root.read().await.clone();
        let ws_guard = self.workspace.read().await;
        let ws = match ws_guard.as_ref() {
            Some(ws) => ws,
            None => return Ok(None),
        };

        let rel = root
            .as_ref()
            .and_then(|r| Self::url_to_rel_path(r, &uri))
            .unwrap_or_else(|| uri.path().to_string());

        let items: Vec<CompletionItem> = ws
            .complete(&rel, line, col)
            .into_iter()
            .map(|item| CompletionItem {
                label: item.label,
                kind: Some(match item.kind.as_str() {
                    "function" => CompletionItemKind::FUNCTION,
                    "struct" => CompletionItemKind::STRUCT,
                    "variable" => CompletionItemKind::VARIABLE,
                    "module" => CompletionItemKind::MODULE,
                    "keyword" => CompletionItemKind::KEYWORD,
                    "type" => CompletionItemKind::TYPE_PARAMETER,
                    _ => CompletionItemKind::TEXT,
                }),
                detail: item.detail,
                insert_text: item.insert_text,
                ..Default::default()
            })
            .collect();

        Ok(Some(CompletionResponse::Array(items)))
    }

    async fn goto_definition(
        &self,
        params: GotoDefinitionParams,
    ) -> Result<Option<GotoDefinitionResponse>> {
        let uri = params.text_document_position_params.text_document.uri;
        let pos = params.text_document_position_params.position;
        let line = pos.line + 1;
        let col = pos.character + 1;

        let root = self.root.read().await.clone();
        let ws_guard = self.workspace.read().await;
        let ws = match ws_guard.as_ref() {
            Some(ws) => ws,
            None => return Ok(None),
        };

        let rel = root
            .as_ref()
            .and_then(|r| Self::url_to_rel_path(r, &uri))
            .unwrap_or_else(|| uri.path().to_string());

        let Some(loc) = ws.goto_definition(&rel, line, col) else {
            return Ok(None);
        };
        let target_url = root
            .as_ref()
            .and_then(|r| Self::rel_path_to_url(r, &loc.file))
            .unwrap_or(uri);

        Ok(Some(GotoDefinitionResponse::Scalar(Location {
            uri: target_url,
            range: Range {
                start: Position {
                    line: loc.line.saturating_sub(1),
                    character: loc.col.saturating_sub(1),
                },
                end: Position {
                    line: loc.end_line.saturating_sub(1),
                    character: loc.end_col.saturating_sub(1),
                },
            },
        })))
    }

    async fn hover(&self, params: HoverParams) -> Result<Option<Hover>> {
        let uri = params.text_document_position_params.text_document.uri;
        let pos = params.text_document_position_params.position;
        let line = pos.line + 1;
        let col = pos.character + 1;

        let root = self.root.read().await.clone();
        let ws_guard = self.workspace.read().await;
        let ws = match ws_guard.as_ref() {
            Some(ws) => ws,
            None => return Ok(None),
        };

        let rel = root
            .as_ref()
            .and_then(|r| Self::url_to_rel_path(r, &uri))
            .unwrap_or_else(|| uri.path().to_string());

        let Some(h) = ws.hover(&rel, line, col) else {
            return Ok(None);
        };

        Ok(Some(Hover {
            contents: HoverContents::Markup(MarkupContent {
                kind: MarkupKind::Markdown,
                value: h.contents,
            }),
            range: Some(Range {
                start: Position {
                    line: h.line.saturating_sub(1),
                    character: h.col.saturating_sub(1),
                },
                end: Position {
                    line: h.end_line.saturating_sub(1),
                    character: h.end_col.saturating_sub(1),
                },
            }),
        }))
    }

    async fn diagnostic(
        &self,
        params: DocumentDiagnosticParams,
    ) -> Result<DocumentDiagnosticReportResult> {
        let uri = params.text_document.uri;
        let root = self.root.read().await.clone();
        let ws_guard = self.workspace.read().await;
        let empty = DocumentDiagnosticReportResult::Report(DocumentDiagnosticReport::Full(
            RelatedFullDocumentDiagnosticReport {
                related_documents: None,
                full_document_diagnostic_report: FullDocumentDiagnosticReport {
                    result_id: None,
                    items: vec![],
                },
            },
        ));
        let Some(ws) = ws_guard.as_ref() else {
            return Ok(empty);
        };
        let rel = root
            .as_ref()
            .and_then(|r| Self::url_to_rel_path(r, &uri))
            .unwrap_or_else(|| uri.path().to_string());
        let items: Vec<Diagnostic> = ws
            .diagnostics(&rel)
            .into_iter()
            .map(|d| Diagnostic {
                range: Range {
                    start: Position {
                        line: d.line.saturating_sub(1),
                        character: d.col.saturating_sub(1),
                    },
                    end: Position {
                        line: d.end_line.saturating_sub(1),
                        character: d.end_col.saturating_sub(1),
                    },
                },
                severity: Some(if d.severity == "warning" {
                    DiagnosticSeverity::WARNING
                } else {
                    DiagnosticSeverity::ERROR
                }),
                message: d.message,
                source: Some("juni".into()),
                ..Default::default()
            })
            .collect();
        Ok(DocumentDiagnosticReportResult::Report(
            DocumentDiagnosticReport::Full(RelatedFullDocumentDiagnosticReport {
                related_documents: None,
                full_document_diagnostic_report: FullDocumentDiagnosticReport {
                    result_id: None,
                    items,
                },
            }),
        ))
    }
}

/// Run the Juni LSP server on stdio (blocking async runtime).
pub fn run_stdio_server() {
    let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
    rt.block_on(async {
        let (service, socket) = LspService::new(|client| JuniLanguageServer::new(client));
        Server::new(tokio::io::stdin(), tokio::io::stdout(), socket)
            .serve(service)
            .await;
    });
}
