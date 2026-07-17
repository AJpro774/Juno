//! Juni language server: workspace symbols, completion, go-to-definition, hover, diagnostics.

pub mod symbols;
pub mod workspace;

#[cfg(feature = "server")]
pub mod server;

pub use workspace::{
    CompletionItem, DiagnosticItem, HoverInfo, Location, Workspace, WorkspaceError,
};

#[cfg(feature = "server")]
pub use server::run_stdio_server;
