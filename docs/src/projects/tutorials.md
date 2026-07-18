# Visual tutorials

The Juni IDE includes a **Tutorials** panel (next to Docs) with screenshot-style lessons, captions, and spoken narration.

## In the IDE

1. Click **Tutorials** in the toolbar.
2. Pick a lesson from the dropdown.
3. Use **Prev** / **Next** (or ← / →) to move through steps.
4. **Speak** plays narration; **Stop** cancels it.

### Narration

- If `step-N.mp3` (or a step’s `audio` override such as `step-1.wav`) exists beside the step image, the player plays that file.
- Otherwise it uses the browser `speechSynthesis` API with the step’s `narration` text (works offline after the IDE loads).
- **Ship a game** ships a tiny `step-1.wav` sample so Speak has a committed audio path; remaining steps use `speechSynthesis` unless you generate MP3s.

## Lesson pack format

Packs live under `ide/public/tutorials/<lesson-id>/`:

```
ide/public/tutorials/
  index.json                 # catalog of lessons
  ship-a-game/
    lesson.json
    step-1.svg               # (or .png / .webp)
    step-2.svg
    …
    step-1.mp3               # optional pre-rendered TTS
```

### `index.json`

```json
{
  "lessons": [
    {
      "id": "ship-a-game",
      "title": "Ship a game",
      "description": "Open a project, edit a scene, play, then export."
    }
  ]
}
```

### `lesson.json`

```json
{
  "id": "ship-a-game",
  "title": "Ship a game",
  "description": "…",
  "steps": [
    {
      "image": "step-1.svg",
      "caption": "Open a project",
      "narration": "Click Open Project…",
      "highlight": "open-project"
    }
  ]
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `image` | yes | Relative to the lesson folder |
| `caption` | yes | Shown under the image |
| `narration` | yes | Spoken text / TTS source |
| `highlight` | no | Optional UI region hint |
| `audio` | no | Override MP3 path; default `step-N.mp3` |

## Generating TTS audio

Optional helper (no key required for a dry run):

```bash
node scripts/generate-tutorial-tts.mjs
node scripts/generate-tutorial-tts.mjs --lesson ship-a-game
```

Set `OPENAI_API_KEY` or `JUNI_TTS_API_KEY` to write real `step-N.mp3` files. Without a key the script lists planned paths and exits successfully; the IDE still narrates via `speechSynthesis` (and uses any committed sample such as `ship-a-game/step-1.wav`).

## Current lessons

- **Ship a game** (v8.0) — Open project → Edit scene → Play → Export Web
- **Physics and scripts** (v8.1) — Colliders, triggers/slopes, entity script dispatch
- **Desktop IDE** (v8.2) — Native open/save, hover + diagnostics LSP
- **3D scene slice** (v8.2) — Mesh / light / camera authoring + `world_draw3d` Play
- **AI assistant** (v8.2) — Enable WebLLM, model defaults, docs-grounded chat
