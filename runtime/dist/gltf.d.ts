/** Minimal glTF 2.0 JSON loader → custom mesh vertex/index data. */
export type GltfMeshData = {
    positions: Float32Array;
    indices: Uint16Array;
};
/** Parse glTF JSON text into interleaved pos+color verts and indices. */
export type GltfParseOptions = {
    getBufferBytes?: (uri: string) => ArrayBuffer | null;
    /** When set (from .glb), used for buffers that omit `uri` (BIN chunk). */
    glbBinChunk?: ArrayBuffer;
};
export declare function parseGltfJson(text: string, options?: GltfParseOptions): GltfMeshData | null;
export declare function unitCubeMesh(): GltfMeshData;
/** Create a tiny glTF JSON string for a colored triangle (for tests/examples). */
export declare function makeTriangleGltfJson(): string;
/** True when bytes look like a glTF Binary (.glb) container. */
export declare function isGlbBytes(data: ArrayBuffer | Uint8Array): boolean;
/**
 * Parse a glTF Binary (.glb) container into the same mesh data as JSON glTF.
 * Supports JSON + optional BIN chunks (glTF 2.0).
 */
export declare function parseGlb(data: ArrayBuffer | Uint8Array, options?: GltfParseOptions): GltfMeshData | null;
/** Parse glTF from either JSON text or GLB binary bytes. */
export declare function parseGltfOrGlb(input: string | ArrayBuffer | Uint8Array, options?: GltfParseOptions): GltfMeshData | null;
//# sourceMappingURL=gltf.d.ts.map