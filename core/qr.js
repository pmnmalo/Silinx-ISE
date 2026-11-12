// A QR code of a link (#3637): Share Project…'s (a copy's, or the live sharing's), for a phone or another computer to
// scan off the teacher's screen. A small encoder of ISO/IEC 18004's (model 2), made here, with no network: the text's
// UTF-8 bytes in byte mode, the smallest version (1 to 40) that holds them at the lowest error correction (L), then the
// highest correction that still fits that version (M, Q, H: a projector's glare forgives more), the mask of the least
// penalty. A text longer than a QR code holds (QR_MAX_BYTES, version 40-L) has none: qrCode returns null. Isomorphic.

export const QR_MAX_BYTES = 2953;
const LEVELS = ['L', 'M', 'Q', 'H'];
const FORMAT = { L: 1, M: 0, Q: 3, H: 2 };
// per level, per version (index 0 unused): the error correction codewords of a block, and the number of blocks
const ECC_PER_BLOCK = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
const BLOCKS = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

// the modules of a version that hold data and correction (all but the function patterns)
function rawModules(ver) {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) { const a = Math.floor(ver / 7) + 2; n -= (25 * a - 10) * a - 55; if (ver >= 7) n -= 36; }
  return n;
}
const dataCodewords = (ver, lv) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[lv][ver] * BLOCKS[lv][ver];
// the bits a byte-mode segment of n bytes takes: its mode, its count, its bytes
const segmentBits = (ver, n) => 4 + (ver <= 9 ? 8 : 16) + 8 * n;

/** How many bytes a text is in a QR code (its UTF-8). */
export const qrBytes = text => new TextEncoder().encode(String(text)).length;
/** Whether a text fits a QR code. */
export const qrFits = text => qrBytes(text) <= QR_MAX_BYTES;

// GF(256), modulo x^8 + x^4 + x^3 + x^2 + 1
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z & 0xff;
}
function rsDivisor(degree) {
  const r = new Array(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) { r[j] = gfMul(r[j], root); if (j + 1 < degree) r[j] ^= r[j + 1]; }
    root = gfMul(root, 2);
  }
  return r;
}
function rsRemainder(data, divisor) {
  const r = new Array(divisor.length).fill(0);
  for (const b of data) {
    const f = b ^ r.shift();
    r.push(0);
    divisor.forEach((d, i) => { r[i] ^= gfMul(d, f); });
  }
  return r;
}

// the data codewords: the byte segment, its terminator, the padding
function codewords(bytes, ver, lv) {
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4);
  put(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const cap = dataCodewords(ver, lv) * 8;
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - bits.length % 8) % 8);
  for (let p = 0xec; bits.length < cap; p ^= 0xec ^ 0x11) put(p, 8);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  return out;
}
// the blocks, each with its correction, interleaved
function interleave(data, ver, lv) {
  const nb = BLOCKS[lv][ver], ecc = ECC_PER_BLOCK[lv][ver], raw = Math.floor(rawModules(ver) / 8);
  const short = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(ecc), blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - ecc + (i < short ? 0 : 1));
    k += dat.length;
    const e = rsRemainder(dat, div);
    if (i < short) dat.push(0);
    blocks.push(dat.concat(e));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecc || j >= short) out.push(b[i]); });
  return out;
}

function alignments(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const r = [6];
  for (let p = size - 7; r.length < n; p -= step) r.splice(1, 0, p);
  return r;
}

// the symbol of a version: its function patterns, its codewords; masked by `mask`
function symbol(ver, lv, cw, mask) {
  const size = ver * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = alignments(ver), last = al.length - 1;
  al.forEach((ax, i) => al.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  // the format: its level and mask, BCH(15,5), twice
  const fd = (FORMAT[lv] << 3) | mask;
  let rem = fd;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const fb = ((fd << 10) | rem) ^ 0x5412, bit = (v, i) => ((v >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) set(8, i, bit(fb, i));
  set(8, 7, bit(fb, 6)); set(8, 8, bit(fb, 7)); set(7, 8, bit(fb, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(fb, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(fb, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(fb, i));
  set(8, size - 8, true);
  // the version (7 and up): BCH(18,6), twice
  if (ver >= 7) {
    let r = ver;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const vb = (ver << 12) | r;
    for (let i = 0; i < 18; i++) { const a = size - 11 + i % 3, b = Math.floor(i / 3); set(a, b, bit(vb, i)); set(b, a, bit(vb, i)); }
  }
  // the codewords, two columns at a time, up and down from the bottom right
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - v : v;
      if (!fn[y][x] && i < cw.length * 8) { m[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
    }
  }
  const MASKS = [(x, y) => (x + y) % 2, (x, y) => y % 2, x => x % 3, (x, y) => (x + y) % 3, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2,
    (x, y) => x * y % 2 + x * y % 3, (x, y) => (x * y % 2 + x * y % 3) % 2, (x, y) => ((x + y) % 2 + x * y % 3) % 2];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y) === 0) m[y][x] = !m[y][x];
  return m;
}

// a mask's penalty (the standard's four rules)
function penalty(m) {
  const size = m.length;
  let p = 0, dark = 0;
  const lines = [];
  for (let y = 0; y < size; y++) { lines.push(m[y]); lines.push(m.map(r => r[y])); }
  const finder = [true, false, true, true, true, false, true];
  for (const l of lines) {
    for (let i = 0, run = 1; i < size; i++, run++) {
      if (i === size - 1 || l[i] !== l[i + 1]) { if (run >= 5) p += run - 2; run = 0; }
    }
    for (let i = 0; i + 7 <= size; i++) {
      if (!finder.every((v, k) => l[i + k] === v)) continue;
      const light = (a, b) => { for (let k = a; k < b; k++) if (k >= 0 && k < size && l[k]) return false; return true; };
      if (light(i - 4, i) || light(i + 7, i + 11)) p += 40;
    }
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (m[y][x]) dark++;
    if (x + 1 < size && y + 1 < size && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
  }
  return p + (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
}

/** The QR code of a text: { version, level, mask, size, modules (rows of booleans, true dark) }; null when the text
 *  is longer than a QR code holds. (`mask`: that one, not the least penalty's.) */
export function qrCode(text, { mask: only = null } = {}) {
  const bytes = new TextEncoder().encode(String(text));
  let ver = 1;
  while (ver <= 40 && segmentBits(ver, bytes.length) > dataCodewords(ver, 'L') * 8) ver++;
  if (ver > 40) return null;
  let level = 'L';
  for (const lv of LEVELS.slice(1)) if (segmentBits(ver, bytes.length) <= dataCodewords(ver, lv) * 8) level = lv;
  const cw = interleave(codewords(bytes, ver, level), ver, level);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    if (only !== null && mask !== only) continue;
    const modules = symbol(ver, level, cw, mask), p = penalty(modules);
    if (!best || p < best.p) best = { p, mask, modules };
  }
  return { version: ver, level, mask: best.mask, size: ver * 4 + 17, modules: best.modules };
}

/** The QR code of a text as an SVG (black on white, a quiet zone of `border` modules, one module a unit of its
 *  viewBox); null when the text is too long. */
export function qrSvg(text, { border = 4 } = {}) {
  const q = qrCode(text);
  if (!q) return null;
  const n = q.size + 2 * border;
  let d = '';
  q.modules.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + border},${y + border}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
