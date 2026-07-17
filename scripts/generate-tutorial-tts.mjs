#!/usr/bin/env node
/**
 * Generate optional MP3 narration for IDE tutorial lessons.
 *
 * Usage:
 *   node scripts/generate-tutorial-tts.mjs
 *   node scripts/generate-tutorial-tts.mjs --lesson ship-a-game
 *
 * Looks for OPENAI_API_KEY (or JUNI_TTS_API_KEY). Without a key, prints the
 * planned output paths and exits 0 so CI / local runs stay green.
 *
 * When a key is present, uses OpenAI speech (tts-1 / alloy) to write
 * ide/public/tutorials/<lesson-id>/step-N.mp3 for each step's narration.
 *
 * The in-IDE player prefers step-N.mp3 when present; otherwise it uses
 * speechSynthesis with the narration text from lesson.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tutorialsRoot = path.join(root, "ide/public/tutorials");

function parseArgs(argv) {
  let lesson = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--lesson" && argv[i + 1]) {
      lesson = argv[++i];
    }
  }
  return { lesson };
}

function listLessonIds(filter) {
  const catalogPath = path.join(tutorialsRoot, "index.json");
  if (!fs.existsSync(catalogPath)) {
    console.error("No tutorials catalog at", catalogPath);
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const ids = (catalog.lessons || []).map((l) => l.id);
  if (filter) {
    if (!ids.includes(filter)) {
      console.error(`Lesson "${filter}" not in catalog.`);
      process.exit(1);
    }
    return [filter];
  }
  return ids;
}

async function synthesizeOpenAi(text, outPath, apiKey) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: "alloy",
      input: text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI TTS failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
}

async function main() {
  const { lesson } = parseArgs(process.argv.slice(2));
  const apiKey = process.env.JUNI_TTS_API_KEY || process.env.OPENAI_API_KEY || "";
  const ids = listLessonIds(lesson);

  if (!apiKey) {
    console.log("No OPENAI_API_KEY / JUNI_TTS_API_KEY — dry run only.\n");
    for (const id of ids) {
      const lessonPath = path.join(tutorialsRoot, id, "lesson.json");
      const data = JSON.parse(fs.readFileSync(lessonPath, "utf8"));
      const steps = data.steps || [];
      console.log(`Lesson: ${id} (${steps.length} steps)`);
      steps.forEach((_, i) => {
        const out = path.join(tutorialsRoot, id, `step-${i + 1}.mp3`);
        console.log(`  would write: ${path.relative(root, out)}`);
      });
    }
    console.log(
      "\nSet OPENAI_API_KEY (or JUNI_TTS_API_KEY) and re-run to generate MP3s.\n" +
        "IDE falls back to speechSynthesis when MP3s are absent."
    );
    return;
  }

  for (const id of ids) {
    const lessonPath = path.join(tutorialsRoot, id, "lesson.json");
    const data = JSON.parse(fs.readFileSync(lessonPath, "utf8"));
    const steps = data.steps || [];
    console.log(`Generating TTS for ${id}…`);
    for (let i = 0; i < steps.length; i++) {
      const narration = steps[i].narration || steps[i].caption || "";
      const out = path.join(tutorialsRoot, id, `step-${i + 1}.mp3`);
      if (!narration.trim()) {
        console.warn(`  skip step ${i + 1}: empty narration`);
        continue;
      }
      await synthesizeOpenAi(narration, out, apiKey);
      console.log(`  wrote ${path.relative(root, out)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
