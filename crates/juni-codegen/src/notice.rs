//! Permanent Juni provenance / Required Notice text embedded in projects and binaries.

/// License Required Notice (must match LICENSE). Do not weaken or remove.
pub const REQUIRED_NOTICE: &str = "Required Notice: Copyright © 2026 Alexander James Patton (AJpro774) — Juni / Juno under the Juni Software License and Commercial Contract 1.0";

/// Short marker for producers / logs.
pub const BUILT_WITH: &str = "Built with Juni";

/// UTF-8 payload for the `juni.notice` WASM custom section.
pub fn notice_section_bytes() -> Vec<u8> {
    format!(
        "{REQUIRED_NOTICE}\n{BUILT_WITH} {}\n",
        env!("CARGO_PKG_VERSION")
    )
    .into_bytes()
}
