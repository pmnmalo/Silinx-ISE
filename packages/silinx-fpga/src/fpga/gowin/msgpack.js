// Silinx toolchain - a MessagePack reader (#2303) for Apicula's chip databases: maps as Map, their tuple keys (arrays of
// integers) as the string of their numbers joined by ',' ("3,-7"), arrays as arrays, bin as Uint8Array, str, numbers,
// nil, booleans. Isomorphic, no dependency: unpack(bytes) -> value.

const td = new TextDecoder();

/** The value of MessagePack bytes. */
export function unpack(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 0;
  const str = n => { const s = td.decode(b.subarray(p, p + n)); p += n; return s; };
  const bin = n => { const s = b.slice(p, p + n); p += n; return s; };
  const arr = n => { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = obj(); return a; };
  const map = n => {
    const m = new Map();
    for (let i = 0; i < n; i++) {
      const k = obj();
      m.set(Array.isArray(k) ? k.join(',') : k, obj());
    }
    return m;
  };
  function obj() {
    const t = b[p++];
    if (t <= 0x7F) return t;
    if (t >= 0xE0) return t - 256;
    if (t >= 0x80 && t <= 0x8F) return map(t & 0x0F);
    if (t >= 0x90 && t <= 0x9F) return arr(t & 0x0F);
    if (t >= 0xA0 && t <= 0xBF) return str(t & 0x1F);
    let v;
    switch (t) {
      case 0xC0: return null;
      case 0xC2: return false;
      case 0xC3: return true;
      case 0xC4: v = b[p]; p += 1; return bin(v);
      case 0xC5: v = dv.getUint16(p); p += 2; return bin(v);
      case 0xC6: v = dv.getUint32(p); p += 4; return bin(v);
      case 0xCA: v = dv.getFloat32(p); p += 4; return v;
      case 0xCB: v = dv.getFloat64(p); p += 8; return v;
      case 0xCC: return b[p++];
      case 0xCD: v = dv.getUint16(p); p += 2; return v;
      case 0xCE: v = dv.getUint32(p); p += 4; return v;
      case 0xCF: v = Number(dv.getBigUint64(p)); p += 8; return v;
      case 0xD0: v = dv.getInt8(p); p += 1; return v;
      case 0xD1: v = dv.getInt16(p); p += 2; return v;
      case 0xD2: v = dv.getInt32(p); p += 4; return v;
      case 0xD3: v = Number(dv.getBigInt64(p)); p += 8; return v;
      case 0xD9: v = b[p]; p += 1; return str(v);
      case 0xDA: v = dv.getUint16(p); p += 2; return str(v);
      case 0xDB: v = dv.getUint32(p); p += 4; return str(v);
      case 0xDC: v = dv.getUint16(p); p += 2; return arr(v);
      case 0xDD: v = dv.getUint32(p); p += 4; return arr(v);
      case 0xDE: v = dv.getUint16(p); p += 2; return map(v);
      case 0xDF: v = dv.getUint32(p); p += 4; return map(v);
      default: throw new Error(`msgpack: type 0x${t.toString(16)}`);
    }
  }
  return obj();
}
