/** Audio intrinsics: audio_load, audio_play, audio_play_loop, audio_set_volume. */
import { readStr } from "./memory.js";
function mimeForAudio(path) {
    if (path.endsWith(".wav"))
        return "audio/wav";
    if (path.endsWith(".ogg"))
        return "audio/ogg";
    return "audio/mpeg";
}
export function createAudioHandlers(options) {
    const memoryRef = options.memoryRef;
    const pack = options.assetPack ?? null;
    const assetBaseUrl = options.assetBaseUrl ?? "";
    const buffers = new Map();
    const volumes = new Map();
    let sharedCtx = null;
    function getCtx() {
        if (typeof AudioContext === "undefined")
            return null;
        if (!sharedCtx)
            sharedCtx = new AudioContext();
        return sharedCtx;
    }
    function lookup(path) {
        if (!pack?.assets)
            return null;
        return pack.assets[path] ?? null;
    }
    async function ensureBuffer(entry) {
        if (buffers.has(entry.id))
            return;
        const ctx = getCtx();
        if (!ctx)
            return;
        let url;
        if (entry.embed) {
            url = `data:${mimeForAudio(entry.path)};base64,${entry.embed}`;
        }
        else {
            const base = assetBaseUrl.endsWith("/") ? assetBaseUrl : `${assetBaseUrl}/`;
            url = `${base}${entry.path}`;
        }
        if (typeof fetch === "undefined")
            return;
        const resp = await fetch(url);
        if (!resp.ok)
            return;
        const data = await resp.arrayBuffer();
        const buf = await ctx.decodeAudioData(data.slice(0));
        buffers.set(entry.id, buf);
    }
    function play(handle, loop) {
        const ctx = getCtx();
        if (!ctx)
            return;
        const buf = buffers.get(handle | 0);
        if (!buf)
            return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = loop;
        const gain = ctx.createGain();
        gain.gain.value = volumes.get(handle | 0) ?? 1;
        src.connect(gain);
        gain.connect(ctx.destination);
        src.start();
    }
    return {
        audio_load(ptr) {
            const memory = memoryRef.current;
            if (!memory)
                return 0;
            const path = readStr(memory, ptr);
            const entry = lookup(path);
            if (!entry)
                return 0;
            if (entry.kind === "audio") {
                ensureBuffer(entry).catch(() => { });
            }
            return entry.id | 0;
        },
        audio_play(handle) {
            play(handle, false);
        },
        audio_play_loop(handle) {
            play(handle, true);
        },
        audio_set_volume(handle, volume) {
            volumes.set(handle | 0, Math.max(0, Math.min(1, volume)));
        },
    };
}
/** Node / headless stub when Web Audio is unavailable. */
export function createAudioStubs() {
    let next = 1;
    return {
        audio_load: () => next++ | 0,
        audio_play: () => { },
        audio_play_loop: () => { },
        audio_set_volume: () => { },
    };
}
//# sourceMappingURL=audio.js.map