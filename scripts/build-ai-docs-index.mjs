#!/usr/bin/env node
/**
 * Rebuild ide/public/ai-docs-index.json from docs/src (optional; IDE also ships DOC_CHUNKS).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsSrc = path.join(root, "docs/src");
const out = path.join(root, "ide/public/ai-docs-index.json");

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith(".md")) acc.push(p);
  }
  return acc;
}

const chunks = [];
for (const file of walk(docsSrc)) {
  const rel = path.relative(docsSrc, file).replace(/\\/g, "/");
  const text = fs.readFileSync(file, "utf8");
  const parts = text.split(/\n(?=# )/);
  for (let i = 0; i < parts.length; i++) {
    const body = parts[i].trim();
    if (!body) continue;
    const title = (body.match(/^#\s+(.+)/) || [, rel])[1];
    const keywords = [
      ...new Set(
        body
          .toLowerCase()
          .replace(/[^a-z0-9_\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 3)
          .slice(0, 40)
      ),
    ];
    chunks.push({
      id: `${rel}#${i}`,
      title,
      path: rel,
      text: body.slice(0, 800),
      keywords: keywords.slice(0, 24),
    });
  }
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ version: 1, chunks }, null, 2));
console.log(`wrote ${out} (${chunks.length} chunks)`);
