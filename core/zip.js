// Minimal ZIP reader/writer (store + deflate), isomorphic: no Node or DOM APIs here.
// The caller supplies raw-deflate functions: Node -> zlib.deflateRawSync/inflateRawSync,
// browser -> CompressionStream/DecompressionStream('deflate-raw') (see browserCodec()).
//
//   await createZip([{ path, data: Uint8Array|string }], codec) -> Uint8Array
//   await readZip(bytes, codec, { maxEntry, maxTotal, maxFiles, onEntry }) -> [{ path, data: Uint8Array }]   (directories skipped)
//
// A zip can declare (or inflate to) far more than it holds: an entry or a whole archive above the
// limits is refused before it is inflated, and codec.inflate(data, limit) stops at the entry's size.
// onEntry({ path, size, symlink }), called before an entry is inflated, returns null to read it or the reason
// it is left out (the import gate's check of its name, core/import-gate.js, #2830): a refused entry is never inflated.

/** The default limits of readZip: an entry, the whole archive (uncompressed). */
export const ZIP_LIMITS = Object.freeze({ maxEntry: 64 << 20, maxTotal: 256 << 20 });

const enc = new TextEncoder();
const dec = new TextDecoder();

let CRC_TABLE = null;
function crc32(data) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

const toBytes = d => (typeof d === 'string' ? enc.encode(d) : d instanceof Uint8Array ? d : new Uint8Array(d));

export async function createZip(files, codec) {
  const parts = [], central = [];
  let offset = 0;
  const { time, date } = dosTime();
  for (const f of files) {
    const name = enc.encode(f.path.replace(/\\/g, '/'));
    const raw = toBytes(f.data);
    const crc = crc32(raw);
    let method = 0, body = raw;
    if (raw.length > 64 && codec?.deflate) {
      const z = toBytes(await codec.deflate(raw));
      if (z.length < raw.length) { method = 8; body = z; }
    }
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); // UTF-8 names
    lh.setUint16(8, method, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, body.length, true); lh.setUint32(22, raw.length, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, body);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, method, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, body.length, true); ch.setUint32(24, raw.length, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const cdSize = central.reduce((a, p) => a + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

export async function readZip(bytes, codec, { maxEntry = ZIP_LIMITS.maxEntry, maxTotal = ZIP_LIMITS.maxTotal, maxFiles = Infinity, onEntry = null } = {}) {
  const b = toBytes(bytes);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // find the end-of-central-directory record (it may be followed by a comment)
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = dv.getUint16(eocd + 10, true);
  if (count > maxFiles) throw new Error(`zip has too many entries (${count}, at most ${maxFiles})`);
  let p = dv.getUint32(eocd + 16, true);
  const out = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('corrupt zip central directory');
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const madeBy = dv.getUint16(p + 4, true), attrs = dv.getUint32(p + 38, true), lho = dv.getUint32(p + 42, true);
    const nameBytes = b.subarray(p + 46, p + 46 + nlen);
    const path = flags & 0x0800 ? dec.decode(nameBytes) : Array.from(nameBytes, c => String.fromCharCode(c)).join('');
    p += 46 + nlen + xlen + clen;
    if (path.endsWith('/') || path.startsWith('__MACOSX/') || /(^|\/)\.DS_Store$/.test(path)) continue;
    // (a symbolic link: made on Unix, its mode's file type S_IFLNK)
    const symlink = madeBy >> 8 === 3 && ((attrs >>> 16) & 0o170000) === 0o120000;
    if (onEntry && onEntry({ path, size: usize, symlink }) != null) continue;
    if (flags & 1) throw new Error(`encrypted zip entries are not supported (${path})`);
    const dataStart = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const body = b.subarray(dataStart, dataStart + csize);
    if (usize > maxEntry) throw new Error(`zip entry too large (${path}: ${usize} bytes, at most ${maxEntry})`);
    if ((total += usize) > maxTotal) throw new Error(`zip too large once uncompressed (more than ${maxTotal} bytes)`);
    let data;
    if (method === 0) data = body.slice();
    else if (method === 8) {
      try { data = toBytes(await codec.inflate(body, usize)); }
      catch (e) { throw new Error(`zip entry larger than it declares or corrupt (${path}): ${e.message}`); }
    }
    else throw new Error(`unsupported zip compression method ${method} (${path})`);
    if (data.length !== usize) throw new Error(`zip entry size mismatch (${path})`);
    out.push({ path, data });
  }
  return out;
}

// Raw deflate via the browser's CompressionStream (Chrome 103+, Safari 16.4+, Firefox 113+).
export function browserCodec() {
  const run = async (data, Stream, limit = Infinity) => {
    let s = new Blob([data]).stream().pipeThrough(new Stream('deflate-raw'));
    // inflate: stop as soon as the output goes past the size the entry declares
    let n = 0;
    if (limit !== Infinity) s = s.pipeThrough(new TransformStream({ transform(chunk, c) { if ((n += chunk.length) > limit) c.error(new Error('output above the declared size')); else c.enqueue(chunk); } }));
    return new Uint8Array(await new Response(s).arrayBuffer());
  };
  return {
    deflate: data => run(data, CompressionStream),
    inflate: (data, limit) => run(data, DecompressionStream, limit),
  };
}

export const textOf = entry => dec.decode(entry.data);
