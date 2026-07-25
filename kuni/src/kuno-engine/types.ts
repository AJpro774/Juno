export type ChatRole = "system" | "user" | "assistant";

/**
 * Persistable chat message.
 * Media stored as data URLs (sessions / UI); converted to ArrayBuffer for wllama.
 */
export type ChatMessage = {
  role: ChatRole;
  content: string;
  /** Image / video-frame attachments (data URLs). */
  images?: string[];
  /** Audio attachments (data URLs: wav/mp3/ogg/webm). */
  audios?: string[];
};

export type ModalitySupport = {
  image: boolean;
  audio: boolean;
};

export type LoadProgress = {
  progress: number;
  text: string;
};

export type CompleteOptions = {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onToken?: (delta: string, full: string) => void;
  signal?: AbortSignal;
};

export async function dataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(dataUrl);
  return res.arrayBuffer();
}

/**
 * Decode any browser-supported audio (webm/mp3/ogg/…) to 16 kHz mono WAV.
 * Gemma 4 / llama.cpp mtmd expect this layout for audio parts.
 */
export async function audioDataUrlToWav16k(dataUrl: string): Promise<ArrayBuffer> {
  const raw = await dataUrlToArrayBuffer(dataUrl);
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(raw.slice(0));
    let mono = decoded;
    if (decoded.numberOfChannels > 1) {
      const mixed = ctx.createBuffer(1, decoded.length, decoded.sampleRate);
      const out = mixed.getChannelData(0);
      const channels = decoded.numberOfChannels;
      for (let i = 0; i < decoded.length; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += decoded.getChannelData(c)[i]!;
        out[i] = sum / channels;
      }
      mono = mixed;
    }
    const offline = new OfflineAudioContext(
      1,
      Math.max(1, Math.ceil(mono.duration * 16000)),
      16000
    );
    const src = offline.createBufferSource();
    src.buffer = mono;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    return encodeWavPcm16(rendered.getChannelData(0), 16000);
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/** Grab up to `count` JPEG frames from a video file for vision models. */
export async function videoFileToFrames(
  file: File,
  count = 3
): Promise<string[]> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not decode video"));
    });

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const times: number[] = [];
    for (let i = 0; i < count; i++) {
      times.push(((i + 0.5) / count) * duration);
    }

    const canvas = document.createElement("canvas");
    const frames: string[] = [];
    for (const t of times) {
      await seekVideo(video, t);
      const w = video.videoWidth || 640;
      const h = video.videoHeight || 360;
      const max = 1280;
      const scale = Math.min(1, max / Math.max(w, h));
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.85));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Video seek failed"));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    try {
      video.currentTime = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.05));
    } catch (e) {
      cleanup();
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

export function defaultPromptForMedia(images: number, audios: number): string {
  if (images && audios) return "Describe the attached image(s) and audio.";
  if (audios) return "Transcribe or describe this audio.";
  if (images) return "Describe this image.";
  return "";
}
