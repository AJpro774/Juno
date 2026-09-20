/** Juni Apache-2.0 + EULA; first-run acceptance. */

import licenseMd from "../../LICENSE?raw";
import eulaMd from "../../EULA.md?raw";

export const LICENSE_MARKDOWN = licenseMd;
export const EULA_MARKDOWN = eulaMd;

/**
 * Bump when EULA/LICENSE terms change meaningfully (forces re-accept).
 * Storage key: `juni.eula.accepted.v${EULA_ACCEPTANCE_VERSION}`
 * v1 = Apache+EULA; v3–v4 = paid Commercial Contract; v5 = free Apache-2.0, no royalties.
 */
export const EULA_ACCEPTANCE_VERSION = "5";

export const EULA_STORAGE_KEY = `juni.eula.accepted.v${EULA_ACCEPTANCE_VERSION}`;

export function hasAcceptedEula(): boolean {
  try {
    return localStorage.getItem(EULA_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function acceptEula(): void {
  try {
    localStorage.setItem(EULA_STORAGE_KEY, "1");
    localStorage.setItem("juni.eula.acceptedAt", new Date().toISOString());
  } catch {
    /* ignore */
  }
}

export function legalSummaryMarkdown(): string {
  return `## License & EULA

- **Juni / Juno** source and builds are under the **Apache License 2.0** — see \`LICENSE\`.
- **Distributed IDE / apps** are also subject to the **EULA** (\`EULA.md\`).
- **Free for everyone** — personal, hobby, education, and commercial use of any size.
- **No monthly fees, no revenue share, no royalties** on games or projects you ship.
- Your projects/games remain **yours**.

Open **Settings → Legal** for full texts.
`;
}
