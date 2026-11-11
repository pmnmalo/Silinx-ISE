// Silinx toolchain - Apicula's chip database of a Gowin device from YoWASP's package (#2303): @yowasp/nextpnr-himbaechel-gowin
// ships Apicula's wheel (its Python, its .msgpack.xz databases) in its resources, a tar in parts (gen/<name>-resources.<n>.tar);
// the wheel is a zip. Silinx reads the one database it needs from there (it ships none of Apicula's data: chipdb.js).
// readPart(i) -> the bytes of part i, or null past the last. Isomorphic; inflate: the zip's deflate (DecompressionStream).

const td = new TextDecoder();

// the parts as one byte sequence, read by offset (they are not joined: about 180 MB)
function joined(parts) {
  const starts = [];
  let total = 0;
  for (const p of parts) { starts.push(total); total += p.length; }
  const slice = (at, n) => {
    const out = new Uint8Array(n);
    let i = starts.findLastIndex(s => s <= at), o = 0;
    while (o < n && i < parts.length) {
      const p = parts[i], from = at + o - starts[i], k = Math.min(n - o, p.length - from);
      out.set(p.subarray(from, from + k), o); o += k; i++;
    }
    return out;
  };
  return { total, slice };
}

/** The bytes of the file of a tar (in parts) whose name matches `re`: { name, bytes } or null. */
export function tarFind(parts, re) {
  const t = joined(parts);
  let long = null;
  for (let at = 0; at + 512 <= t.total;) {
    const h = t.slice(at, 512);
    if (h[0] === 0) break;
    const field = (o, n) => td.decode(h.subarray(o, o + n)).replace(/\0.*$/s, '');
    const size = parseInt(field(124, 12).trim() || '0', 8), type = String.fromCharCode(h[156]);
    const body = at + 512;
    if (type === 'L' || type === 'x') {
      const s = td.decode(t.slice(body, size));
      long = type === 'L' ? s.replace(/\0.*$/s, '') : (/(?:^|\n)\d+ path=([^\n]*)\n/.exec(s)?.[1] ?? long);
    } else {
      const prefix = field(345, 155), name = long ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
      long = null;
      if ((type === '0' || type === '\0') && re.test(name)) return { name, bytes: t.slice(body, size) };
    }
    at = body + Math.ceil(size / 512) * 512;
  }
  return null;
}

async function inflateRaw(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** An entry of a zip by its name: its bytes (stored or deflated), or null. */
export async function zipEntry(zip, name) {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let e = zip.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054B50) e--;
  if (e < 0) throw new Error('not a zip');
  let p = dv.getUint32(e + 16, true);
  const n = dv.getUint16(e + 10, true);
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
    if (td.decode(zip.subarray(p + 46, p + 46 + nlen)) === name) {
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const data = zip.subarray(start, start + csize);
      if (method === 0) return data.slice();
      if (method === 8) return inflateRaw(data);
      throw new Error(`zip: method ${method}`);
    }
    p += 46 + nlen + xlen + clen;
  }
  return null;
}

/** Apicula's database of a device ('GW1N-9C') from the package's resource parts: its .msgpack.xz bytes. */
export async function apyculaDatabase(readPart, device) {
  const parts = [];
  for (let i = 0; ; i++) {
    const p = await readPart(i);
    if (!p) break;
    parts.push(p instanceof Uint8Array ? p : new Uint8Array(p));
  }
  if (!parts.length) throw new Error('no resources in nextpnr-himbaechel-gowin\'s package');
  const wheel = tarFind(parts, /(^|\/)python\/apycula-[^/]*\.whl$/);
  if (!wheel) throw new Error('no Apicula wheel in nextpnr-himbaechel-gowin\'s package');
  const db = await zipEntry(wheel.bytes, `apycula/${device}.msgpack.xz`);
  if (!db) throw new Error(`no chip database of the ${device} in ${wheel.name.split('/').pop()}`);
  return db;
}
