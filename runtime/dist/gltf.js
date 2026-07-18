/** Minimal glTF 2.0 JSON loader → custom mesh vertex/index data. */
function decodeBase64Buffer(uri) {
    const prefix = "data:application/octet-stream;base64,";
    const prefix2 = "data:application/gltf-buffer;base64,";
    let b64 = null;
    if (uri.startsWith(prefix))
        b64 = uri.slice(prefix.length);
    else if (uri.startsWith(prefix2))
        b64 = uri.slice(prefix2.length);
    if (!b64)
        return null;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        out[i] = bin.charCodeAt(i);
    return out.buffer;
}
function readAccessor(gltf, buffers, accessorIndex) {
    const acc = gltf.accessors?.[accessorIndex];
    if (!acc || acc.bufferView === undefined)
        return null;
    const bv = gltf.bufferViews?.[acc.bufferView];
    if (!bv)
        return null;
    const buf = buffers[bv.buffer];
    if (!buf)
        return null;
    const offset = (bv.byteOffset ?? 0);
    const comps = acc.type === "VEC3" ? 3 : acc.type === "VEC2" ? 2 : acc.type === "SCALAR" ? 1 : 3;
    if (acc.componentType === 5126) {
        return {
            data: new Float32Array(buf, offset, acc.count * comps),
            count: acc.count,
            comps,
        };
    }
    if (acc.componentType === 5123) {
        return {
            data: new Uint16Array(buf, offset, acc.count),
            count: acc.count,
            comps: 1,
        };
    }
    if (acc.componentType === 5125) {
        const u32 = new Uint32Array(buf, offset, acc.count);
        const u16 = new Uint16Array(acc.count);
        for (let i = 0; i < acc.count; i++)
            u16[i] = u32[i] & 0xffff;
        return { data: u16, count: acc.count, comps: 1 };
    }
    return null;
}
export function parseGltfJson(text, options = {}) {
    let gltf;
    try {
        gltf = JSON.parse(text);
    }
    catch {
        return null;
    }
    const buffers = [];
    for (const b of gltf.buffers ?? []) {
        if (b.uri) {
            const decoded = decodeBase64Buffer(b.uri);
            if (decoded)
                buffers.push(decoded);
            else {
                const external = options.getBufferBytes?.(b.uri) ?? null;
                buffers.push(external ?? new ArrayBuffer(b.byteLength));
            }
        }
        else if (options.glbBinChunk) {
            buffers.push(options.glbBinChunk);
        }
        else {
            buffers.push(new ArrayBuffer(b.byteLength));
        }
    }
    const meshIndex = gltf.scenes?.[gltf.scene ?? 0]?.nodes
        ?.map((ni) => gltf.nodes?.[ni]?.mesh)
        .find((m) => m !== undefined) ?? 0;
    const mesh = gltf.meshes?.[meshIndex ?? 0] ?? gltf.meshes?.[0];
    if (!mesh?.primitives?.length)
        return unitCubeMesh();
    // Merge all primitives into one mesh (supports multi-primitive + NORMAL-derived tint)
    const allPos = [];
    const allIdx = [];
    let vertBase = 0;
    for (const prim of mesh.primitives) {
        if (prim.attributes.POSITION === undefined)
            continue;
        const posAcc = readAccessor(gltf, buffers, prim.attributes.POSITION);
        if (!posAcc || !(posAcc.data instanceof Float32Array))
            continue;
        let colors = null;
        if (prim.attributes.COLOR_0 !== undefined) {
            const c = readAccessor(gltf, buffers, prim.attributes.COLOR_0);
            if (c && c.data instanceof Float32Array)
                colors = c.data;
        }
        let normals = null;
        if (prim.attributes.NORMAL !== undefined) {
            const n = readAccessor(gltf, buffers, prim.attributes.NORMAL);
            if (n && n.data instanceof Float32Array)
                normals = n.data;
        }
        for (let i = 0; i < posAcc.count; i++) {
            allPos.push(posAcc.data[i * 3], posAcc.data[i * 3 + 1], posAcc.data[i * 3 + 2]);
            if (colors && colors.length >= (i + 1) * 3) {
                allPos.push(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
            }
            else if (normals && normals.length >= (i + 1) * 3) {
                // Derive a soft shade from normals when COLOR_0 is absent.
                const ny = normals[i * 3 + 1];
                const nz = normals[i * 3 + 2];
                const shade = 0.45 + 0.35 * Math.max(0, ny) + 0.2 * Math.max(0, -nz);
                allPos.push(0.55 + 0.25 * shade, 0.6 + 0.2 * shade, 0.7 + 0.15 * shade);
            }
            else {
                allPos.push(0.75, 0.75, 0.8);
            }
        }
        if (prim.indices !== undefined) {
            const idx = readAccessor(gltf, buffers, prim.indices);
            if (idx && idx.data instanceof Uint16Array) {
                for (let i = 0; i < idx.count; i++)
                    allIdx.push(idx.data[i] + vertBase);
            }
            else if (idx && idx.data instanceof Float32Array) {
                for (let i = 0; i < idx.count; i++)
                    allIdx.push((idx.data[i] | 0) + vertBase);
            }
            else {
                for (let i = 0; i < posAcc.count; i++)
                    allIdx.push(i + vertBase);
            }
        }
        else {
            for (let i = 0; i < posAcc.count; i++)
                allIdx.push(i + vertBase);
        }
        vertBase += posAcc.count;
    }
    if (!allPos.length)
        return unitCubeMesh();
    return {
        positions: new Float32Array(allPos),
        indices: new Uint16Array(allIdx),
    };
}
export function unitCubeMesh() {
    const positions = new Float32Array([
        -1, -1, 1, 0.2, 0.9, 0.6, 1, -1, 1, 0.2, 0.9, 0.6, 1, 1, 1, 0.95, 0.55, 0.2, -1, 1, 1, 0.95, 0.55, 0.2,
        -1, -1, -1, 0.3, 0.55, 1, 1, -1, -1, 0.3, 0.55, 1, 1, 1, -1, 0.9, 0.3, 0.5, -1, 1, -1, 0.9, 0.3, 0.5,
    ]);
    const indices = new Uint16Array([
        0, 1, 2, 0, 2, 3, 1, 5, 6, 1, 6, 2, 5, 4, 7, 5, 7, 6, 4, 0, 3, 4, 3, 7, 3, 2, 6, 3, 6, 7, 4, 5, 1, 4, 1, 0,
    ]);
    return { positions, indices };
}
/** Create a tiny glTF JSON string for a colored triangle (for tests/examples). */
export function makeTriangleGltfJson() {
    // positions: (0,1,0), (1,-1,0), (-1,-1,0)
    const pos = new Float32Array([0, 1, 0, 1, -1, 0, -1, -1, 0]);
    const idx = new Uint16Array([0, 1, 2]);
    const posBytes = new Uint8Array(pos.buffer);
    const idxBytes = new Uint8Array(idx.buffer);
    const combined = new Uint8Array(posBytes.length + idxBytes.length);
    combined.set(posBytes, 0);
    combined.set(idxBytes, posBytes.length);
    let b64 = "";
    for (let i = 0; i < combined.length; i++)
        b64 += String.fromCharCode(combined[i]);
    const encoded = btoa(b64);
    return JSON.stringify({
        asset: { version: "2.0" },
        buffers: [
            {
                byteLength: combined.length,
                uri: `data:application/octet-stream;base64,${encoded}`,
            },
        ],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: posBytes.length },
            { buffer: 0, byteOffset: posBytes.length, byteLength: idxBytes.length },
        ],
        accessors: [
            {
                bufferView: 0,
                componentType: 5126,
                count: 3,
                type: "VEC3",
                max: [1, 1, 0],
                min: [-1, -1, 0],
            },
            { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    });
}
const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_CHUNK_JSON = 0x4e4f534a; // "JSON"
const GLB_CHUNK_BIN = 0x004e4942; // "BIN\0"
/** True when bytes look like a glTF Binary (.glb) container. */
export function isGlbBytes(data) {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (u8.byteLength < 12)
        return false;
    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    return view.getUint32(0, true) === GLB_MAGIC;
}
/**
 * Parse a glTF Binary (.glb) container into the same mesh data as JSON glTF.
 * Supports JSON + optional BIN chunks (glTF 2.0).
 */
export function parseGlb(data, options = {}) {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (u8.byteLength < 12)
        return null;
    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (view.getUint32(0, true) !== GLB_MAGIC)
        return null;
    const version = view.getUint32(4, true);
    if (version !== 2)
        return null;
    let offset = 12;
    let jsonText = null;
    let binChunk = null;
    while (offset + 8 <= u8.byteLength) {
        const chunkLen = view.getUint32(offset, true);
        const chunkType = view.getUint32(offset + 4, true);
        offset += 8;
        if (offset + chunkLen > u8.byteLength)
            break;
        const chunkBytes = u8.subarray(offset, offset + chunkLen);
        offset += chunkLen;
        if (chunkType === GLB_CHUNK_JSON) {
            // JSON chunk is padded with spaces (0x20)
            let end = chunkBytes.length;
            while (end > 0 && chunkBytes[end - 1] === 0x20)
                end--;
            jsonText = new TextDecoder("utf-8").decode(chunkBytes.subarray(0, end));
        }
        else if (chunkType === GLB_CHUNK_BIN) {
            binChunk = chunkBytes.slice().buffer;
        }
    }
    if (!jsonText)
        return null;
    return parseGltfJson(jsonText, {
        ...options,
        glbBinChunk: binChunk ?? options.glbBinChunk,
    });
}
/** Parse glTF from either JSON text or GLB binary bytes. */
export function parseGltfOrGlb(input, options = {}) {
    if (typeof input === "string") {
        return parseGltfJson(input, options);
    }
    if (isGlbBytes(input)) {
        return parseGlb(input, options);
    }
    try {
        const text = new TextDecoder("utf-8").decode(input instanceof Uint8Array ? input : new Uint8Array(input));
        return parseGltfJson(text, options);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=gltf.js.map