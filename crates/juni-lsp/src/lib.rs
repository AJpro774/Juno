//! Juni language server: workspace symbols, completion, go-to-definition.

pub mod symbols;
pub mod workspace;

#[cfg(feature = "server")]
pub mod server;

pub use workspace::{CompletionItem, Location, Workspace, WorkspaceError};

#[cfg(feature = "server")]
pub use server::run_stdio_server;
