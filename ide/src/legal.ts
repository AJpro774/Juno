/** Juni Software License / Commercial Contract + EULA; first-run acceptance. */

import licenseMd from "../../LICENSE?raw";
import eulaMd from "../../EULA.md?raw";

export const LICENSE_MARKDOWN = licenseMd;
export const EULA_MARKDOWN = eulaMd;

/** Bump when EULA/LICENSE terms change meaningfully (forces re-accept). */
export const EULA_ACCEPTANCE_VERSION = "3";

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
  return `## License & EULA (binding contract)

- **Juni / Juno** is under the **Juni Software License and Commercial Contract 1.0** (modified PolyForm Small Business 1.0.0) — see \`LICENSE\`.
- **Distributed IDE / apps** are also subject to the **EULA** (\`EULA.md\`).
- **Free** for personal/hobby and Small Business (&lt;100 workers, &lt;$1M USD 2019 CPI-adjusted prior-year revenue).
- **Above that:** **USD $200/month** paid directly to Alexander James Patton (AJpro774) — mandatory.
- Your projects/games remain **yours** (export exception in \`LICENSE\`).

Open **Settings → Legal** for full texts.
`;
}
