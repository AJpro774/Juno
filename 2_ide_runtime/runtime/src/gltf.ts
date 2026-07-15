/** Minimal glTF 2.0 JSON loader → custom mesh vertex/index data. */

export type GltfMeshData = {
  positions: Float32Array; // interleaved pos(3) + color(3)
  indices: Uint16Array;
};

type GltfJson = {
  accessors?: Array<{
    bufferView?: number;
    componentType: number;
    count: number;
    type: string;
    max?: number[];
    min?: number[];
  }>;
  bufferViews?: Array<{
    buffer: number;
    byteOffset?: number;
    byteLength: number;
  }>;
  buffers?: Array<{ uri?: string; byteLength: number }>;
  meshes?: Array<{
    primitives: Array<{
      attributes: { POSITION?: number; COLOR_0?: number };
      indices?: number;
    }>;
  }>;
};

function decodeBase64Buffer(uri: string): ArrayBuffer | null {
  const prefix = "data:application/octet-stream;base64,";
  const prefix2 = "data:application/gltf-buffer;base64,";
  let b64: string | null = null;
  if (uri.startsWith(prefix)) b64 = uri.slice(prefix.length);
  else if (uri.startsWith(prefix2)) b64 = uri.slice(prefix2.length);
  if (!b64) return null;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function readAccessor(
  gltf: GltfJson,
  buffers: ArrayBuffer[],
  accessorIndex: number
): { data: Float32Array | Uint16Array; count: number; comps: number } | null {
  const acc = gltf.accessors?.[accessorIndex];
  if (!acc || acc.bufferView === undefined) return null;
  const bv = gltf.bufferViews?.[acc.bufferView];
  if (!bv) return null;
  const buf = buffers[bv.buffer];
  if (!buf) return null;
  const offset = (bv.byteOffset ?? 0);
  const comps =
    acc.type === "VEC3" ? 3 : acc.type === "VEC2" ? 2 : acc.type === "SCALAR" ? 1 : 3;
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
    for (let i = 0; i < acc.count; i++) u16[i] = u32[i] & 0xffff;
    return { data: u16, count: acc.count, comps: 1 };
  }
  return null;
}

/** Parse glTF JSON text into interleaved pos+color verts and indices. */
export type GltfParseOptions = {
  getBufferBytes?: (uri: string) => ArrayBuffer | null;
};

export function parseGltfJson(
  text: string,
  options: GltfParseOptions = {}
): GltfMeshData | null {
  let gltf: GltfJson;
  try {
    gltf = JSON.parse(text) as GltfJson;
  } catch {
    return null;
  }
  const buffers: ArrayBuffer[] = [];
  for (const b of gltf.buffers ?? []) {
    if (b.uri) {
      const decoded = decodeBase64Buffer(b.uri);
      if (decoded) buffers.push(decoded);
      else {
        const external = options.getBufferBytes?.(b.uri) ?? null;
        buffers.push(external ?? new ArrayBuffer(b.byteLength));
      }
    } else {
      buffers.push(new ArrayBuffer(b.byteLength));
    }
  }

  const mesh = gltf.meshes?.[0];
  if (!mesh?.primitives?.length) return unitCubeMesh();

  // Merge all primitives into one mesh
  const allPos: number[] = [];
  const allIdx: number[] = [];
  let vertBase = 0;

  for (const prim of mesh.primitives) {
    if (prim.attributes.POSITION === undefined) continue;
    const posAcc = readAccessor(gltf, buffers, prim.attributes.POSITION);
    if (!posAcc || !(posAcc.data instanceof Float32Array)) continue;

    let colors: Float32Array | null = null;
    if (prim.attributes.COLOR_0 !== undefined) {
      const c = readAccessor(gltf, buffers, prim.attributes.COLOR_0);
      if (c && c.data instanceof Float32Array) colors = c.data;
    }

    for (let i = 0; i < posAcc.count; i++) {
      allPos.push(posAcc.data[i * 3], posAcc.data[i * 3 + 1], posAcc.data[i * 3 + 2]);
      if (colors && colors.length >= (i + 1) * 3) {
        allPos.push(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
      } else {
        allPos.push(0.75, 0.75, 0.8);
      }
    }

    if (prim.indices !== undefined) {
      const idx = readAccessor(gltf, buffers, prim.indices);
      if (idx && idx.data instanceof Uint16Array) {
        for (let i = 0; i < idx.count; i++) allIdx.push(idx.data[i] + vertBase);
      } else {
        for (let i = 0; i < posAcc.count; i++) allIdx.push(i + vertBase);
      }
    } else {
      for (let i = 0; i < posAcc.count; i++) allIdx.push(i + vertBase);
    }
    vertBase += posAcc.count;
  }

  if (!allPos.length) return unitCubeMesh();
  return {
    positions: new Float32Array(allPos),
    indices: new Uint16Array(allIdx),
  };
}

export function unitCubeMesh(): GltfMeshData {
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
export function makeTriangleGltfJson(): string {
  // positions: (0,1,0), (1,-1,0), (-1,-1,0)
  const pos = new Float32Array([0, 1, 0, 1, -1, 0, -1, -1, 0]);
  const idx = new Uint16Array([0, 1, 2]);
  const posBytes = new Uint8Array(pos.buffer);
  const idxBytes = new Uint8Array(idx.buffer);
  const combined = new Uint8Array(posBytes.length + idxBytes.length);
  combined.set(posBytes, 0);
  combined.set(idxBytes, posBytes.length);
  let b64 = "";
  for (let i = 0; i < combined.length; i++) b64 += String.fromCharCode(combined[i]);
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
