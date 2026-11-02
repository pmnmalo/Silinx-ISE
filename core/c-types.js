// Silinx HLS (docs/c-to-hdl.md, #1525): the integer types and their arithmetic: C's integer promotions and usual
// arithmetic conversions, and Vitis HLS's ap_int<W> / ap_uint<W> results (wide enough for any value of their operands).
// Isomorphic ES module: no DOM and no Node APIs.
//
// A type is { w, s, ap }: its width in bits, signed or not, an ap_int / ap_uint or a C type. bool is { w: 1, s: false }.
import { floatType } from './c-float.js';
import { fixedType } from './c-fixed.js';

export const INT = Object.freeze({ w: 32, s: true, ap: false });
export const BOOL = Object.freeze({ w: 1, s: false, ap: false, bool: true });

/** The type of a parsed Type (core/c-parse.js) of an integer, else null. */
export function typeOf(t) {
  if (t?.kind === 'float') return floatType(t);   // (the C simulation's: core/c-float.js; refused in hardware)
  if (!t || t.kind !== 'int' || !t.bits) return null;
  if (t.fixed) return fixedType(t.bits, t.ibits, !!t.signed, t.q, t.o, t.n || 0);   // (core/c-fixed.js)
  return t.name === 'bool' ? BOOL : { w: t.bits, s: !!t.signed, ap: !!t.ap };
}

/** C's integer promotion: a C type narrower than int becomes int (all of them fit in it); ap types are kept. */
export function promote(t) {
  if (t.ap) return t;
  return t.w < 32 ? INT : t;
}

/** The common type of two C operands (the usual arithmetic conversions), after their promotion. */
function cCommon(a, b) {
  a = promote(a); b = promote(b);
  if (a.s === b.s) return a.w >= b.w ? { w: a.w, s: a.s, ap: false } : { w: b.w, s: b.s, ap: false };
  const u = a.s ? b : a, sg = a.s ? a : b;
  if (u.w >= sg.w) return { w: u.w, s: false, ap: false };
  return { w: sg.w, s: true, ap: false };
}

/** An operand of an ap_int operation: a C integer takes its own (promoted) width and signedness. */
const asAp = (t) => (t.ap ? t : { ...promote(t), ap: true });

// the width a value of type t needs as a signed number
const sw = (t) => (t.s ? t.w : t.w + 1);

/** The type of the result of a binary arithmetic or bitwise operation (op: + - * / % & | ^), and the type its two
 *  operands are converted to before it (C: the common type; ap: each operand extended to the result's width). */
export function binaryType(op, a, b) {
  if (!a.ap && !b.ap) { const c = cCommon(a, b); return { res: c, opnd: c }; }
  a = asAp(a); b = asAp(b);
  const s = a.s || b.s;
  let w;
  switch (op) {
    // (+ and -: max(W1 + (S2 && !S1), W2 + (S1 && !S2)) + 1 bits, as Vitis HLS's ap_int; a difference is signed)
    case '+': w = Math.max(a.w + (b.s && !a.s ? 1 : 0), b.w + (a.s && !b.s ? 1 : 0)) + 1; break;
    case '-': w = Math.max(a.w + (b.s && !a.s ? 1 : 0), b.w + (a.s && !b.s ? 1 : 0)) + 1; return { res: { w, s: true, ap: true }, opnd: { w, s: true, ap: true } };
    case '*': w = a.w + b.w; break;
    // (/: W1 + S2 bits, the operands divided as they are (a bit more: -min / -1), as AMD's ap_int.h, #1588)
    case '/': w = a.w + (b.s ? 1 : 0); return { res: { w, s, ap: true }, opnd: { w: Math.max(sw(a), sw(b)) + 1, s: true, ap: true } };
    case '%': w = Math.max(sw(a), sw(b)); return { res: { w, s: a.s, ap: true }, opnd: { w: w + 1, s: true, ap: true } };
    default: w = s ? Math.max(sw(a), sw(b)) : Math.max(a.w, b.w); break;   // & | ^
  }
  const t = { w, s, ap: true };
  return { res: t, opnd: t };
}

/** The type both operands of a comparison are converted to (the result is a bool / C int 0 or 1). */
export function compareType(a, b) {
  if (!a.ap && !b.ap) return cCommon(a, b);
  a = asAp(a); b = asAp(b);
  if (a.s === b.s) return { w: Math.max(a.w, b.w), s: a.s, ap: true };
  return { w: Math.max(sw(a), sw(b)), s: true, ap: true };   // (mixed: compared as numbers, exactly)
}

/** The type of a shift's result (the left operand's, promoted in C; ap keeps its width). */
export function shiftType(a) { return a.ap ? a : promote(a); }

/** The type of a unary operation (- + ~) on t. */
export function unaryType(op, t) {
  if (!t.ap) return promote(t);
  if (op === '-') return { w: sw(t) + (t.s ? 1 : 0), s: true, ap: true };
  return t;
}

/** A C integer constant's type: int, unsigned int, long or unsigned long, as C chooses it by its value, suffix
 *  and base. */
export function literalType(value, { unsigned = false, long = false, decimal = true } = {}) {
  const fits = (w, s) => (s ? value <= (1n << BigInt(w - 1)) - 1n : value <= (1n << BigInt(w)) - 1n);
  const order = unsigned ? [[32, false], [64, false]] : decimal ? [[32, true], [64, true]] : [[32, true], [32, false], [64, true], [64, false]];
  for (const [w, s] of order) if ((!long || w === 64) && fits(w, s)) return { w, s, ap: false };
  return { w: 64, s: false, ap: false };
}

/** v (a BigInt) as a value of type t: truncated to its width, then read as signed or unsigned. */
export function wrap(v, t) {
  const m = (1n << BigInt(t.w)) - 1n;
  let x = v & m;
  if (t.s && t.w > 0 && (x >> BigInt(t.w - 1)) & 1n) x -= 1n << BigInt(t.w);
  return x;
}

/** The type name of t, for the messages: int, unsigned, ap_uint<9>… */
export function typeName(t) {
  if (t.bool) return 'bool';
  if (t.fx) return `${t.s ? 'ap_fixed' : 'ap_ufixed'}<${t.w}, ${t.w - t.f}>`;
  if (t.ap) return `${t.s ? 'ap_int' : 'ap_uint'}<${t.w}>`;
  return `${t.s ? '' : 'unsigned '}${{ 8: 'char', 16: 'short', 32: 'int', 64: 'long' }[t.w] || `int${t.w}`}`.trim();
}
