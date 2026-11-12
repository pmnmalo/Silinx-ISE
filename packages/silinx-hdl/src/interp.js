// Interpreter for bound (elaborated) expressions and statements.
// Statements run as generators so processes can suspend on delays / waits.
//
// Bound expression nodes (produced by elaborate.js) all carry `t` (ElType) and optionally `ew`
// (evaluation width from Verilog context sizing). See elaborate.js for the node catalogue.
import * as V from './values.js';
import { MAX_ELEMENTS } from './util.js';
import { mathReal, textFile, textio } from './interp-textio.js';
import { formatDisplay, imageOf, strToVal, toStr } from './interp-format.js';
export { formatDisplay, formatTime, imageOf, strToVal, toStr } from './interp-format.js';
export { mathReal } from './interp-textio.js';

// A VHDL slice against its direction (`v(-1 downto 0)`, `v(i + N - 1 downto i)` with N = 0): null
const MAX_CALL_DEPTH = 1000;   // nested function calls (recursion)
const nullSlice = (dir, l, r) => (dir === 'downto' ? l < r : l > r);
// The elements of a slice of an array with run-time bounds: { off, len } (null: an unknown bound)
function dasliceRange(n, ctx) {
  const l = evalE(n.left, ctx), r = evalE(n.right, ctx);
  if (l.x || r.x) return null;
  const a = V.toNum(l), b = V.toNum(r);
  if (n.dir && nullSlice(n.dir, a, b)) return { off: 0, len: 0 };
  // (its elements, each a value or a write of its own, within MAX_ELEMENTS: #3555)
  if (Math.abs(a - b) >= MAX_ELEMENTS) throw new SimError(`array too large (${Math.abs(a - b) + 1} elements)`);
  return { off: Math.min(a, b) - (n.base.t.lo ?? 0), len: Math.abs(a - b) + 1 };
}

export class SimError extends Error {
  constructor(msg, loc) { super(msg); this.loc = loc; }
}

// Bit position of logical index i within a vector type.
export function bitpos(t, i) {
  return t.desc ? i - t.right : t.right - i;
}

export const isStr = v => v && v.str !== undefined;

// The frame of a variable: the running process's or subprogram's own, or (up: a subprogram declared
// in a process or in another subprogram using their variables, #182) that of the enclosing one
export const locFrame = (n, ctx) => (n.up == null ? ctx.frame : ctx.outer[n.up]);

// A subprogram's frame: a new one, at its declarations' initial values, for each call; that of a
// Verilog task or function that is not automatic is static (kept by the simulator from one call to
// the next), except in a call while it runs (recursion, another process), which gets its own
function calleeFrame(f, ctx) {
  const st = f.static && ctx.sim?.statics;
  if (!st) return { frame: f.frameInit() };
  let s = st.get(f.static);
  if (!s) st.set(f.static, s = { frame: f.frameInit(), busy: false });
  if (s.busy) return { frame: f.frameInit() };
  s.busy = true;
  return { frame: s.frame, done: () => { s.busy = false; } };
}

// A subprogram's context: its frame, and the frames of the process and subprograms it is declared
// in (outer, by level: those of the caller's chain, the caller being declared inside them)
const calleeCtx = (f, frame, ctx) => ({ ...ctx, frame, outer: f.level ? [...(ctx.outer || []), ctx.frame].slice(0, f.level) : [] });

export function evalE(n, ctx) {
  switch (n.k) {
    case 'c': return n.val;
    case 'sig': {
      // a Verilog port connected straight to its actual (one signal) reads with the port's own sign
      const v = n.sig.val;
      return n.t !== n.sig.t && v && v.s !== undefined && !!v.s !== !!n.t.s && n.t.kind === 'logic' ? V.withSign(v, !!n.t.s) : v;
    }
    case 'loc': return locFrame(n, ctx)[n.i];
    // a variable of another process's named block (dut.blk.v, #12): its current value in that
    // process's frame (its initial value before the process has run)
    case 'xloc': {
      const p = n.ref.proc, f = p && ctx.sim?.frameOf(p);
      if (f) return f[n.i];
      return p?.frameInit ? p.frameInit()[n.i] : V.allX(n.t.w, n.t.s);
    }
    case 'bit': {
      const b = evalE(n.base, ctx), i = evalE(n.index, ctx);
      if (i.x) return V.X1;
      const p = bitpos(n.base.t, V.toNum(i));
      if (n.chk && (p < 0 || p >= b.w) && !ctx.probe) throw indexError(V.toNum(i), n.base.t);
      return V.getBits(b, p, 1);
    }
    case 'elem': {
      const arr = evalE(n.base, ctx), i = evalE(n.index, ctx);
      const et = n.t;
      if (i.x) return V.allX(et.w, et.s);
      const k = V.toNum(i) - n.base.t.lo;
      if (k < 0 || k >= arr.length) { if (n.chk && !ctx.probe) throw indexError(V.toNum(i), n.base.t); return V.allX(et.w, et.s); }
      return arr[k];
    }
    case 'slice': return { ...V.getBits(evalE(n.base, ctx), n.lo, n.t.w), s: n.t.s };
    case 'aslice': {   // a slice of an array (#11): its elements (unknown outside the array)
      const arr = evalE(n.base, ctx), et = n.t.elem;
      return Array.from({ length: n.t.len }, (_, j) => arr[n.off + j] ?? (et.kind === 'array' ? [] : V.allX(et.w, et.s)));
    }
    case 'daslice': {   // a slice of run-time bounds
      const arr = evalE(n.base, ctx), et = n.t.elem, r = dasliceRange(n, ctx);
      if (!r) return [];
      return Array.from({ length: r.len }, (_, j) => arr[r.off + j] ?? (et.kind === 'array' ? [] : V.allX(et.w, et.s)));
    }
    case 'afill': return evalE(n.a, ctx);   // (others => v) into a slice of run-time bounds: each element
    case 'dslice': {
      const b = evalE(n.base, ctx), l = evalE(n.left, ctx), r = evalE(n.right, ctx);
      if (l.x || r.x) return V.allX(n.t.w);
      if (n.dir && nullSlice(n.dir, V.toNum(l), V.toNum(r))) return V.resize(V.mk(0, 0n, 0n), n.t.w);   // (VHDL null slice)
      const p1 = bitpos(n.base.t, V.toNum(l)), p2 = bitpos(n.base.t, V.toNum(r));
      const lo = Math.min(p1, p2), w = Math.abs(p1 - p2) + 1;
      return V.resize(V.getBits(b, lo, w), n.t.w);
    }
    case 'pslice': {
      const b = evalE(n.base, ctx), st = evalE(n.start, ctx);
      if (st.x) return V.allX(n.t.w);
      const lo = psliceLo(n.base.t, V.toNum(st), n.t.w, n.dir);
      return V.getBits(b, lo, n.t.w);
    }
    case 'rfn': return V.real(mathReal(n.f, V.toReal(evalE(n.a, ctx)), n.b ? V.toReal(evalE(n.b, ctx)) : undefined));
    case 'un': return evalUn(n, ctx);
    case 'bin': return evalBin(n, ctx);
    case 'cond': return evalCond(n, ctx);
    case 'cat': return V.concat(n.parts.map(p => V.resize(evalE(p, ctx), p.t.w)));
    case 'repl': {
      const c = evalE(n.count, ctx);
      return V.repl(V.toNum(c), V.resize(evalE(n.a, ctx), n.a.t.w));
    }
    case 'conv': { // resize/sign conversion; ext = signedness used for extension
      const a = evalE(n.a, ctx);
      if (n.t.kind === 'real') return a.real !== undefined ? a : V.real(V.toNum(V.withSign(a, n.ext)));
      // (round: a real assigned to an integer rounds, halves away from zero; $rtoi truncates)
      if (n.rtoi && a.real !== undefined) return V.fromInt(n.round ? Math.sign(a.real) * Math.round(Math.abs(a.real)) : Math.trunc(a.real), n.t.w, true);
      if (n.sres && n.t.w < a.w) { // numeric_std resize(signed): sign bit + low bits
        const w = n.t.w, low = w > 1 ? V.getBits(a, 0, w - 1) : V.mk(0);
        return V.withSign(V.concat([V.getBits(a, a.w - 1, 1), low]), true);
      }
      return V.withSign(V.resize(V.withSign(a, n.ext), n.t.w), n.t.s);
    }
    case 'textio_eof': {   // endfile(f): no line left to read
      const f = evalE(n.file, ctx);
      if (f.std) return V.fromBool(true);
      const tf = textFile(f, ctx);
      return V.fromBool(!tf || tf.pos >= tf.lines.length);
    }
    case 'call':
      try { return callFunction(n, ctx); } catch (e) {
        // (the JavaScript stack ran out first: a recursion too deep for the simulator)
        if (e instanceof RangeError) throw new SimError(`recursion too deep in function ${n.fn?.name || ''}`);
        throw e;
      }
    case 'sys': return evalSys(n, ctx);
    case 'edge': {
      const s = n.sig;
      if (!ctx.sim || s.evStamp !== ctx.sim.stamp) return V.ZERO;
      const b = BigInt(n.bit || 0);
      const one = x => !!x && !!((x.v >> b) & 1n) && !((x.x >> b) & 1n);
      const zero = x => !!x && !((x.v >> b) & 1n) && !((x.x >> b) & 1n);
      // VHDL rising_edge: '0' -> '1' only (not 'X'/'U' -> '1'); falling_edge: '1' -> '0'
      return V.fromBool(n.pos ? (one(s.val) && zero(s.prev)) : (zero(s.val) && one(s.prev)));
    }
    case 'event': {
      if (!ctx.sim || n.sig.evStamp !== ctx.sim.stamp) return V.ZERO;
      if (n.bit == null) return V.ONE ?? V.fromBool(true);
      const b = BigInt(n.bit), p = n.sig.prev, c = n.sig.val;
      return V.fromBool(!p || ((p.v >> b) & 1n) !== ((c.v >> b) & 1n) || ((p.x >> b) & 1n) !== ((c.x >> b) & 1n));
    }
    case 'sigattr': {   // VHDL S'last_value, S'last_event, S'stable(T)
      const s = n.sig, sim = ctx.sim;
      if (n.a === 'last_value') return s.prev ?? s.val;
      const now = sim ? sim.now : 0, lt = s.lastT;
      if (n.a === 'last_event') return V.fromInt(lt === undefined ? 2 ** 53 - 1 : now - lt, 64, true);
      const T = V.toNum(evalE(n.T, ctx));
      if (T === 0 || lt === now) return V.fromBool(!(sim && s.evStamp === sim.stamp) && (T === 0 || lt !== now));
      return V.fromBool(lt === undefined || now - lt >= T);
    }
    case 'str': return { str: n.value };
    case 'chr': {   // VHDL string indexing (strings index from 1 here)
      const str = toStr(evalE(n.base, ctx)), i = evalE(n.index, ctx);
      const k = i.x ? -1 : V.toNum(i) - 1;
      if (k < 0 || k >= str.length) throw new SimError(`index ${i.x ? 'X' : V.toNum(i)} out of range for a string of length ${str.length}`);
      return V.fromInt(str.charCodeAt(k) & 255, 8, false);
    }
    case 'strlen': return V.fromInt(toStr(evalE(n.a, ctx)).length);
    case 'strslice': {   // s(l to r) of a string (strings index from 1 here); null: ''
      const str = toStr(evalE(n.base, ctx)), l = evalE(n.left, ctx), r = evalE(n.right, ctx);
      if (l.x || r.x) throw new SimError('a string slice with an unknown bound');
      const a = V.toNum(l), b = V.toNum(r);
      if (n.dir === 'downto' || (n.dir ? a > b : false)) return { str: '' };
      if (a < 1 || b > str.length) throw new SimError(`slice ${a} to ${b} out of range for a string of length ${str.length}`);
      return { str: str.slice(a - 1, b) };
    }
    case 'image': {
      const v = evalE(n.a, ctx);
      if (n.hex && !Array.isArray(v) && !isStr(v)) return { str: V.toHex(v).padStart(Math.ceil(v.w / 4), '0').toUpperCase() };
      const t = n.it || n.a.t;
      // to_string of a scalar std_logic / bit: the character alone (no quotes, unlike 'image)
      if (n.ts && t && t.kind === 'logic' && t.scalar && !isStr(v) && !Array.isArray(v)) return { str: V.toBin(v).toUpperCase() };
      return { str: imageOf(v, t) };
    }
    case 'strcat': return { str: n.parts.map(p => toStr(evalE(p, ctx), p.t)).join('') };
    case 'arr': {
      const F = n.t.fields;   // record: one type per element; arrays of arrays: no resize
      return n.elems.map((e, k) => { const v = evalE(e, ctx), et = F ? F[k].t : n.t.elem; return Array.isArray(v) || isStr(v) || et.kind === 'array' || et.kind === 'str' ? v : V.resize(v, et.w); });
    }
    case 'now': {
      const ps = ctx.sim ? ctx.sim.now : 0;
      return V.fromInt(Math.round(ps / (n.unit || 1)), 64, true);
    }
    default: throw new SimError(`cannot evaluate node '${n.k}'`);
  }
}

// an assigned value at the width of its target: extended by its own sign (Verilog extends the
// right-hand side of an assignment as the right-hand side is signed)
function fit(v, w, s) { return V.withSign(V.resize(v, w), s); }
// an operand at the width and sign of its operator (Verilog comparisons, shifts, ?:): the operand
// takes the sign of the expression first, then is extended (IEEE 1364-2005 5.5.4: a signed operand
// of an unsigned expression is zero-extended)
function fitOp(v, w, s) { return V.resize(V.withSign(v, s), w); }
// the sign an operator evaluates with: the context's (Verilog, elaborate.js ctxSize), else its own
const esign = n => n.es ?? n.t.s;

// VHDL: index outside the range of an array / vector
function indexError(i, t) {
  const [l, r] = t.kind === 'array' ? [t.left, t.right] : [t.left, t.right];
  return new SimError(`index ${i} out of range ${l} ${(t.desc ? 'downto' : 'to')} ${r}`);
}

// equality of values, arrays (and records, arrays of arrays) element by element
export function sameDeep(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((e, i) => sameDeep(e, b[i]));
  if (isStr(a) || isStr(b)) return isStr(a) && isStr(b) && a.str === b.str;
  return V.same(a, b) && a.w === b.w;
}

export function psliceLo(t, start, w, dir) {
  const a = start, b = dir === '+' ? start + w - 1 : start - w + 1;
  return Math.min(bitpos(t, a), bitpos(t, b));
}

// A chain of conditional operators (c0 ? a0 : c1 ? a1 : …, each else another, as deep as the chain is long) in a loop
// (#3375): down the chain while the conditions choose the else (an unknown one: its then value first, as both are
// merged), then each operator up with the value below it as its else
function evalCond(n, ctx) {
  const up = [];   // [operator, its then value fitted (an unknown condition) or null]
  let x = n, v;
  for (;;) {
    const c = V.truth(evalE(x.c, ctx));
    // VHDL, and a Verilog ?: of strings (a parameter = c ? "A" : "B"): the value chosen as it is
    const as = x.vh || x.t.kind === 'str', real = !as && x.t.kind === 'real';
    if (real ? c !== 0 : c === 1) { v = condValue(x, evalE(x.a, ctx)); break; }
    up.push([x, !as && !real && c !== 0 ? fitOp(evalE(x.a, ctx), x.ew || x.t.w, esign(x)) : null]);
    x = x.b;
    if (x.k !== 'cond') { v = evalE(x, ctx); break; }
  }
  for (let i = up.length - 1; i >= 0; i--) {
    const [x, a] = up[i];
    if (!a) { v = condValue(x, v); continue; }
    const w = x.ew || x.t.w, s = esign(x), b = fitOp(v, w, s);
    const m = a.x | b.x | (a.v ^ b.v);
    v = V.mk(w, a.v & ~m, m, s);
  }
  return v;
}
// (the value an operator chose, as it returns it)
function condValue(x, r) {
  const w = x.ew || x.t.w;
  if (x.vh || x.t.kind === 'str') return Array.isArray(r) || isStr(r) ? r : fit(r, w, x.t.s);
  if (x.t.kind === 'real') return r;
  return fitOp(r, w, esign(x));
}

function evalUn(n, ctx) {
  const a = evalE(n.a, ctx);
  if (n.fp) { const x = V.toReal(a); return V.real(n.o === '-' ? -x : Math.abs(x)); }
  const w = n.ew || n.t.w, s = esign(n);
  switch (n.o) {
    case '~': return V.not(V.resize(V.withSign(a, s), w), w, s);
    case '-': return V.neg(V.withSign(a, s), w, s);
    case '!': { const t = V.truth(a); return t < 0 ? V.X1 : V.fromBool(!t); }
    case 'abs': {
      if (a.x) return V.allX(w, true);
      const v = V.toBig(a);
      return V.mk(w, BigInt.asUintN(w, v < 0n ? -v : v), 0n, n.t.s);
    }
    default: return V.reduce(n.o, a);
  }
}

// A chain of binary operators (a + b + c …, each left operand a binary operator, as deep as the chain is long) in a
// loop (#3375): every operator evaluates its left operand first, so the deepest one's, then each operator up with the
// value below it as its left operand
function evalBin(n, ctx) {
  if (n.a.k !== 'bin') return evalBin1(n, ctx, evalE(n.a, ctx));
  const chain = [n];
  while (chain[chain.length - 1].a.k === 'bin') chain.push(chain[chain.length - 1].a);
  let v = evalE(chain[chain.length - 1].a, ctx);
  for (let i = chain.length - 1; i >= 0; i--) v = evalBin1(chain[i], ctx, v);
  return v;
}

// one binary operator, a the value of its left operand
function evalBin1(n, ctx, a) {
  const o = n.o;
  if (o === '&&' || o === '||') {
    a = V.truth(a);
    if (o === '&&' && a === 0) return V.ZERO;
    if (o === '||' && a === 1) return V.ONE;
    const b = V.truth(evalE(n.b, ctx));
    if (o === '&&') return a === 1 && b === 1 ? V.ONE : (b === 0 ? V.ZERO : V.X1);
    return b === 1 ? V.ONE : (a === 0 && b === 0 ? V.ZERO : V.X1);
  }
  if (n.sc) {   // VHDL boolean and / or / nand / nor: the right operand only when needed
    const x = V.truth(a);
    if (x === 0 && (o === '&' || o === 'nand')) return V.fromBool(o === 'nand');
    if (x === 1 && (o === '|' || o === 'nor')) return V.fromBool(o === '|');
  }
  let b = evalE(n.b, ctx);
  // (arrays, records and strings have no bits: v is undefined)
  if ((a.v === undefined || b.v === undefined) && (Array.isArray(a) || Array.isArray(b))) {   // arrays / records (VHDL): element-wise equality
    if (o === '==' || o === '!=') return V.fromBool(sameDeep(a, b) === (o === '=='));
    throw new SimError(`operator ${o} on arrays`);
  }
  if ((a.v === undefined || b.v === undefined) && (isStr(a) || isStr(b))) { // string comparison (VHDL)
    if (o === '==') return V.fromBool(toStr(a) === toStr(b));
    if (o === '!=') return V.fromBool(toStr(a) !== toStr(b));
    if (o === '<' || o === '<=' || o === '>' || o === '>=') {   // VHDL strings: lexicographic order
      const x = toStr(a), y = toStr(b);
      return V.fromBool(o === '<' ? x < y : o === '<=' ? x <= y : o === '>' ? x > y : x >= y);
    }
    throw new SimError(`operator ${o} on strings`);
  }
  if (n.fp) return evalReal(n, a, b);
  const w = n.ew || n.t.w, s = esign(n);
  switch (o) {
    case '==': case '!=': case '===': case '!==': case '<': case '<=': case '>': case '>=': {
      const os = n.a.t.s && n.b.t.s;
      const cw = Math.max(n.cw || 0, a.w, b.w);
      if (n.vh) { // VHDL '=': exact comparison of the values (std_match: constant 'X'/'-' bits are don't cares)
        const A = fitOp(a, cw, os), B = fitOp(b, cw, os);
        let care = V.mask(cw);
        if (n.match) care &= ~((n.a.k === 'c' ? A.x : 0n) | (n.b.k === 'c' ? B.x : 0n));
        const eq = ((A.v ^ B.v) & care) === 0n && ((A.x ^ B.x) & care) === 0n && (!n.match || ((A.x | B.x) & care) === 0n);
        return V.fromBool(o === '==' ? eq : !eq);
      }
      return V.cmp(o, fitOp(a, cw, os), fitOp(b, cw, os));
    }
    case '<<': case '<<<': case '>>': case '>>>': case 'rol': case 'ror':
      if (n.vs) return vhShift(o, fitOp(a, w, s), b, w, n.fill);
  }
  switch (o) {
    case '<<': case '<<<': return V.shl(fitOp(a, w, s), b, w);
    case '>>': return V.shr(fitOp(a, w, s), b, w, false);
    case '>>>': return V.shr(fitOp(a, w, s), b, w, true);
    case 'rol': return V.rotl(fitOp(a, w, s), b);
    case 'ror': return V.rotr(fitOp(a, w, s), b);
  }
  a = V.withSign(a, s); b = V.withSign(b, s);
  if (n.dz && !b.x && b.v === 0n && !ctx.probe) throw new SimError(`division by zero (operator ${o === '/' ? '/' : o})`);
  if (n.ov && !a.x && !b.x && !ctx.probe && ctx.sim && !n.warned) {
    // VHDL INTEGER overflow: reported once per operator (as simulators that do not check it, the
    // result wraps around and the simulation goes on)
    const x = V.toBig(a), y = V.toBig(b), r = o === '+' ? x + y : o === '-' ? x - y : x * y;
    if (r > 2147483647n || r < -2147483648n) { n.warned = true; ctx.sim.report('warning', `integer overflow: ${r} is outside the range of INTEGER`, ctx.loc); }
  }
  switch (o) {
    case '+': return V.add(a, b, w, s);
    case '-': return V.sub(a, b, w, s);
    case '*': return V.mul(a, b, w, s);
    case '/': return V.div(a, b, w, s);
    case '%': case 'rem': return V.rem(a, b, w, s);
    case 'mod': return V.mod(a, b, w, s);
    case '**': return V.pow(a, V.withSign(evalE(n.b, ctx), n.b.t.s), w, s);
    case '&': return V.and(a, b, w, s);
    case '|': return V.or(a, b, w, s);
    case '^': return V.xor(a, b, w, s);
    case '~^': return V.not(V.xor(a, b, w, s));
    case 'nand': return V.not(V.and(a, b, w, s));
    case 'nor': return V.not(V.or(a, b, w, s));
  }
  throw new SimError(`unknown operator ${o}`);
}

// VHDL shift operators: the count is an integer (negative: the opposite shift); fill: bit_vector
// sla / sra (the vacated bits copy the rightmost / leftmost bit).
const OPPOSITE = { '<<': '>>', '>>': '<<', '<<<': '>>>', '>>>': '<<<', rol: 'ror', ror: 'rol' };
function vhShift(o, a, b, w, fill) {
  if (b.x) return V.allX(w, a.s);
  let k = V.toBig(b);
  if (k < 0n) { o = OPPOSITE[o]; k = -k; }
  const cnt = V.fromInt(Number(o === 'rol' || o === 'ror' ? k % BigInt(w || 1) : k > BigInt(w) ? BigInt(w) : k), 32, false);
  switch (o) {
    case '<<': return V.shl(a, cnt, w);
    case '>>': return V.shr(a, cnt, w, false);
    case 'rol': return V.rotl(a, cnt);
    case 'ror': return V.rotr(a, cnt);
  }
  if (!fill) return o === '<<<' ? V.shl(a, cnt, w) : V.shr(a, cnt, w, true);
  const m = Number(cnt.v);
  const edge = o === '<<<' ? V.getBits(a, 0, 1) : V.getBits(a, w - 1, 1);
  const r = o === '<<<' ? V.shl(a, cnt, w) : V.shr(V.withSign(a, false), cnt, w, false);
  return V.setBits(r, o === '<<<' ? 0 : w - m, m, V.repl(m, edge));
}

// Floating point: operands of type REAL (and TIME / integer values mixed with them).
function evalReal(n, a, b) {
  if (a.x || b.x) return n.t.kind === 'real' || n.t.kind === 'time' ? V.allX(64, true) : V.X1;
  const x = V.toReal(V.withSign(a, n.a.t.s || n.a.t.kind === 'time')), y = V.toReal(V.withSign(b, n.b.t.s || n.b.t.kind === 'time'));
  let r;
  switch (n.o) {
    case '==': case '===': return V.fromBool(x === y);
    case '!=': case '!==': return V.fromBool(x !== y);
    case '<': return V.fromBool(x < y);
    case '<=': return V.fromBool(x <= y);
    case '>': return V.fromBool(x > y);
    case '>=': return V.fromBool(x >= y);
    case '+': r = x + y; break;
    case '-': r = x - y; break;
    case '*': r = x * y; break;
    case '/': r = x / y; break;
    case '**': r = x ** y; break;
    default: throw new SimError(`operator ${n.o} on real values`);
  }
  return n.t.kind === 'time' ? V.fromInt(Math.round(r), 64, true) : V.real(r);
}

// ---------------- system functions ----------------
function evalSys(n, ctx) {
  const sim = ctx.sim;
  switch (n.name) {
    case '$time': case '$stime':
      return V.fromInt(Math.round((sim ? sim.now : 0) / (ctx.timeUnit || 1000)), 64, false);
    case '$realtime': return V.real((sim ? sim.now : 0) / (ctx.timeUnit || 1000));
    case '$fopen': return V.fromInt(0x40000000, 32, false);
    case '$sformatf': return { str: formatDisplay(n.args, ctx) };
    case '$random': case '$urandom': {
      if (n.args.length) {   // $random(seed): the seed variable is the state of a generator of its own
        const L = n.args[0], wr = [];
        resolveTarget(L, ctx, wr);
        const cur = evalE(L, ctx);
        let x = (cur.x ? 0 : Number(cur.v & 0xFFFFFFFFn)) || 0x2545F491;
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        const nv = V.fromInt(x | 0, L.t.w, L.t.s);
        for (const w of wr) { if (w.loc != null) w.fr[w.loc] = applyWrite(w.fr[w.loc], w, nv, true); else sim?.write(w, nv); }
        return V.fromInt(x | 0, 32, true);
      }
      const r = sim ? sim.random() : 0;
      return V.fromInt(r, 32, n.name === '$random');
    }
    case '$urandom_range': {
      const hi = V.toNum(evalE(n.args[0], ctx)), lo = n.args[1] ? V.toNum(evalE(n.args[1], ctx)) : 0;
      const r = sim ? sim.random() >>> 0 : 0;
      return V.fromInt(lo + (r % (hi - lo + 1)), 32, false);
    }
    case '$feof': return V.ONE;
    default: throw new SimError(`system function ${n.name} not supported`);
  }
}

// ---------------- user functions ----------------
export function runSync(gen) {
  let r = gen.next();
  while (!r.done) {
    throw new SimError('wait/delay statement not allowed inside a function');
  }
  return r.value;
}

function callFunction(n, ctx) {
  const f = n.fn; // { frameInit(), params:[{i, t}], body, retSlot, retT }
  const { frame, done } = calleeFrame(f, ctx);
  n.args.forEach((a, k) => {
    const p = f.params[k];
    if (!p) return;
    const v = evalE(a, ctx);
    frame[p.i] = Array.isArray(v) ? v.slice() : (p.t.kind === 'str' ? v : fit(v, p.t.w, p.t.s));
  });
  // (the depth counts in the callee's context too: it was copied before the increment, so a function
  // calling itself without end overflowed the JavaScript stack instead of this error)
  if (++ctx.depth > MAX_CALL_DEPTH) { ctx.depth--; throw new SimError(`recursion too deep in function ${f.name} (more than ${MAX_CALL_DEPTH} nested calls)`); }
  const sub = { ...calleeCtx(f, frame, ctx), inFn: true };
  try {
    const r = runSync(exec(f.body, sub));
    let val;
    if (r && r.brk === 'ret') val = r.value;
    else if (f.retSlot != null) val = frame[f.retSlot];
    else throw new SimError(`function ${f.name} ended without return`);
    if (val === undefined) throw new SimError(`function ${f.name} returned nothing`);
    // output / inout arguments: their final values into the actuals (blocking)
    if (n.outTargets) f.params.forEach((p, k) => {
      const L = n.outTargets[k];
      if (L && p.i != null) doAssign({ target: L, value: { k: 'c', val: frame[p.i], t: p.t }, nb: false }, ctx);
    });
    return Array.isArray(val) || isStr(val) ? val : fit(val, f.retT.w, f.retT.s);
  } finally { ctx.depth--; done?.(); }
}

// ---------------- assignment targets ----------------
// Resolve an L-target to a list of writes { sig | loc (in the frame fr), elem, lo, w, t }
export function resolveTarget(L, ctx, out) {
  switch (L.k) {
    case 'sig': out.push({ sig: L.sig, elem: null, lo: 0, w: L.t.w, whole: true }); return;
    case 'loc': out.push({ loc: L.i, fr: locFrame(L, ctx), elem: null, lo: 0, w: L.t.w, whole: true }); return;
    case 'cat': for (const p of L.parts) resolveTarget(p, ctx, out); return;
    case 'elem': {
      const base = [];
      resolveTarget(L.base, ctx, base);
      const b = base[0];
      const i = evalE(L.index, ctx);
      if (i.x) { out.push({ ...b, invalid: true, w: L.t.w }); return; }
      const wr = { ...b, elem: V.toNum(i) - L.base.t.lo, lo: 0, w: L.t.w, whole: false };
      if (L.chk && (wr.elem < 0 || wr.elem >= L.base.t.len)) throw indexError(V.toNum(i), L.base.t);
      // element of an element (arrays of arrays, records): the outer indices form a path
      if (b.elem != null) wr.path = [...(b.path || []), b.elem];
      wr.sub = L.t.kind === 'array';   // the element is itself an array / record
      out.push(wr);
      return;
    }
    case 'aslice': case 'daslice': {   // a slice of an array (#11): one write per element
      const base = [];
      resolveTarget(L.base, ctx, base);
      const b = base[0];
      const rg = L.k === 'aslice' ? { off: L.off, len: L.t.len } : dasliceRange(L, ctx);
      if (!rg) { out.push({ ...b, invalid: true, w: L.t.elem.w }); return; }
      for (let j = 0; j < rg.len; j++) {
        const elem = rg.off + j;
        if (elem < 0 || elem >= L.base.t.len) { out.push({ ...b, invalid: true, w: L.t.elem.w }); continue; }
        const wr = { ...b, elem, lo: 0, w: L.t.elem.w, whole: false, sub: L.t.elem.kind === 'array' };
        if (b.elem != null) wr.path = [...(b.path || []), b.elem];
        out.push(wr);
      }
      return;
    }
    case 'chr': {
      const base = [];
      resolveTarget(L.base, ctx, base);
      const i = evalE(L.index, ctx);
      out.push({ ...base[0], chr: i.x ? -1 : V.toNum(i) - 1, whole: false });
      return;
    }
    case 'bit': case 'slice': case 'dslice': case 'pslice': {
      const base = [];
      resolveTarget(L.base, ctx, base);
      const b = base[0];
      let lo, w = L.t.w;
      if (L.k === 'slice') lo = L.lo;
      else if (L.k === 'bit') {
        const i = evalE(L.index, ctx);
        if (i.x) { out.push({ ...b, invalid: true, w }); return; }
        lo = bitpos(L.base.t, V.toNum(i));
        if (L.chk && (lo < 0 || lo >= L.base.t.w)) throw indexError(V.toNum(i), L.base.t);
      } else if (L.k === 'pslice') {
        const st = evalE(L.start, ctx);
        if (st.x) { out.push({ ...b, invalid: true, w }); return; }
        lo = psliceLo(L.base.t, V.toNum(st), w, L.dir);
      } else {
        const l = evalE(L.left, ctx), r = evalE(L.right, ctx);
        if (L.dir && !l.x && !r.x && nullSlice(L.dir, V.toNum(l), V.toNum(r))) return;   // (a VHDL null slice: nothing written)
        const p1 = bitpos(L.base.t, V.toNum(l)), p2 = bitpos(L.base.t, V.toNum(r));
        lo = Math.min(p1, p2); w = Math.abs(p1 - p2) + 1;
      }
      out.push({ ...b, lo: b.lo + lo, w, whole: false, sub: false, bitsOf: b.whole ? null : b });
      return;
    }
  }
  throw new SimError(`invalid assignment target ${L.k}`);
}

// New value of one array element after applying write wr (wr.elem) with value val.
export function applyElem(old, wr, val) {
  if (wr.sub || Array.isArray(old)) return Array.isArray(val) ? val.slice() : val;
  return wr.lo === 0 && wr.w === old.w ? { ...V.resize(val, old.w), s: old.s } : V.setBits(old, wr.lo, wr.w, V.resize(val, wr.w));
}

// Compute the new full value of a container after applying write wr with value val.
// Arrays: every container owns its array (a whole assignment stores a copy), so an element
// write may update it in place (inPlace) instead of copying the whole memory.
export function applyWrite(cur, wr, val, inPlace = false) {
  if (wr.chr != null) {   // s(i) := c
    const str = toStr(cur);
    if (wr.chr < 0 || wr.chr >= str.length) throw new SimError(`index ${wr.chr + 1} out of range for a string of length ${str.length}`);
    return { str: str.slice(0, wr.chr) + String.fromCharCode(Number(val.v & 255n)) + str.slice(wr.chr + 1) };
  }
  if (wr.path) {   // nested element: copy the containers along the path (they may be shared)
    const [k, ...rest] = wr.path;
    if (!Array.isArray(cur) || k < 0 || k >= cur.length) return cur;
    const arr = inPlace ? cur : cur.slice();
    arr[k] = applyWrite(arr[k], { ...wr, path: rest.length ? rest : null }, val, false);
    return arr;
  }
  if (wr.elem != null) {
    if (!Array.isArray(cur) || wr.elem < 0 || wr.elem >= cur.length) return cur;
    const arr = inPlace ? cur : cur.slice();
    arr[wr.elem] = applyElem(arr[wr.elem], wr, val);
    return arr;
  }
  // (a value of the container's width and sign is stored as it is: values are never changed in place, and a
  // netlist primitive's 0 / 1 stays the shared constant its inputs are compared with, #695)
  if (wr.whole) return Array.isArray(val) ? val.slice() : isStr(val) || val.real !== undefined || cur?.real !== undefined ? val : V.resize(val, cur.w, cur.s);
  return V.setBits(cur, wr.lo, wr.w, V.resize(val, wr.w));
}

// Evaluate an assignment: the value split over the resolved writes, and the delay (ps).
function prepAssign(s, ctx) {
  const val = evalE(s.value, ctx);
  const writes = [];
  resolveTarget(s.target, ctx, writes);
  // Split the value for concatenation targets (MSB part first).
  let parts;
  if (s.target.k === 'aslice' || s.target.k === 'daslice') parts = writes.map((_, k) => (Array.isArray(val) ? val[k] : val));   // element by element
  else if (writes.length === 1) parts = [val];
  else {
    const total = writes.reduce((a, w) => a + w.w, 0);
    const v = V.resize(val, total);
    let off = total;
    parts = writes.map(w => { off -= w.w; return V.getBits(v, off, w.w); });
  }
  let delay = 0;
  if (s.delay) {
    const d = evalE(s.delay, ctx);
    delay = (d.real ?? V.toNum(d)) * (s.delayUnit || 1);
    if (s.prec) delay = Math.round(delay / s.prec) * s.prec;
  }
  return { writes, parts, delay };
}

export function doAssign(s, ctx) {
  const { writes, parts, delay } = prepAssign(s, ctx);
  if (s.rng) {   // VHDL integer subtype: the value must be in its range
    const v = parts[0], x = v.x ? null : Number(V.toBig(v));
    if (x !== null && (x < s.rng[0] || x > s.rng[1])) throw new SimError(`value ${x} out of range ${s.rng[0]} to ${s.rng[1]}`);
  }
  let mech = null;
  if (s.inertial) mech = { mech: 'inertial', cont: false, reject: null };
  if (s.vh) {
    mech = { mech: s.mech, cont: s.cont, reject: null };
    if (s.reject) { const r = evalE(s.reject, ctx); mech.reject = (r.real ?? V.toNum(r)) * (s.delayUnit || 1); }
  }
  writes.forEach((wr, k) => {
    if (wr.invalid) return; // X index: no effect
    if (wr.loc != null) { wr.fr[wr.loc] = applyWrite(wr.fr[wr.loc], wr, parts[k], true); return; }
    if (!ctx.sim) throw new SimError(`cannot assign signal '${wr.sig.name}' in a constant expression`);
    // a queued array value must not change if the source container is updated in place later
    const v = Array.isArray(parts[k]) ? parts[k].slice() : parts[k];
    if (delay > 0) ctx.sim.after(wr, v, delay, s.nb, mech);
    else if (s.nb) { if (mech) ctx.sim.preempt(wr, v, ctx.sim.now, mech, null); ctx.sim.nba(wr, v); }
    else ctx.sim.write(wr, v);
  });
}

// Verilog blocking assignment with an intra-assignment delay (`a = #5 b;`): sample the value,
// suspend the process for the delay, then assign.
function* doAssignIntra(s, ctx) {
  const { writes, parts, delay } = prepAssign(s, ctx);
  yield { delay };
  writes.forEach((wr, k) => {
    if (wr.invalid) return;
    if (wr.loc != null) { wr.fr[wr.loc] = applyWrite(wr.fr[wr.loc], wr, parts[k], true); return; }
    if (!ctx.sim) throw new SimError(`cannot assign signal '${wr.sig.name}' in a constant expression`);
    ctx.sim.write(wr, parts[k]);
  });
}

// ---------------- statements ----------------
// Loop control after a body that ended with r ({ brk, label }): 0 next iteration, 1 leave this
// loop, 2 pass r on (return, or exit / next of an enclosing labelled loop).
function loopCtl(r, s) {
  if (r.brk !== 'exit' && r.brk !== 'next') return 2;
  if (r.label && r.label !== s.label) return 2;
  return r.brk === 'exit' ? 1 : 0;
}

const severities = { note: 0, warning: 1, error: 2, failure: 3 };

export function* exec(s, ctx) {
  switch (s.k) {
    case 'blk':
      for (const x of s.stmts) {
        const r = yield* exec(x, ctx);
        if (r) return r.brk === 'disable' && r.label === s.label ? undefined : r;   // disable <this block>
      }
      return;
    case 'disable': return { brk: 'disable', label: s.label };
    case 'asg':
      ctx.loc = s.loc;
      if (s.intra) { yield* doAssignIntra(s, ctx); return; }
      doAssign(s, ctx);
      return;
    case 'if':   // (an elsif / else if chain followed in a loop: thousands of branches, #2577)
      for (let n = s; ;) {
        if (V.truth(evalE(n.c, ctx)) === 1) return yield* exec(n.then, ctx);
        n = n.else;
        if (!n) return;
        if (n.k !== 'if') return yield* exec(n, ctx);
      }
    case 'case': {
      const sel = evalE(s.sel, ctx);
      for (const it of s.items) {
        for (const ch of it.choices) {
          let hit;
          if (ch.range) {
            if (sel.x) continue;
            const v = V.toBig(V.withSign(sel, s.sel.t.s));
            const a = V.toBig(evalE(ch.range.lo, ctx)), b = V.toBig(evalE(ch.range.hi, ctx));
            hit = v >= (a < b ? a : b) && v <= (a < b ? b : a);
          } else {
            const cv = evalE(ch, ctx);
            const w = Math.max(sel.w, cv.w, s.cw || 0);
            // Verilog: extended as signed only when the case expression and all items are
            hit = s.ss === undefined ? V.caseMatch(V.resize(sel, w), V.resize(cv, w), s.variant) : V.caseMatch(fitOp(sel, w, s.ss), fitOp(cv, w, s.ss), s.variant);
          }
          if (hit) return yield* exec(it.body, ctx);
        }
      }
      if (s.def) return yield* exec(s.def, ctx);
      return;
    }
    case 'for': {
      yield* exec(s.init, ctx);
      let guard = 0;
      while (V.truth(evalE(s.cond, ctx)) === 1) {
        const r = yield* exec(s.body, ctx);
        if (r) { const c = loopCtl(r, s); if (c === 1) break; if (c === 2) return r; }
        yield* exec(s.step, ctx);
        if (++guard > 10_000_000) throw new SimError('loop iteration limit exceeded', s.loc);
      }
      return;
    }
    case 'forrange': {
      const a = V.toNum(evalE(s.from, ctx)), b = V.toNum(evalE(s.to, ctx));
      const step = s.down ? -1 : 1;
      for (let i = a; s.down ? i >= b : i <= b; i += step) {
        ctx.frame[s.var] = V.fromInt(i, s.varT.w, s.varT.s);
        const r = yield* exec(s.body, ctx);
        if (r) { const c = loopCtl(r, s); if (c === 1) break; if (c === 2) return r; }
      }
      return;
    }
    case 'while': {
      let guard = 0;
      while (V.truth(evalE(s.cond, ctx)) === 1) {
        const r = yield* exec(s.body, ctx);
        if (r) { const c = loopCtl(r, s); if (c === 1) break; if (c === 2) return r; }
        if (++guard > 10_000_000) throw new SimError('loop iteration limit exceeded', s.loc);
      }
      return;
    }
    case 'repeat': {
      const n = evalE(s.count, ctx);
      const cnt = n.x ? 0 : V.toNum(n);
      for (let i = 0; i < cnt; i++) {
        const r = yield* exec(s.body, ctx);
        if (r) { const c = loopCtl(r, s); if (c === 1) break; if (c === 2) return r; }
      }
      return;
    }
    case 'forever': {
      let guard = 0;
      for (;;) {
        const t0 = ctx.sim ? ctx.sim.now : 0, st0 = ctx.sim ? ctx.sim.stamp : 0;
        const r = yield* exec(s.body, ctx);
        if (r) { const c = loopCtl(r, s); if (c === 1) break; if (c === 2) return r; }
        if (!ctx.sim || (ctx.sim.now === t0 && ctx.sim.stamp === st0)) {   // an iteration without waiting
          if (ctx.sim && !s.hasWait) throw new SimError('infinite loop without wait/delay', s.loc);
          if (++guard > 10_000_000) throw new SimError('loop iteration limit exceeded', s.loc);
        } else guard = 0;
      }
      return;
    }
    case 'exit': case 'next':
      if (!s.c || V.truth(evalE(s.c, ctx)) === 1) return { brk: s.k, label: s.label };
      return;
    case 'ret': return { brk: 'ret', value: s.value ? evalE(s.value, ctx) : null };
    case 'null': return;
    case 'delay': {
      const amt = evalE(s.amount, ctx);
      const ps = s.prec ? Math.round((amt.real ?? V.toNum(amt)) * s.unit / s.prec) * s.prec : Math.round((amt.real ?? V.toNum(amt)) * s.unit);
      yield { delay: ps };
      if (s.stmt) return yield* exec(s.stmt, ctx);
      return;
    }
    case 'event':
      yield { triggers: s.triggers };
      if (s.stmt) return yield* exec(s.stmt, ctx);
      return;
    case 'wait': {
      if (s.level && s.until) { // Verilog wait(cond): no wait if already true
        while (V.truth(evalE(s.until, ctx)) !== 1) yield { triggers: s.triggers };
        return;
      }
      if (s.forT && !s.until && !s.triggers.length) { yield { delay: V.toNum(evalE(s.forT, ctx)) }; return; }
      if (!s.forT && !s.until && !s.triggers.length) { yield { forever: true }; return; }
      const deadline = s.forT ? ctx.sim.now + V.toNum(evalE(s.forT, ctx)) : null;
      for (;;) {
        const r = yield { triggers: s.triggers, deadline };
        if (r === 'timeout') return;
        if (!s.until || V.truth(evalE(s.until, ctx)) === 1) return;
      }
    }
    case 'task': {
      const f = s.fn;
      const { frame, done } = calleeFrame(f, ctx);
      try {
        s.args.forEach((a, k) => {
          const p = f.params[k];
          if (p && !p.alias && p.dir !== 'out' && a) {
            const v = evalE(a, ctx);
            frame[p.i] = Array.isArray(v) ? v.slice() : (isStr(v) || p.t.kind === 'str' ? v : fit(v, p.t.w, p.t.s));
          }
        });
        const sub = calleeCtx(f, frame, ctx);
        const r = yield* exec(f.body, sub);
        if (r && r.brk === 'disable' && r.label !== f.name) return r;   // (disable of an enclosing block)
        // copy back outputs
        s.args.forEach((a, k) => {
          const p = f.params[k];
          if (p && !p.alias && p.dir !== 'in' && s.outTargets[k]) {
            doAssign({ target: s.outTargets[k], value: { k: 'c', val: frame[p.i], t: p.t }, nb: p.sigNb || false }, ctx);
          }
        });
        return;
      } finally { done?.(); }
    }
    case 'sys': return yield* execSys(s, ctx);
    case 'textio': textio(s, ctx); return;
    // Verilog fork / join: the simulator starts one child thread per branch (sharing this frame)
    // and resumes this one when all (join) / any (join_any) / none (join_none) of them are done.
    case 'fork':
      ctx.loc = s.loc;
      if (s.branches.length) yield { fork: s, ctx };
      return;
    case 'waitfork': yield { waitFork: true }; return;
    case 'disablefork': yield { disableFork: true }; return;
    case 'report': {
      const msg = toStr(evalE(s.msg, ctx), s.msg.t);
      ctx.sim?.report(s.sev, msg, s.loc);
      if (severities[s.sev] >= 3) { ctx.sim?.finish('failure'); if (ctx.sim && !ctx.inFn) yield { forever: true }; }
      return;
    }
    case 'assert': {
      const c = V.truth(evalE(s.c, ctx));
      // (quiet: a Verilog assertion's else action reports it)
      if (c !== 1 && !s.quiet) {
        const msg = s.msg ? toStr(evalE(s.msg, ctx), s.msg.t) : 'Assertion violation.';
        ctx.sim?.report(s.sev, msg, s.loc);
        if (severities[s.sev] >= 3) { ctx.sim?.finish('failure'); if (ctx.sim && !ctx.inFn) yield { forever: true }; }
      }
      return;
    }
    default: throw new SimError(`cannot execute '${s.k}'`);
  }
}

function* execSys(s, ctx) {
  const sim = ctx.sim;
  switch (s.name) {
    case '$display': case '$displayb': case '$displayh': case '$write': case '$strobe': {
      const radix = s.name === '$displayb' ? 'b' : s.name === '$displayh' ? 'h' : 'd';
      const text = formatDisplay(s.args, ctx, radix);
      if (s.name === '$strobe') sim?.strobe(() => formatDisplay(s.args, ctx, radix));
      else sim?.print(text, s.name !== '$write');
      return;
    }
    case '$monitor': sim?.monitor(s.args, ctx); return;
    // file output: there are no files in the simulation; the text goes to the log
    case '$fdisplay': case '$fwrite': case '$fstrobe': {
      const text = formatDisplay(s.args.slice(1), ctx);
      if (s.name === '$fstrobe') sim?.strobe(() => formatDisplay(s.args.slice(1), ctx));
      else sim?.print(text, s.name !== '$fwrite');
      return;
    }
    case '$fclose': case '$fflush': return;
    case '$sformat': case '$swrite': {   // $sformat(target, format, args...): the text into a variable
      const L = s.args[0], wr = [];
      const str = formatDisplay(s.args.slice(1), ctx);
      const v = isStr(evalE(L, ctx)) ? { str } : V.resize(strToVal(str), L.t.w);
      resolveTarget(L, ctx, wr);
      for (const w of wr) { if (w.loc != null) w.fr[w.loc] = applyWrite(w.fr[w.loc], w, v, true); else sim?.write(w, v); }
      return;
    }
    case '$finish': case '$stop': case 'finish': case 'stop': sim?.finish(s.name.replace('$', '')); yield { forever: true }; return;
    case '$error': case '$warning': case '$info': case '$fatal': {
      const args = s.name === '$fatal' && s.args.length && s.args[0].k === 'c' && !isStr(s.args[0].val) ? s.args.slice(1) : s.args;
      const sev = { $error: 'error', $warning: 'warning', $info: 'note', $fatal: 'failure' }[s.name];
      sim?.report(sev, formatDisplay(args, ctx), s.loc);
      if (sev === 'failure') { sim?.finish('fatal'); yield { forever: true }; }
      return;
    }
    case '$readmemh': case '$readmemb': {
      const file = toStr(evalE(s.args[0], ctx));
      sim?.readmem(file, s.args[1], s.name === '$readmemh' ? 16 : 2, ctx);
      return;
    }
    case '$dumpfile': case '$dumpvars': case '$dumpon': case '$dumpoff': case '$timeformat': case '$printtimescale': case '$dumpall': case '$dumpflush':
      return;
    default:
      sim?.report('warning', `system task ${s.name} not supported (ignored)`, s.loc);
  }
}
