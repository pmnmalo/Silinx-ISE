// 4-state logic values on top of BigInt.
// A value is { w, v, x, s }: width in bits, value bits, unknown mask (1 = X/Z), signed flag.
// Bits set in x are unknown; the corresponding bit in v is 1 for Z, 0 for X (only used for display).

export const mask = w => (w <= 0 ? 0n : (1n << BigInt(w)) - 1n);

export function mk(w, v = 0n, x = 0n, s = false) {
  const m = mask(w);
  return { w, v: v & m, x: x & m, s };
}

export const allX = (w, s = false) => mk(w, 0n, mask(w), s);
export const zero = (w = 1) => mk(w, 0n);
export const ONE = mk(1, 1n);
export const ZERO = mk(1, 0n);
export const X1 = mk(1, 0n, 1n);

export function fromInt(n, w = 32, s = true) {
  return mk(w, BigInt.asUintN(w, BigInt(n)), 0n, s);
}

export function fromBool(b) { return b ? ONE : ZERO; }

// bits: string MSB first of 0 1 x z (case-insensitive)
export function fromBits(bits, s = false) {
  let v = 0n, x = 0n;
  for (const c of bits) {
    v <<= 1n; x <<= 1n;
    if (c === '1') v |= 1n;
    else if (c === 'x' || c === 'X') x |= 1n;
    else if (c === 'z' || c === 'Z' || c === '?') { x |= 1n; v |= 1n; }
  }
  return mk(Math.max(bits.length, 1), v, x, s);
}

export const hasX = a => a.x !== 0n;
export const msb = a => (a.v >> BigInt(a.w - 1)) & 1n;

// Signed or unsigned integer interpretation (assumes no X).
export function toBig(a) {
  return a.s ? BigInt.asIntN(a.w, a.v) : a.v;
}
export function toNum(a) { return Number(toBig(a)); }

export function resize(a, w, s = a.s) {
  if (w === a.w) return a.s === s ? a : { ...a, s };
  if (w < a.w) return mk(w, a.v, a.x, s);
  let v = a.v, x = a.x;
  if (a.s && a.w > 0) {
    const ext = mask(w) ^ mask(a.w);
    if ((a.x >> BigInt(a.w - 1)) & 1n) x |= ext;
    else if (msb(a)) v |= ext;
  }
  return { w, v, x, s };
}

export const withSign = (a, s) => (a.s === s ? a : { ...a, s });

// Truthiness: 1 if any known 1 bit, X if only unknowns, else 0.
export function truth(a) {
  if (a.v & ~a.x) return 1;
  return a.x ? -1 : 0;
}
export const isTrue = a => truth(a) === 1;

const xres = (w, s) => allX(w, s);

function arith(a, b, w, s, f) {
  if (a.x || b.x) return xres(w, s);
  const A = resize(a, w, s), B = resize(b, w, s);
  return mk(w, BigInt.asUintN(w, f(toBig(A), toBig(B))), 0n, s);
}

export const add = (a, b, w, s) => arith(a, b, w, s, (x, y) => x + y);
export const sub = (a, b, w, s) => arith(a, b, w, s, (x, y) => x - y);
export const mul = (a, b, w, s) => arith(a, b, w, s, (x, y) => x * y);
export function div(a, b, w, s) {
  if (a.x || b.x || (resize(b, w, s).v === 0n)) return xres(w, s);
  return arith(a, b, w, s, (x, y) => x / y);
}
export function rem(a, b, w, s) { // Verilog % and VHDL rem: sign of dividend
  if (a.x || b.x || (resize(b, w, s).v === 0n)) return xres(w, s);
  return arith(a, b, w, s, (x, y) => x % y);
}
export function mod(a, b, w, s) { // VHDL mod: sign of divisor
  if (a.x || b.x || (resize(b, w, s).v === 0n)) return xres(w, s);
  return arith(a, b, w, s, (x, y) => { const r = x % y; return r !== 0n && (r < 0n) !== (y < 0n) ? r + y : r; });
}
export function pow(a, b, w, s) {
  if (a.x || b.x) return xres(w, s);
  const e = toBig(b);
  if (e < 0n) return mk(w, 0n, 0n, s);
  return mk(w, BigInt.asUintN(w, toBig(resize(a, w, s)) ** e), 0n, s);
}
export function neg(a, w, s) { return sub(mk(w, 0n, 0n, s), a, w, s); }

// Bitwise ops with exact 4-state semantics.
export function and(a, b, w, s) {
  a = resize(a, w, s); b = resize(b, w, s);
  const a0 = ~a.v & ~a.x, b0 = ~b.v & ~b.x; // known zeros
  const zeros = a0 | b0;
  const x = (a.x | b.x) & ~zeros;
  return mk(w, a.v & b.v & ~x, x, s);
}
export function or(a, b, w, s) {
  a = resize(a, w, s); b = resize(b, w, s);
  const ones = (a.v & ~a.x) | (b.v & ~b.x);
  const x = (a.x | b.x) & ~ones;
  return mk(w, ones, x, s);
}
export function xor(a, b, w, s) {
  a = resize(a, w, s); b = resize(b, w, s);
  const x = a.x | b.x;
  return mk(w, (a.v ^ b.v) & ~x, x, s);
}
export function not(a, w = a.w, s = a.s) {
  a = resize(a, w, s);
  return mk(w, ~a.v & ~a.x, a.x, s);
}

export function reduce(op, a) {
  let r;
  if (op === '&' || op === '~&') r = a.x === 0n ? (a.v === mask(a.w) ? 1 : 0) : ((~a.v & ~a.x & mask(a.w)) ? 0 : -1);
  else if (op === '|' || op === '~|') r = (a.v & ~a.x) ? 1 : (a.x ? -1 : 0);
  else {
    if (a.x) r = -1;
    else { let v = a.v, p = 0n; while (v) { p ^= v & 1n; v >>= 1n; } r = Number(p); }
  }
  if (op[0] === '~' && r >= 0) r = 1 - r;
  return r < 0 ? X1 : fromBool(r);
}

export function shl(a, n, w) {
  if (n.x) return xres(w, a.s);
  const k = toBig(withSign(n, false));
  a = resize(a, w);
  if (k >= BigInt(w)) return mk(w, 0n, 0n, a.s);
  return mk(w, a.v << k, a.x << k, a.s);
}
export function shr(a, n, w, arithmetic = false) {
  if (n.x) return xres(w, a.s);
  const k = toBig(withSign(n, false));
  a = resize(a, w);
  if (!arithmetic || !a.s) {
    if (k >= BigInt(w)) return mk(w, 0n, 0n, a.s);
    return mk(w, a.v >> k, a.x >> k, a.s);
  }
  const kk = k >= BigInt(w) ? BigInt(w) : k;
  const sv = BigInt.asIntN(w, a.v) >> kk, sx = BigInt.asIntN(w, a.x) >> kk;
  return mk(w, BigInt.asUintN(w, sv), BigInt.asUintN(w, sx), a.s);
}
export function rotl(a, n) {
  if (n.x) return xres(a.w, a.s);
  const k = BigInt(Number(toBig(withSign(n, false))) % a.w), W = BigInt(a.w);
  return mk(a.w, (a.v << k) | (a.v >> (W - k)), (a.x << k) | (a.x >> (W - k)), a.s);
}
export function rotr(a, n) {
  if (n.x) return xres(a.w, a.s);
  const k = Number(toBig(withSign(n, false))) % a.w;
  return rotl(a, fromInt(a.w - k));
}

// Comparisons -> 1-bit
export function cmp(o, a, b) {
  const w = Math.max(a.w, b.w), s = a.s && b.s;
  if (o === '===' || o === '!==') {
    const A = resize(a, w, s), B = resize(b, w, s);
    const eq = A.v === B.v && A.x === B.x;
    return fromBool(o === '===' ? eq : !eq);
  }
  const A = resize(a, w, s), B = resize(b, w, s);
  if (o === '==' || o === '!=') {
    // known mismatch -> definite answer even with X elsewhere
    const known = ~(A.x | B.x) & mask(w);
    if ((A.v ^ B.v) & known) return fromBool(o === '!=');
    if (A.x || B.x) return X1;
    return fromBool((A.v === B.v) === (o === '=='));
  }
  if (A.x || B.x) return X1;
  const x = s ? toBig(A) : A.v, y = s ? toBig(B) : B.v;
  switch (o) {
    case '<': return fromBool(x < y);
    case '<=': return fromBool(x <= y);
    case '>': return fromBool(x > y);
    case '>=': return fromBool(x >= y);
  }
  throw new Error('bad cmp ' + o);
}

// casez / casex matching
export function caseMatch(a, b, variant) {
  const w = Math.max(a.w, b.w);
  const A = resize(a, w, false), B = resize(b, w, false);
  if (variant === 'case') return A.v === B.v && A.x === B.x;
  let dont;
  if (variant === 'casez') dont = (A.x & A.v) | (B.x & B.v); // z bits
  else dont = A.x | B.x;
  const care = mask(w) & ~dont;
  return ((A.v ^ B.v) & care) === 0n && ((A.x ^ B.x) & care) === 0n;
}

export function concat(parts) {
  let w = 0, v = 0n, x = 0n;
  for (const p of parts) {
    const k = BigInt(p.w);
    v = (v << k) | p.v; x = (x << k) | p.x; w += p.w;
  }
  return mk(w, v, x, false);
}

export function repl(n, a) {
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(a);
  return n > 0 ? concat(parts) : mk(0);
}

// Extract w bits starting at bit position lo (lo may be out of range -> X).
export function getBits(a, lo, w) {
  if (lo < 0 || lo + w > a.w) {
    // partially out of range: out-of-range bits are X
    let v = 0n, x = 0n;
    for (let i = w - 1; i >= 0; i--) {
      const p = lo + i;
      v <<= 1n; x <<= 1n;
      if (p < 0 || p >= a.w) x |= 1n;
      else { v |= (a.v >> BigInt(p)) & 1n; x |= (a.x >> BigInt(p)) & 1n; }
    }
    return mk(w, v, x);
  }
  const L = BigInt(lo);
  return mk(w, a.v >> L, a.x >> L);
}

// Return a copy of a with w bits at position lo replaced by b (out of range bits ignored).
export function setBits(a, lo, w, b) {
  let v = a.v, x = a.x;
  for (let i = 0; i < w; i++) {
    const p = lo + i;
    if (p < 0 || p >= a.w) continue;
    const P = BigInt(p), I = BigInt(i), bit = 1n << P;
    v = (v & ~bit) | (((b.v >> I) & 1n) << P);
    x = (x & ~bit) | (((b.x >> I) & 1n) << P);
  }
  return { w: a.w, v, x, s: a.s };
}

export const same = (a, b) => a.v === b.v && a.x === b.x;

// ---- formatting ----
export function toBin(a) {
  let s = '';
  for (let i = a.w - 1; i >= 0; i--) {
    const I = BigInt(i);
    const xb = (a.x >> I) & 1n, vb = (a.v >> I) & 1n;
    s += xb ? (vb ? 'z' : 'x') : (vb ? '1' : '0');
  }
  return s;
}

export function toHex(a) {
  const digits = Math.ceil(a.w / 4);
  let s = '';
  for (let d = digits - 1; d >= 0; d--) {
    const sh = BigInt(d * 4);
    const nb = Math.min(4, a.w - d * 4);
    const m = mask(nb);
    const xv = (a.x >> sh) & m, vv = (a.v >> sh) & m;
    if (xv === m) s += vv === m ? 'z' : 'x';
    else if (xv) s += 'X';
    else s += vv.toString(16);
  }
  return s.toUpperCase().replace(/^0+(?=.)/, '') ;
}

export function toDec(a, signed = a.s) {
  if (a.x) return a.x === mask(a.w) ? 'x' : 'X';
  return (signed ? BigInt.asIntN(a.w, a.v) : a.v).toString();
}

export function format(a, radix = 'hex') {
  if (radix === 'bin') return toBin(a);
  if (radix === 'dec') return toDec(a, false);
  if (radix === 'sdec') return toDec(a, true);
  return a.w === 1 ? toBin(a) : toHex(a);
}
