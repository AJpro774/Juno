/**
 * Wllama (llama.cpp WASM) backend for HuggingFace GGUF models.
 * Full multimodal: image + audio via mmproj (Gemma 4 any-to-any).
 */

import { CacheManager, Wllama } from "@wllama/wllama";
import type { ChatMessage, LoadProgress, ModalitySupport } from "./types";
import {
  audioDataUrlToWav16k,
  dataUrlToArrayBuffer,
  defaultPromptForMedia,
} from "./types";

export type GgufSource = {
  repo: string;
  file: string;
  mmprojFile?: string;
};

type WllamaContentPart =
  | { type: "image"; data: ArrayBuffer }
  | { type: "audio"; data: ArrayBuffer }
  | { type: "text"; text: string };

type WllamaHandle = {
  chat: {
    completions: {
      create: (req: Record<string, unknown>) => Promise<unknown>;
    };
  };
  interruptGenerate?: () => void | Promise<void>;
  unload: () => Promise<void>;
  multimodal: boolean;
  modalities: ModalitySupport;
};

let instance: Wllama | null = null;
let loadedKey = "";
let loadedModalities: ModalitySupport = { image: false, audio: false };

function sourceKey(src: GgufSource): string {
  return `gguf:${src.repo}:${src.file}:${src.mmprojFile ?? ""}`;
}

function hfResolveUrl(repo: string, file: string): string {
  return `https://huggingface.co/${repo}/resolve/main/${file}`;
}

function sourceUrls(source: GgufSource): string[] {
  const urls = [hfResolveUrl(source.repo, source.file)];
  if (source.mmprojFile) urls.push(hfResolveUrl(source.repo, source.mmprojFile));
  return urls;
}

async function wasmPaths(): Promise<{ default: string }> {
  const url = (await import("@wllama/wllama/esm/wasm/wllama.wasm?url")).default;
  return { default: url };
}

/**
 * wllama can leave orphan OPFS blobs (no / wrong originalURL metadata) after an
 * interrupted download. Its downloader then skips re-fetch and throws
 * "Model file not found: <hf url>" even though the Hub file exists.
 */
async function purgeSourceCache(cache: CacheManager, source: GgufSource): Promise<void> {
  const urls = sourceUrls(source);
  const listed = await cache.list();
  const keys = new Set<string>();

  for (const url of urls) {
    keys.add(await cache.getNameFromURL(url));
    const base = url.split("/").pop() ?? "";
    for (const entry of listed) {
      if (entry.metadata.originalURL === url) keys.add(entry.name);
      if (base && entry.name.endsWith(`_${base}`)) keys.add(entry.name);
      // Broken polyfill entries (bytes on disk, empty originalURL)
      if (
        base &&
        entry.name.includes(base) &&
        (!entry.metadata.originalURL || entry.metadata.originalSize !== entry.size)
      ) {
        keys.add(entry.name);
      }
    }
  }

  for (const key of keys) {
    try {
      await cache.delete(key);
    } catch {
      /* ignore */
    }
  }
}

function readModalities(wllama: Wllama): ModalitySupport {
  try {
    return {
      image: wllama.supportInputModality("image"),
      audio: wllama.supportInputModality("audio"),
    };
  } catch {
    return { image: false, audio: false };
  }
}

/** llama.cpp / mtmd default — wllama sometimes leaves media_marker empty after load. */
const DEFAULT_MEDIA_MARKER = "<__media__>";

/**
 * Ensure multimodal chat can insert media placeholders.
 * Without this, createChatCompletion throws "Media marker is undefined".
 */
function ensureMediaMarker(wllama: Wllama, mmRequested: boolean): void {
  const anyW = wllama as unknown as {
    mediaMarker?: string;
    getLoadedContextInfo?: () => { media_marker?: string; has_image_input?: boolean; has_audio_input?: boolean };
  };
  const info = (() => {
    try {
      return anyW.getLoadedContextInfo?.();
    } catch {
      return undefined;
    }
  })();
  const fromCtx = info?.media_marker?.trim();
  if (!anyW.mediaMarker?.trim()) {
    anyW.mediaMarker = fromCtx || DEFAULT_MEDIA_MARKER;
  }
  if (mmRequested && info && !info.has_image_input && !info.has_audio_input) {
    console.warn(
      "[kuno] mmproj was requested but WASM reports no image/audio input — multimodal may fail.",
      info
    );
  }
}

async function toWllamaMessages(messages: ChatMessage[]) {
  return Promise.all(
    messages.map(async (m) => {
      const images = m.images?.filter(Boolean) ?? [];
      const audios = m.audios?.filter(Boolean) ?? [];
      if (m.role === "user" && (images.length > 0 || audios.length > 0)) {
        const content: WllamaContentPart[] = [];
        for (const url of images) {
          content.push({ type: "image", data: await dataUrlToArrayBuffer(url) });
        }
        for (const url of audios) {
          content.push({ type: "audio", data: await audioDataUrlToWav16k(url) });
        }
        const text = m.content.trim() || defaultPromptForMedia(images.length, audios.length);
        content.push({ type: "text", text });
        return { role: m.role, content };
      }
      return { role: m.role, content: m.content };
    })
  );
}

function explainGgufError(source: GgufSource, msg: string): Error {
  if (/Model file not found/i.test(msg)) {
    return new Error(
      `GGUF cache was incomplete for ${source.file}. Cleared local cache — try Load model again. ` +
        `Hub file: ${hfResolveUrl(source.repo, source.file)}. ` +
        `Note: Gemma 4 E4B/12B GGUFs are 3–7GB (often above the browser ~2GB single-buffer limit); ` +
        `a desktop build or a pre-split GGUF may be required.`
    );
  }
  if (/arraybuffer|2\s*gb|quota|memory|too large|oom/i.test(msg)) {
    return new Error(
      `GGUF load failed (file may exceed browser ~2GB limits): ${source.file}. ` +
        `Try Gemma 4 E4B Q2 (MXFP6) or a desktop shell. Original: ${msg}`
    );
  }
  if (/Failed to fetch|HF API error|HTTP 40/i.test(msg)) {
    return new Error(
      `Could not download ${source.repo}/${source.file} from Hugging Face. ` +
        `Check network / HF status. Original: ${msg}`
    );
  }
  return new Error(msg);
}

export async function loadGgufEngine(
  source: GgufSource,
  onProgress?: (p: LoadProgress) => void
): Promise<WllamaHandle> {
  const key = sourceKey(source);
  if (instance && loadedKey === key) {
    return wrapWllama(instance, loadedModalities);
  }

  if (instance) {
    try {
      await instance.exit();
    } catch {
      /* ignore */
    }
    instance = null;
    loadedKey = "";
    loadedModalities = { image: false, audio: false };
  }

  onProgress?.({ progress: 0.02, text: "Starting KunoEngine (wllama / GGUF)…" });
  const paths = await wasmPaths();
  const cacheManager = new CacheManager();

  // Drop incomplete leftovers so wllama does not skip a real re-download.
  try {
    await purgeSourceCache(cacheManager, source);
  } catch {
    /* ignore */
  }

  const wllama = new Wllama(paths, {
    parallelDownloads: 2,
    cacheManager,
    logger: {
      debug: () => undefined,
      log: () => undefined,
      warn: (...args: unknown[]) => console.warn(...args),
      error: (...args: unknown[]) => console.error(...args),
    },
  });

  const mm = source.mmprojFile;
  const loadParams = {
    n_threads: 1,
    n_ctx: 4096,
    n_batch: 512,
    progressCallback: ({ loaded, total }: { loaded: number; total: number }) => {
      const pct = total > 0 ? loaded / total : 0;
      onProgress?.({
        progress: Math.max(0.05, Math.min(0.95, pct)),
        text:
          total > 0
            ? `Downloading GGUF… ${Math.round((loaded / total) * 100)}%`
            : `Downloading GGUF… ${(loaded / (1024 * 1024)).toFixed(0)} MB`,
      });
    },
  };

  const runLoad = async (useCache: boolean) => {
    onProgress?.({
      progress: 0.05,
      text: mm
        ? `Downloading ${source.repo} / ${source.file} + ${mm}…`
        : `Downloading ${source.repo} / ${source.file}…`,
    });
    await wllama.loadModelFromHF(
      {
        repo: source.repo,
        file: source.file,
        ...(mm ? { mmprojFile: mm } : {}),
      },
      { ...loadParams, useCache }
    );
  };

  try {
    await runLoad(true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Model file not found/i.test(msg)) {
      onProgress?.({ progress: 0.04, text: "Clearing broken GGUF cache and retrying…" });
      try {
        await purgeSourceCache(cacheManager, source);
      } catch {
        /* ignore */
      }
      try {
        await runLoad(false);
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : String(e2);
        try {
          await wllama.exit();
        } catch {
          /* ignore */
        }
        throw explainGgufError(source, msg2);
      }
    } else {
      try {
        await wllama.exit();
      } catch {
        /* ignore */
      }
      throw explainGgufError(source, msg);
    }
  }

  instance = wllama;
  loadedKey = key;
  ensureMediaMarker(wllama, Boolean(mm));
  // Gemma 4 QAT + mmproj is any-to-any (image + audio). wllama's probe often
  // only sets has_image_input, leaving has_audio_input false — still allow audio.
  const probed = readModalities(wllama);
  loadedModalities = {
    image: probed.image || Boolean(mm),
    audio: probed.audio || Boolean(mm),
  };

  const bits = [
    loadedModalities.image ? "image" : null,
    loadedModalities.audio ? "audio" : null,
  ]
    .filter(Boolean)
    .join("+");
  onProgress?.({
    progress: 1,
    text: bits ? `KunoEngine ready (GGUF · ${bits})` : "KunoEngine ready (GGUF)",
  });
  return wrapWllama(wllama, loadedModalities);
}

function wrapWllama(wllama: Wllama, modalities: ModalitySupport): WllamaHandle {
  const multimodal = modalities.image || modalities.audio;
  return {
    multimodal,
    modalities,
    chat: {
      completions: {
        create: async (req: Record<string, unknown>) => {
          const messages = await toWllamaMessages((req.messages as ChatMessage[]) ?? []);
          const temperature = (req.temperature as number | undefined) ?? 0.7;
          const maxTokens = (req.max_tokens as number | undefined) ?? 1024;
          const stream = Boolean(req.stream);

          if (stream) {
            const gen = await wllama.createChatCompletion({
              messages,
              temperature,
              max_tokens: maxTokens,
              stream: true,
            });
            return (async function* () {
              for await (const chunk of gen) {
                yield {
                  choices: chunk.choices?.map((c) => ({
                    delta: { content: c.delta?.content ?? undefined },
                  })),
                };
              }
            })();
          }

          return wllama.createChatCompletion({
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: false,
          });
        },
      },
    },
    interruptGenerate: async () => {
      /* AbortSignal preferred */
    },
    unload: async () => {
      try {
        await wllama.exit();
      } catch {
        /* ignore */
      }
      if (instance === wllama) {
        instance = null;
        loadedKey = "";
        loadedModalities = { image: false, audio: false };
      }
    },
  };
}

export async function unloadGgufEngine(): Promise<void> {
  if (!instance) return;
  try {
    await instance.exit();
  } catch {
    /* ignore */
  }
  instance = null;
  loadedKey = "";
  loadedModalities = { image: false, audio: false };
}

export function isGgufEngineLoaded(): boolean {
  return instance !== null;
}

export function getGgufModalities(): ModalitySupport {
  return { ...loadedModalities };
}
