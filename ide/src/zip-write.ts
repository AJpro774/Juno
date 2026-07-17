/** Minimal ZIP writer (store / deflate) for browser downloads. */

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipEntry = {
  path: string;
  data: Uint8Array;
};

async function maybeDeflate(data: Uint8Array): Promise<{ method: number; body: Uint8Array }> {
  if (typeof CompressionStream === "undefined" || data.length < 64) {
    return { method: 0, body: data };
  }
  try {
    const stream = new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    const body = new Uint8Array(await new Response(stream).arrayBuffer());
    if (body.length >= data.length) return { method: 0, body: data };
    return { method: 8, body };
  } catch {
    return { method: 0, body: data };
  }
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Build a ZIP archive from path → bytes entries (paths use `/`). */
export async function buildZip(entries: ZipEntry[]): Promise<Blob> {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = entry.path.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!name || name.endsWith("/")) continue;
    const nameBytes = new TextEncoder().encode(name);
    const { method, body } = await maybeDeflate(entry.data);
    const crc = crc32(entry.data);
    const localHeader = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(method),
      u16(0),
      u16(0),
      u32(crc),
      u32(body.length),
      u32(entry.data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);
    localParts.push(localHeader, body);

    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(method),
      u16(0),
      u16(0),
      u32(crc),
      u32(body.length),
      u32(entry.data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(central);
    offset += localHeader.length + body.length;
  }

  const centralDir = concat(centralParts);
  const locals = concat(localParts);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(centralParts.length),
    u16(centralParts.length),
    u32(centralDir.length),
    u32(locals.length),
    u16(0),
  ]);

  const parts: BlobPart[] = [
    locals.buffer.slice(locals.byteOffset, locals.byteOffset + locals.byteLength) as ArrayBuffer,
    centralDir.buffer.slice(centralDir.byteOffset, centralDir.byteOffset + centralDir.byteLength) as ArrayBuffer,
    end.buffer.slice(end.byteOffset, end.byteOffset + end.byteLength) as ArrayBuffer,
  ];
  return new Blob(parts, { type: "application/zip" });
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
