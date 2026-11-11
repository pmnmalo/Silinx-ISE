// Silinx - a Verilog expression in VHDL (#2693, core/translate-to-vhdl.js): Verilog's untyped bit vectors become VHDL's
// std_logic_vector, its arithmetic numeric_std's on unsigned (signed for a signed reg), its conditions booleans; the
// conversions are written where VHDL's types need them, and the widths Verilog extends to are resized.
// Isomorphic ES module: no DOM and no Node APIs.
import { cannot, intOf } from './translate-util.js';

// VHDL's precedence (higher binds tighter): logical, relational, shift, adding, sign, multiplying, misc, a primary
const P = { logic: 1, rel: 2, shift: 3, add: 4, sign: 5, mul: 6, misc: 7, atom: 9 };
const wrap = (r, p) => (r.p < p ? `(${r.c})` : r.c);
const atom = (c, t, more = {}) => ({ c, p: P.atom, t, ...more });

/** A bit string as a VHDL literal: "0101", x"A5" for whole hex digits of 8 bits or more. */
export function bitString(bits) {
  const b = bits.toUpperCase();
  if (/^[01]+$/.test(b) && b.length >= 8 && b.length % 4 === 0) return `x"${BigInt(`0b${b}`).toString(16).toUpperCase().padStart(b.length / 4, '0')}"`;
  return `"${b}"`;
}
const fit = (bits, n) => (bits.length >= n ? bits.slice(bits.length - n) : bits.padStart(n, /^[xz]/.test(bits) ? bits[0] : '0'));
const litVal = r => (r.t === 'lit' && /^[01]+$/.test(r.bits) && r.bits.length <= 31 ? parseInt(r.bits, 2) : null);

// ------------------------------------------------------------------ conversions
/** To a numeric operand: unsigned (signed), or an integer (a literal's value). */
export function toNum(r) {
  switch (r.t) {
    case 'uns': case 'sgn': case 'int': return r;
    case 'slv': return atom(`${r.concat ? "unsigned'" : 'unsigned'}(${r.c})`, 'uns', { w: r.w });
    case 'lit': { const v = litVal(r); return v != null ? atom(String(v), 'int', { v }) : atom(`unsigned'(${bitString(r.bits)})`, 'uns', { w: r.bits.length }); }
    case 'sl': return atom(`unsigned'(0 => ${r.c})`, 'uns', { w: 1 });
  }
  return cannot('a condition used as a number');
}
/** To a std_logic_vector of n bits (n: a number, or null when not known: the value's own width). */
export function toSlv(r, n, wc) {
  switch (r.t) {
    case 'slv':
      if (n == null || r.w == null || r.w === n) return r;
      if (r.p === P.atom && r.name && r.w > n) return atom(`${r.c}(${n - 1} downto 0)`, 'slv', { w: n });
      return atom(`std_logic_vector(resize(${wrap(toNum(r), P.atom)}, ${n}))`, 'slv', { w: n });
    case 'uns': case 'sgn':
      if (n == null || r.w == null || r.w === n) return atom(`std_logic_vector(${r.c})`, 'slv', { w: r.w });
      return atom(`std_logic_vector(resize(${r.c}, ${n}))`, 'slv', { w: n });
    case 'int': {
      if (r.v === 0 && (n != null || wc != null)) return atom("(others => '0')", 'slv', { w: n, others: true });
      if (r.v != null && r.v >= 0 && n != null && r.v < 2 ** n) return atom(bitString(r.v.toString(2).padStart(n, '0')), 'slv', { w: n });
      if (n == null && wc == null) return cannot('an integer whose width is not known here');
      return atom(`std_logic_vector(${r.v != null && r.v < 0 ? 'to_signed' : 'to_unsigned'}(${r.c}, ${n ?? wc}))`, 'slv', { w: n });
    }
    case 'lit': return atom(bitString(n == null ? r.bits : fit(r.bits, n)), 'slv', { w: n ?? r.bits.length });
    case 'sl': return n === 1 ? atom(`(0 => ${r.c})`, 'slv', { w: 1, others: true }) : atom(`(0 => ${r.c}, others => '0')`, 'slv', { w: n, others: true });
  }
  return cannot('a condition used as a vector');
}
/** To a std_logic. */
export function toSl(r) {
  if (r.t === 'sl') return r;
  if (r.t === 'lit') return atom(`'${r.bits[r.bits.length - 1].toUpperCase()}'`, 'sl');
  if (r.t === 'int' && (r.v === 0 || r.v === 1)) return atom(`'${r.v}'`, 'sl');
  if ((r.t === 'slv' || r.t === 'uns') && r.name) return atom(`${r.c}(${r.lsb ?? 0})`, 'sl');
  return cannot('a value of more than one bit given to a single bit');
}
/** To a condition. */
export function toBool(r) {
  switch (r.t) {
    case 'bool': return r;
    case 'sl': return { c: `${wrap(r, P.rel + 1)} = '1'`, p: P.rel, t: 'bool' };
    case 'slv': return { c: `${wrap(toNum(r), P.rel + 1)} /= 0`, p: P.rel, t: 'bool' };
    case 'uns': case 'sgn': case 'int': return { c: `${wrap(r, P.rel + 1)} /= 0`, p: P.rel, t: 'bool' };
    case 'lit': return atom(/1/.test(r.bits) ? 'true' : 'false', 'bool');
  }
  return cannot('this value used as a condition');
}
/** To an integer. */
export function toInt(r) {
  if (r.t === 'int') return r;
  if (r.t === 'lit') { const v = litVal(r); if (v != null) return atom(String(v), 'int', { v }); }
  if (r.t === 'slv' || r.t === 'lit') return atom(`to_integer(${toNum(r).c})`, 'int');
  if (r.t === 'uns' || r.t === 'sgn') return atom(`to_integer(${r.c})`, 'int');
  return cannot('this value used as an integer');
}
/** A value assigned to (or compared with) something of type T ({ t, w }). */
export function toType(r, T) {
  switch (T.t) {
    case 'sl': return toSl(r);
    case 'int': return toInt(r);
    case 'sgn': { const s = toSlv(r, T.w, T.wc); return s.others ? s : atom(`signed(${s.c})`, 'sgn', { w: T.w }); }
    case 'slv': return toSlv(r, T.w, T.wc);
    case 'str': case 'real': return r;
  }
  return cannot('a value of this type');
}

// ------------------------------------------------------------------ expressions
const REL = { '==': '=', '!=': '/=', '===': '=', '!==': '/=', '<': '<', '<=': '<=', '>': '>', '>=': '>=' };
const LOGIC = { '&': 'and', '|': 'or', '^': 'xor', '~^': 'xnor', '^~': 'xnor' };
export const bitLike = r => r.t === 'sl' || (r.t === 'lit' && r.bits.length === 1) || (r.t === 'int' && (r.v === 0 || r.v === 1));

/**
 * A Verilog expression in VHDL: { c, p, t, w } (t: bool, sl, slv, uns, sgn, int, lit, str; w: a vector's width when known).
 * cx.name(n) -> the VHDL name; cx.type(n) -> { t, w, wc, elem, kind } of a declared name; want: the width it goes to
 * (Verilog's context width, for + and -).
 */
export function exprH(cx, e, want = null) {
  switch (e?.op) {
    case 'int': return atom(e.value, 'int', { v: Number(e.value) });
    case 'real': return atom(String(e.value).includes('.') ? String(e.value) : `${e.value}.0`, 'real');
    case 'str': return atom(`"${String(e.value).replace(/"/g, '""')}"`, 'str');
    case 'lit': return e.sized === false && /^[01]+$/.test(e.bits) && e.bits.length <= 31 ? atom(String(parseInt(e.bits, 2)), 'int', { v: parseInt(e.bits, 2) }) : atom(bitString(e.bits), 'lit', { bits: e.bits, w: e.bits.length });
    case 'ref': {
      const T = cx.type(e.name);
      if (!T) return cannot(`the name '${e.name}' (not declared in this module)`, e);
      return atom(cx.name(e.name), T.t, { w: T.w, wc: T.wc, name: true, lsb: T.lsb, v: T.v });
    }
    case 'index': return indexH(cx, e);
    case 'slice': case 'pslice': return sliceH(cx, e);
    case 'concat': {
      const parts = e.parts.map(x => exprH(cx, x)).map(r => (r.t === 'sl' || r.t === 'lit' && r.bits.length === 1 ? toSl(r) : toSlv(r, r.w)));
      const w = parts.reduce((a, r) => (a == null || (r.t !== 'sl' && r.w == null) ? null : a + (r.t === 'sl' ? 1 : r.w)), 0);
      return parts.length === 1 ? parts[0] : { c: parts.map(r => wrap(r, P.add + 1)).join(' & '), p: P.add, t: 'slv', w, concat: true };
    }
    case 'repl': return replH(cx, e);
    case 'unary': return unaryH(cx, e);
    case 'binary': return binaryH(cx, e, want);
    case 'call': return callH(cx, e);
    // (in a concurrent statement: an intermediate signal of its own, cx.hoist)
    case 'cond': return cx.hoist ? cx.hoist(e) : cannot('a conditional expression (?:) inside another expression', e);
  }
  return cannot(`an expression of kind '${e?.op}'`, e);
}
function indexH(cx, e) {
  const b = exprH(cx, e.base);
  const T = e.base.op === 'ref' ? cx.type(e.base.name) : null;
  const i = toInt(exprH(cx, e.index));
  if (T?.t === 'array') return atom(`${b.c}(${i.c})`, T.elem.t, { w: T.elem.w, name: true });
  if (b.t !== 'slv' && b.t !== 'uns' && b.t !== 'sgn') cannot('an index of something other than a vector or a memory', e);
  return atom(`${wrap(b, P.atom)}(${i.c})`, 'sl', { name: b.name });
}
function sliceH(cx, e) {
  const b = exprH(cx, e.base);
  if (!b.name) cannot('a part-select of an expression', e);
  const asc = e.base.op === 'ref' && cx.type(e.base.name)?.asc;
  let l, r;
  if (e.op === 'slice') { l = exprH(cx, e.left); r = exprH(cx, e.right); } else {
    const s = toInt(exprH(cx, e.start)), w = toInt(exprH(cx, e.width));
    const lo = s, hi = { c: w.v != null && s.v != null ? String(s.v + w.v - 1) : `${s.c} + ${w.v != null ? w.v - 1 : `${w.c} - 1`}`, p: P.add };
    [l, r] = e.dir === '+' ? (asc ? [lo, hi] : [hi, lo]) : (asc ? [{ c: `${s.c} - ${w.v != null ? w.v - 1 : `${w.c} + 1`}`, p: P.add }, s] : [s, { c: `${s.c} - ${w.v != null ? w.v - 1 : `${w.c} + 1`}`, p: P.add }]);
  }
  const n = intOf(e.left) != null && intOf(e.right) != null ? Math.abs(intOf(e.left) - intOf(e.right)) + 1 : e.op === 'pslice' ? intOf(e.width) : null;
  return atom(`${b.c}(${toInt(l).c} ${asc ? 'to' : 'downto'} ${toInt(r).c})`, b.t === 'sgn' ? 'slv' : b.t, { w: n, name: true, lsb: asc ? null : intOf(e.right) });
}
function replH(cx, e) {
  const n = intOf(e.count);
  const v = exprH(cx, e.value);
  if (n == null) return cannot('a replication of a count that is not constant', e);
  if (bitLike(v)) return atom(`std_logic_vector'(${n - 1} downto 0 => ${toSl(v).c})`, 'slv', { w: n });
  const s = toSlv(v, v.w);
  if (n > 8) return cannot('a replication of a vector more than 8 times', e);
  return { c: Array(n).fill(wrap(s, P.add + 1)).join(' & '), p: P.add, t: 'slv', w: s.w == null ? null : s.w * n, concat: true };
}
function unaryH(cx, e) {
  const a = exprH(cx, e.a);
  switch (e.o) {
    case '!': return { c: `not ${wrap(toBool(a), P.misc)}`, p: P.misc, t: 'bool' };
    case '~':
      if (a.t === 'bool') return { c: `not ${wrap(a, P.misc)}`, p: P.misc, t: 'bool' };
      if (a.t === 'lit') return atom(bitString(a.bits.replace(/[01]/g, b => (b === '1' ? '0' : '1'))), 'lit', { bits: a.bits.replace(/[01]/g, b => (b === '1' ? '0' : '1')), w: a.w });
      if (a.t === 'int') return cannot('~ of an integer', e);
      return { c: `not ${wrap(a, P.misc)}`, p: P.misc, t: a.t, w: a.w };
    case '-': { const n = toNum(a); return n.t === 'int' ? { c: `-${wrap(n, P.sign + 1)}`, p: P.sign, t: 'int', v: n.v != null ? -n.v : undefined } : { c: `0 - ${wrap(n, P.add + 1)}`, p: P.add, t: n.t, w: n.w }; }
    case '+': return a;
    case '|': case '~|': { const n = toNum(a); return { c: `${wrap(n, P.rel + 1)} ${e.o === '|' ? '/=' : '='} 0`, p: P.rel, t: 'bool' }; }
    case '&': case '~&': {
      if (!a.name) cannot(`the reduction ${e.o} of an expression`, e);
      return { c: `${a.c} ${e.o === '&' ? '=' : '/='} (${a.c}'range => '1')`, p: P.rel, t: 'bool' };
    }
    case '^': case '~^': case '^~': {
      if (!a.name || a.w == null || a.w > 16) cannot(`the reduction ${e.o} of this vector`, e);
      const lo = a.lsb ?? 0;
      const x = { c: Array.from({ length: a.w }, (_, i) => `${a.c}(${lo + i})`).join(' xor '), p: P.logic, t: 'sl' };
      return e.o === '^' ? x : { c: `not (${x.c})`, p: P.misc, t: 'sl' };
    }
  }
  return cannot(`the operator ${e.o}`, e);
}
// A chain of binary operators (a + b + c …, its left operands nesting as deep as it is long) in a loop (#3375): each
// operator translates its left operand first (at the width it wants: + and the logic operators pass theirs on), so the
// deepest one's, then each operator up with the one below it
const leftWant = (o, want) => (o === '&&' || o === '||' || REL[o] ? null : want);
function binaryH(cx, e, want) {
  const chain = [[e, want]];
  for (let x = e, w = want; x.a?.op === 'binary';) { w = leftWant(x.o, w); x = x.a; chain.push([x, w]); }
  const [x0, w0] = chain[chain.length - 1];
  let a = exprH(cx, x0.a, leftWant(x0.o, w0));
  for (let i = chain.length - 1; i >= 0; i--) a = binary1H(cx, ...chain[i], a);
  return a;
}
// one operator, a its left operand translated
function binary1H(cx, e, want, a) {
  const o = e.o;
  if (o === '&&' || o === '||') {
    a = toBool(a);
    const b = toBool(exprH(cx, e.b));
    const v = o === '&&' ? 'and' : 'or';
    return { c: `${logicOperand(a, v)} ${v} ${logicOperand(b, v)}`, p: P.logic, t: 'bool', op: v };
  }
  if (REL[o]) return compareH(cx, e, a);
  const b = exprH(cx, e.b, want);
  if (LOGIC[o] || o === '~&' || o === '~|') return logicH(e, a, b);
  if (o === '+' || o === '-' || o === '*' || o === '/' || o === '%' || o === '**') return arithH(e, a, b, want);
  if (o === '<<' || o === '>>' || o === '<<<' || o === '>>>') {
    // (a literal shifted: an unsigned of its width; an integer: a product or a quotient of a power of 2)
    const n = a.t === 'lit' ? atom(`unsigned'(${bitString(a.bits)})`, 'uns', { w: a.w }) : toNum(a), k = toInt(b);
    if (n.t === 'int') {
      const f = k.v != null ? String(2 ** k.v) : `2 ** ${wrap(k, P.misc + 1)}`;
      return { c: `${wrap(n, P.mul)} ${o === '<<' || o === '<<<' ? '*' : '/'} ${f}`, p: P.mul, t: 'int' };
    }
    const f = o === '<<' || o === '<<<' ? 'shift_left' : 'shift_right';
    const x = o === '>>>' && n.t === 'uns' ? `unsigned(shift_right(signed(${n.c}), ${k.c}))` : `${f}(${n.c}, ${k.c})`;
    return atom(x, n.t, { w: n.w });
  }
  return cannot(`the operator ${o}`, e);
}
// (VHDL: "a and b or c" needs its parentheses; a chain of one operator does not)
const logicOperand = (r, op) => (r.p === P.logic && r.op !== op ? `(${r.c})` : wrap(r, P.logic));
function logicH(e, a, b) {
  const o = e.o === '~&' ? 'nand' : e.o === '~|' ? 'nor' : LOGIC[e.o];
  if (a.t === 'bool' || b.t === 'bool') {
    if (o === 'xnor') return { c: `${wrap(toBool(a), P.rel + 1)} = ${wrap(toBool(b), P.rel + 1)}`, p: P.rel, t: 'bool' };
    const x = toBool(a), y = toBool(b);
    return { c: `${logicOperand(x, o)} ${o} ${logicOperand(y, o)}`, p: P.logic, t: 'bool', op: o };
  }
  if (bitLike(a) && bitLike(b)) { const x = toSl(a), y = toSl(b); return { c: `${logicOperand(x, o)} ${o} ${logicOperand(y, o)}`, p: P.logic, t: 'sl', op: o }; }
  const n = Math.max(a.w ?? 0, b.w ?? 0) || null;
  const x = toSlv(a.t === 'uns' || a.t === 'sgn' ? toSlv(a, n) : a, n), y = toSlv(b.t === 'uns' || b.t === 'sgn' ? toSlv(b, n) : b, n);
  if (x.others || y.others) return cannot('a bitwise operation with a constant whose width is not known', e);
  return { c: `${logicOperand(x, o)} ${o} ${logicOperand(y, o)}`, p: P.logic, t: 'slv', w: n, op: o };
}
function arithH(e, a, b, want) {
  let x = toNum(a), y = toNum(b);
  const o = { '%': 'mod' }[e.o] || e.o;
  if (x.t === 'int' && y.t === 'int') {
    const v = x.v != null && y.v != null ? intOf({ op: 'binary', o: e.o, a: { op: 'int', value: x.v }, b: { op: 'int', value: y.v } }) : undefined;
    const p = o === '**' ? P.misc : o === '+' || o === '-' ? P.add : P.mul;
    return { c: `${wrap(x, p)} ${o} ${wrap(y, p + 1)}`, p, t: 'int', v: v ?? undefined };
  }
  if (o === '**') return cannot('** of a vector', e);
  const t = x.t === 'sgn' || y.t === 'sgn' ? 'sgn' : 'uns';
  let w = Math.max(x.t === 'int' ? 0 : x.w ?? 0, y.t === 'int' ? 0 : y.w ?? 0) || null;
  // (Verilog adds at the width it assigns to: the carry kept)
  if ((o === '+' || o === '-') && want != null && w != null && want > w) {
    if (x.t !== 'int') x = atom(`resize(${x.c}, ${want})`, x.t, { w: want }); else y = atom(`resize(${y.c}, ${want})`, y.t, { w: want });
    w = want;
  }
  if (o === '*') w = (x.t === 'int' ? y.w : x.w) != null ? (x.t === 'int' || y.t === 'int' ? 2 * (x.t === 'int' ? y.w : x.w) : (x.w ?? 0) + (y.w ?? 0)) : null;
  const p = o === '+' || o === '-' ? P.add : P.mul;
  return { c: `${wrap(x, p)} ${o} ${wrap(y, p + 1)}`, p, t, w };
}
function compareH(cx, e, a) {
  const op = REL[e.o];
  const b = exprH(cx, e.b);
  const rel = (x, y) => ({ c: `${wrap(x, P.rel + 1)} ${op} ${wrap(y, P.rel + 1)}`, p: P.rel, t: 'bool' });
  if (a.t === 'bool' || b.t === 'bool') {
    if (op !== '=' && op !== '/=') cannot('an ordering of conditions', e);
    return rel(toBool(a), toBool(b));
  }
  if (bitLike(a) && bitLike(b) && (a.t === 'sl' || b.t === 'sl')) return rel(toSl(a), toSl(b));
  // equal vectors of one width: as they are; else as numbers
  if ((op === '=' || op === '/=') && a.t === 'slv' && (b.t === 'slv' || b.t === 'lit') && a.w != null && a.w === b.w) return rel(a, b.t === 'lit' ? toSlv(b, a.w) : b);
  if ((op === '=' || op === '/=') && b.t === 'slv' && a.t === 'lit' && b.w != null && a.w === b.w) return rel(toSlv(a, b.w), b);
  let x = toNum(a), y = toNum(b);
  if (x.t === 'sgn' && y.t === 'uns' || x.t === 'uns' && y.t === 'sgn') cannot('a comparison of a signed and an unsigned value', e);
  return rel(x, y);
}
function callH(cx, e) {
  const args = (e.args || []).map(x => exprH(cx, x));
  switch (e.name) {
    case '$signed': { const s = toSlv(args[0], args[0].w); return atom(`signed(${s.c})`, 'sgn', { w: s.w }); }
    case '$unsigned': { const s = toSlv(args[0], args[0].w); return atom(`unsigned(${s.c})`, 'uns', { w: s.w }); }
    case '$time': case '$realtime': return atom('now', 'time');
  }
  const f = cx.func(e.name);
  if (!f) return cannot(`the function ${e.name}`, e);
  return atom(`${cx.name(e.name)}(${args.map((a, i) => toType(a, f.params[i]).c).join(', ')})`, f.ret.t, { w: f.ret.w });
}
export { P as PREC };
