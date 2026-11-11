// Silinx toolchain - an .xz reader (#2303): the container (its stream, its blocks, LZMA2 as their one filter) and the LZMA
// decoder, as Python's lzma writes Apicula's chip databases (preset 1: LZMA2, a CRC64 or CRC32 check, not verified here:
// the package's SHA-512 checks the whole). Isomorphic, no dependency: unxz(bytes) -> Uint8Array.

const PROB_INIT = 1024;
const probs = n => new Uint16Array(n).fill(PROB_INIT);

// the range decoder over the compressed bytes of an LZMA2 chunk
class RangeDecoder {
  constructor(buf, pos) {
    this.buf = buf; this.pos = pos + 1;   // (the first byte is 0)
    this.range = 0xFFFFFFFF; this.code = 0;
    for (let i = 0; i < 4; i++) this.code = ((this.code << 8) | buf[this.pos++]) >>> 0;
  }
  normalize() {
    if (this.range < 0x1000000) { this.range = (this.range << 8) >>> 0; this.code = ((this.code << 8) | this.buf[this.pos++]) >>> 0; }
  }
  bit(p, i) {
    this.normalize();
    const bound = (this.range >>> 11) * p[i];
    if (this.code < bound) { this.range = bound; p[i] += (2048 - p[i]) >>> 5; return 0; }
    this.range -= bound; this.code -= bound; p[i] -= p[i] >>> 5; return 1;
  }
  direct(n) {
    let r = 0;
    for (; n > 0; n--) {
      this.normalize();
      this.range >>>= 1;
      const t = this.code >= this.range ? 1 : 0;
      if (t) this.code -= this.range;
      r = (r << 1) | t;
    }
    return r >>> 0;
  }
  tree(p, base, bits) { let m = 1; for (let i = 0; i < bits; i++) m = (m << 1) | this.bit(p, base + m); return m - (1 << bits); }
  reverse(p, base, bits) { let m = 1, r = 0; for (let i = 0; i < bits; i++) { const b = this.bit(p, base + m); m = (m << 1) | b; r |= b << i; } return r; }
}

// a length decoder (match or rep lengths)
class LenDecoder {
  constructor(pb) { this.choice = probs(2); this.low = probs(16 << 3); this.mid = probs(16 << 3); this.high = probs(256); this.pb = pb; }
  decode(rc, posState) {
    if (!rc.bit(this.choice, 0)) return rc.tree(this.low, posState << 3, 3);
    if (!rc.bit(this.choice, 1)) return 8 + rc.tree(this.mid, posState << 3, 3);
    return 16 + rc.tree(this.high, 0, 8);
  }
}

class Lzma {
  constructor(out) { this.out = out; this.props(3, 0, 2); }
  props(lc, lp, pb) { this.lc = lc; this.lp = lp; this.pb = pb; this.resetState(); }
  resetState() {
    this.literal = probs(0x300 << (this.lc + this.lp));
    this.isMatch = probs(12 << 4); this.isRep = probs(12); this.isRepG0 = probs(12); this.isRepG1 = probs(12); this.isRepG2 = probs(12);
    this.isRep0Long = probs(12 << 4); this.posSlot = probs(4 << 6); this.posSpecial = probs(115); this.align = probs(16);
    this.len = new LenDecoder(); this.repLen = new LenDecoder();
    this.state = 0; this.reps = [0, 0, 0, 0];
  }
  // decodes `size` bytes of output from the range coder
  run(rc, size) {
    const out = this.out, pbMask = (1 << this.pb) - 1, lpMask = (1 << this.lp) - 1;
    out.reserve(size);
    const buf = out.buf, end = out.n + size;
    let n = out.n, { state } = this; const reps = this.reps;
    while (n < end) {
      const posState = n & pbMask;
      if (!rc.bit(this.isMatch, (state << 4) + posState)) {
        const prev = n ? buf[n - 1] : 0;
        const base = 0x300 * (((n & lpMask) << this.lc) + (prev >>> (8 - this.lc)));
        let sym = 1;
        if (state >= 7) {
          let match = buf[n - reps[0] - 1];
          do {
            const mb = (match >>> 7) & 1; match <<= 1;
            const b = rc.bit(this.literal, base + ((1 + mb) << 8) + sym);
            sym = (sym << 1) | b;
            if (mb !== b) break;
          } while (sym < 0x100);
        }
        while (sym < 0x100) sym = (sym << 1) | rc.bit(this.literal, base + sym);
        buf[n++] = sym & 0xFF;
        state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
        continue;
      }
      let len;
      if (rc.bit(this.isRep, state)) {
        if (!rc.bit(this.isRepG0, state)) {
          if (!rc.bit(this.isRep0Long, (state << 4) + posState)) {
            state = state < 7 ? 9 : 11;
            buf[n] = buf[n - reps[0] - 1]; n++;
            continue;
          }
        } else {
          let dist;
          if (!rc.bit(this.isRepG1, state)) dist = reps[1];
          else {
            if (!rc.bit(this.isRepG2, state)) dist = reps[2];
            else { dist = reps[3]; reps[3] = reps[2]; }
            reps[2] = reps[1];
          }
          reps[1] = reps[0]; reps[0] = dist;
        }
        len = this.repLen.decode(rc, posState);
        state = state < 7 ? 8 : 11;
      } else {
        reps[3] = reps[2]; reps[2] = reps[1]; reps[1] = reps[0];
        len = this.len.decode(rc, posState);
        state = state < 7 ? 7 : 10;
        const slot = rc.tree(this.posSlot, Math.min(len, 3) << 6, 6);
        let dist = slot;
        if (slot >= 4) {
          const bits = (slot >>> 1) - 1;
          dist = (2 | (slot & 1)) << bits;
          if (slot < 14) dist += rc.reverse(this.posSpecial, dist - slot - 1, bits);
          else dist += (rc.direct(bits - 4) << 4) + rc.reverse(this.align, 0, 4);
        }
        reps[0] = dist >>> 0;
      }
      len += 2;
      const from = n - reps[0] - 1;
      if (from < 0) throw new Error('xz: a distance before the data');
      for (let i = 0; i < len && n < end; i++) { buf[n] = buf[from + i]; n++; }
    }
    this.state = state; out.n = n;
  }
}

// the output: its bytes and their count, grown for each chunk
class Window {
  constructor() { this.buf = new Uint8Array(1 << 20); this.n = 0; }
  reserve(k) {
    if (this.n + k <= this.buf.length) return;
    let size = this.buf.length;
    while (size < this.n + k) size *= 2;
    const b = new Uint8Array(size); b.set(this.buf.subarray(0, this.n)); this.buf = b;
  }
  bytes() { return this.buf.slice(0, this.n); }
}

function lzma2(buf, pos, out) {
  const lz = new Lzma(out);
  for (;;) {
    const c = buf[pos++];
    if (c === 0) return pos;
    if (c === 1 || c === 2) {   // uncompressed chunk (1: with a dictionary reset)
      const n = ((buf[pos] << 8) | buf[pos + 1]) + 1; pos += 2;
      out.reserve(n); out.buf.set(buf.subarray(pos, pos + n), out.n); out.n += n;
      pos += n;
      continue;
    }
    if (c < 0x80) throw new Error(`xz: LZMA2 control byte ${c}`);
    const usize = (((c & 0x1F) << 16) | (buf[pos] << 8) | buf[pos + 1]) + 1;
    const csize = ((buf[pos + 2] << 8) | buf[pos + 3]) + 1;
    pos += 4;
    const reset = (c >>> 5) & 3;
    if (reset >= 2) {
      if (reset === 3) {
        let p = buf[pos++];
        const lc = p % 9; p = (p / 9) | 0;
        lz.props(lc, p % 5, (p / 5) | 0);
      } else lz.resetState();
    }
    lz.run(new RangeDecoder(buf, pos), usize);
    pos += csize;
  }
}

const CHECK_SIZE = [0, 4, 4, 4, 8, 8, 8, 16, 16, 16, 32, 32, 32, 64, 64, 64];

/** The bytes of an .xz file (one stream, LZMA2 blocks). */
export function unxz(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const MAGIC = [0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00];
  if (!MAGIC.every((m, i) => b[i] === m)) throw new Error('not an .xz file');
  const check = CHECK_SIZE[b[7] & 0x0F];
  const out = new Window();
  let pos = 12;
  while (b[pos] !== 0) {   // (0: the index)
    const headerSize = (b[pos] + 1) * 4, flags = b[pos + 1];
    if ((flags & 3) !== 0) throw new Error('xz: more than one filter');
    let p = pos + 2;
    const varint = () => { let v = 0, s = 0, x; do { x = b[p++]; v += (x & 0x7F) * 2 ** s; s += 7; } while (x & 0x80); return v; };
    if (flags & 0x40) varint();
    if (flags & 0x80) varint();
    if (varint() !== 0x21) throw new Error('xz: a filter other than LZMA2');
    pos += headerSize;
    const start = pos;
    pos = lzma2(b, pos, out);
    pos += (4 - ((pos - start) % 4)) % 4 + check;
  }
  return out.bytes();
}
