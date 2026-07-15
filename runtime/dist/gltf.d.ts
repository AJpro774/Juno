/** Minimal glTF 2.0 JSON loader → custom mesh vertex/index data. */
export type GltfMeshData = {
    positions: Float32Array;
    indices: Uint16Array;
};
/** Parse glTF JSON text into interleaved pos+color verts and indices. */
export type GltfParseOptions = {
    getBufferBytes?: (uri: string) => ArrayBuffer | null;
};
export declare function parseGltfJson(text: string, options?: GltfParseOptions): GltfMeshData | null;
export declare function unitCubeMesh(): GltfMeshData;
/** Create a tiny glTF JSON string for a colored triangle (for tests/examples). */
export declare function makeTriangleGltfJson(): string;
//# sourceMappingURL=gltf.d.ts.map