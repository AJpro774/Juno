/** Shared Juni provenance / Required Notice for projects and exports. */

export const JUNI_REQUIRED_NOTICE =
  "Required Notice: Copyright © 2026 Alexander James Patton (AJpro774) — Juni / Juno under the Apache License 2.0";

export const JUNI_BUILT_WITH = "Built with Juni";

/** Plain-text NOTICE file contents for project roots and web exports. */
export function juniNoticeFileBody(): string {
  return `${JUNI_REQUIRED_NOTICE}
${JUNI_BUILT_WITH}

This project / build was created with the Juni language and tooling.
Keep this notice in redistributed runtime / export files (see LICENSE NOTICE requirements).
`;
}

/** Append provenance to juni.toml if missing. */
export function ensureJuniTomlProvenance(toml: string): { content: string; changed: boolean } {
  const hasNotice = toml.includes("Required Notice:");
  const hasJuniTable = /(^|\n)\s*\[juni\]\s*(\n|$)/.test(toml);
  if (hasNotice && hasJuniTable) {
    return { content: toml, changed: false };
  }

  const block = `
# --- Juni provenance (do not remove; required by LICENSE) ---
# ${JUNI_REQUIRED_NOTICE}

[juni]
engine = "Juni"
required_notice = "${JUNI_REQUIRED_NOTICE.replace(/"/g, '\\"')}"
`;

  const content = `${toml.replace(/\s*$/, "")}\n${block}`;
  return { content, changed: true };
}
