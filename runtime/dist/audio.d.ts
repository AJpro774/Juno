/** Audio intrinsics: audio_load, audio_play. */
import type { AssetPack, MemoryRef } from "./types.js";
export type AudioHandlers = {
    audio_load: (ptr: number) => number;
    audio_play: (handle: number) => void;
};
export declare function createAudioHandlers(options: {
    memoryRef: MemoryRef;
    assetPack?: AssetPack | null;
    assetBaseUrl?: string;
}): AudioHandlers;
/** Node / headless stub when Web Audio is unavailable. */
export declare function createAudioStubs(): AudioHandlers;
//# sourceMappingURL=audio.d.ts.map