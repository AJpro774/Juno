/** Apache-2.0 + EULA texts and first-run acceptance. */

import licenseMd from "../../LICENSE?raw";
import eulaMd from "../../EULA.md?raw";

export const LICENSE_MARKDOWN = licenseMd;
export const EULA_MARKDOWN = eulaMd;

/** Bump when EULA terms change meaningfully (forces re-accept). */
export const EULA_ACCEPTANCE_VERSION = "1";

const STORAGE_KEY = `juni.eula.accepted.v${EULA_ACCEPTANCE_VERSION}`;

export function hasAcceptedEula(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function acceptEula(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
    localStorage.setItem("juni.eula.acceptedAt", new Date().toISOString());
  } catch {
    /* ignore */
  }
}

export function legalSummaryMarkdown(): string {
  return `## License & EULA

- **Source code** is licensed under the **Apache License 2.0** only (see repository \`LICENSE\`).
- **Distributed Juni IDE / runtime apps** (web, desktop installers, PWA) are also subject to the **End User License Agreement** (\`EULA.md\`).
- Your Juni projects and games remain **yours**.

Open **Settings → Legal** to read the full texts, or use the Credits panel shortcuts.
`;
}
