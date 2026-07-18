/** Audio intrinsics: load/play/loop/stop, per-handle volume, master bus. */
import type { AssetPack, MemoryRef } from "./types.js";
export type AudioHandlers = {
    audio_load: (ptr: number) => number;
    audio_play: (handle: number) => void;
    audio_play_loop: (handle: number) => void;
    audio_set_volume: (handle: number, volume: number) => void;
    audio_stop: (handle: number) => void;
    /** Master bus gain in [0, 1]. */
    audio_set_bus_volume: (volume: number) => void;
};
export declare function createAudioHandlers(options: {
    memoryRef: MemoryRef;
    assetPack?: AssetPack | null;
    assetBaseUrl?: string;
}): AudioHandlers;
/** Node / headless stub when Web Audio is unavailable. */
export declare function createAudioStubs(): AudioHandlers;
//# sourceMappingURL=audio.d.ts.map