/**
 * Wllama (llama.cpp WASM) backend for HuggingFace GGUF models.
 * Text + image via mmproj (Gemma 4). Audio modality is never exposed.
 */

import { CacheManager, Wllama } from "@wllama/wllama";
import type { ChatMessage, LoadProgress, ModalitySupport } from "./types";
import { dataUrlToArrayBuffer, defaultPromptForMedia } from "./types";

export type GgufSource = {
  repo: string;
  file: string;
  mmprojFile?: string;
};

type WllamaContentPart =
  | { type: "image"; data: ArrayBuffer }
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

function readImageSupport(wllama: Wllama): boolean {
  try {
    return wllama.supportInputModality("image");
  } catch {
    return false;
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
    getLoadedContextInfo?: () => {
      media_marker?: string;
      has_image_input?: boolean;
      has_audio_input?: boolean;
    };
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
      "[kuno] mmproj was requested but WASM reports no image input — multimodal may fail.",
      info
    );
  }
}

async function toWllamaMessages(messages: ChatMessage[]) {
  return Promise.all(
    messages.map(async (m) => {
      const images = m.images?.filter(Boolean) ?? [];
      if (m.role === "user" && images.length > 0) {
        const content: WllamaContentPart[] = [];
        for (const url of images) {
          content.push({ type: "image", data: await dataUrlToArrayBuffer(url) });
        }
        const text = m.content.trim() || defaultPromptForMedia(images.length, 0);
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
        `Note: Gemma 4 E4B GGUFs are ~3–4GB (+ mmproj ~1GB); large loads may exceed browser memory.`
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
    n_ctx: 1024,
    n_batch: 128,
    // Default wllama WebGPU offloads ALL layers → VRAM OOM/(ABORT) on big GGUFs.
    // Keep CPU path to reduce abort risk with mmproj.
    n_gpu_layers: 0,
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
        : `Downloading ${source.repo} / ${source.file} (text)…`,
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
    if (/Model file not found|arraybuffer|2\s*gb/i.test(msg)) {
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
  if (mm) ensureMediaMarker(wllama, true);
  // Text + image only: never claim audio even if the WASM probe reports it.
  loadedModalities = {
    image: (mm ? readImageSupport(wllama) : false) || Boolean(mm),
    audio: false,
  };

  onProgress?.({
    progress: 1,
    text: mm
      ? `KunoEngine ready (GGUF · ${loadedModalities.image ? "image" : "mmproj"})`
      : "KunoEngine ready (GGUF · text)",
  });
  return wrapWllama(wllama, loadedModalities);
}

function wrapWllama(wllama: Wllama, modalities: ModalitySupport): WllamaHandle {
  const multimodal = modalities.image;
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

          try {
            if (stream) {
              const gen = await wllama.createChatCompletion({
                messages,
                temperature,
                max_tokens: maxTokens,
                stream: true,
              });
              return (async function* () {
                try {
                  for await (const chunk of gen) {
                    yield {
                      choices: chunk.choices?.map((c) => ({
                        delta: { content: c.delta?.content ?? undefined },
                      })),
                    };
                  }
                } catch (e) {
                  markEngineDead(wllama);
                  throw e;
                }
              })();
            }

            return await wllama.createChatCompletion({
              messages,
              temperature,
              max_tokens: maxTokens,
              stream: false,
            });
          } catch (e) {
            markEngineDead(wllama);
            throw e;
          }
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

/** After a WASM (ABORT), the worker is dead — drop the cached handle. */
function markEngineDead(wllama: Wllama): void {
  if (instance === wllama) {
    instance = null;
    loadedKey = "";
    loadedModalities = { image: false, audio: false };
  }
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
