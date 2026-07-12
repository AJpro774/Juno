/** Audio intrinsics: audio_load, audio_play. */

import { readStr } from "./memory.js";
import type { AssetEntry, AssetPack, MemoryRef } from "./types.js";

export type AudioHandlers = {
  audio_load: (ptr: number) => number;
  audio_play: (handle: number) => void;
};

function mimeForAudio(path: string): string {
  if (path.endsWith(".wav")) return "audio/wav";
  if (path.endsWith(".ogg")) return "audio/ogg";
  return "audio/mpeg";
}

export function createAudioHandlers(options: {
  memoryRef: MemoryRef;
  assetPack?: AssetPack | null;
  assetBaseUrl?: string;
}): AudioHandlers {
  const memoryRef = options.memoryRef;
  const pack = options.assetPack ?? null;
  const assetBaseUrl = options.assetBaseUrl ?? "";

  const buffers = new Map<number, AudioBuffer>();
  const sources = new Map<number, AudioBuffer>();

  function lookup(path: string): AssetEntry | null {
    if (!pack?.assets) return null;
    return pack.assets[path] ?? null;
  }

  async function ensureBuffer(entry: AssetEntry): Promise<void> {
    if (buffers.has(entry.id) || typeof AudioContext === "undefined") return;
    let url: string;
    if (entry.embed) {
      url = `data:${mimeForAudio(entry.path)};base64,${entry.embed}`;
    } else {
      const base = assetBaseUrl.endsWith("/") ? assetBaseUrl : `${assetBaseUrl}/`;
      url = `${base}${entry.path}`;
    }
    if (typeof fetch === "undefined") return;
    const resp = await fetch(url);
    if (!resp.ok) return;
    const data = await resp.arrayBuffer();
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(data.slice(0));
    buffers.set(entry.id, buf);
    sources.set(entry.id, buf);
    await ctx.close();
  }

  return {
    audio_load(ptr: number) {
      const memory = memoryRef.current;
      if (!memory) return 0;
      const path = readStr(memory, ptr);
      const entry = lookup(path);
      if (!entry) return 0;
      if (entry.kind === "audio") {
        ensureBuffer(entry).catch(() => {});
      }
      return entry.id | 0;
    },
    audio_play(handle: number) {
      if (typeof AudioContext === "undefined") return;
      const buf = buffers.get(handle | 0) ?? sources.get(handle | 0);
      if (!buf) return;
      const ctx = new AudioContext();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
      src.onended = () => {
        ctx.close().catch(() => {});
      };
    },
  };
}

/** Node / headless stub when Web Audio is unavailable. */
export function createAudioStubs(): AudioHandlers {
  let next = 1;
  return {
    audio_load: () => next++ | 0,
    audio_play: () => {},
  };
}
