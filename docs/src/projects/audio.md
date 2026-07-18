# Audio

Juni exposes a small **Web Audio** surface for browser games, with Node stubs for headless runs.

## APIs

| Function | Description |
|----------|-------------|
| `audio_load(path)` | Load a sound from the asset pack; returns handle |
| `audio_play(handle)` | Play a one-shot sample |
| `audio_play_loop(handle)` | Loop a sample until stopped |
| `audio_set_volume(handle, volume)` | Per-handle gain in `[0, 1]` |
| `audio_stop(handle)` | Stop active voices for that handle |
| `audio_set_bus_volume(volume)` | Master bus gain in `[0, 1]` |

Paths refer to entries declared under `[assets.audio]` in `juni.toml` (or packed under `assets/`).

## Browser runtime

The unified runtime uses the Web Audio API when available. Voices route through a simple master bus so `audio_set_bus_volume` ducks all playback.

## Node / CLI

`runtime/host.js` stubs audio calls so `juni build` samples still run without a browser.

## Demo

`examples/projects/audio_demo` is a multi-module project that prints note names today; swap `print` calls for `audio_play` when host imports are enabled.

```juni
import audio

fn main() -> i32:
    audio.init()
    audio.play_note("C4")
    return 0
```
