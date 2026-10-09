// Interpreter for bound (elaborated) expressions and statements.
// Statements run as generators so processes can suspend on delays / waits.
//
// Bound expression nodes (produced by elaborate.js) all carry `t` (ElType) and optionally `ew`
// (evaluation width from Verilog context sizing). See elaborate.js for the node catalogue.
import * as V from './values.js';

export class SimError extends Error {
  constructor(msg, loc) { super(msg); this.loc = loc; }
}

// Bit position of logical index i within a vector type.
export function bitpos(t, i) {
  return t.desc ? i - t.right : t.right - i;
}

const isStr = v => v && v.str !== undefined;

export function evalE(n, ctx) {
  switch (n.k) {
    case 'c': return n.val;
    case 'sig': return n.sig.val;
    case 'loc': return ctx.frame[n.i];
    case 'bit': {
      const b = evalE(n.base, ctx), i = evalE(n.index, ctx);
      if (i.x) return V.X1;
      return V.getBits(b, bitpos(n.base.t, V.toNum(i)), 1);
    }
    case 'elem': {
      const arr = evalE(n.base, ctx), i = evalE(n.index, ctx);
      const et = n.t;
      if (i.x) return V.allX(et.w, et.s);
      const k = V.toNum(i) - n.base.t.lo;
      if (k < 0 || k >= arr.length) return V.allX(et.w, et.s);
      return arr[k];
    }
    case 'slice': return { ...V.getBits(evalE(n.base, ctx), n.lo, n.t.w), s: n.t.s };
    case 'dslice': {
      const b = evalE(n.base, ctx), l = evalE(n.left, ctx), r = evalE(n.right, ctx);
      if (l.x || r.x) return V.allX(n.t.w);
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
    case 'un': return evalUn(n, ctx);
    case 'bin': return evalBin(n, ctx);
    case 'cond': {
      const w = n.ew || n.t.w;
      const c = V.truth(evalE(n.c, ctx));
      if (n.vh) { const r = evalE(c === 1 ? n.a : n.b, ctx); return Array.isArray(r) || isStr(r) ? r : fit(r, w, n.t.s); }
      if (c === 1) return fit(evalE(n.a, ctx), w, n.t.s);
      if (c === 0) return fit(evalE(n.b, ctx), w, n.t.s);
      const a = fit(evalE(n.a, ctx), w, n.t.s), b = fit(evalE(n.b, ctx), w, n.t.s);
      const x = a.x | b.x | (a.v ^ b.v);
      return V.mk(w, a.v & ~x, x, n.t.s);
    }
    case 'cat': return V.concat(n.parts.map(p => V.resize(evalE(p, ctx), p.t.w)));
    case 'repl': {
      const c = evalE(n.count, ctx);
      return V.repl(V.toNum(c), V.resize(evalE(n.a, ctx), n.a.t.w));
    }
    case 'conv': { // resize/sign conversion; ext = signedness used for extension
      const a = evalE(n.a, ctx);
      if (n.sres && n.t.w < a.w) { // numeric_std resize(signed): sign bit + low bits
        const w = n.t.w, low = w > 1 ? V.getBits(a, 0, w - 1) : V.mk(0);
        return V.withSign(V.concat([V.getBits(a, a.w - 1, 1), low]), true);
      }
      return V.withSign(V.resize(V.withSign(a, n.ext), n.t.w), n.t.s);
    }
    case 'call': return callFunction(n, ctx);
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
    case 'str': return { str: n.value };
    case 'image': return { str: imageOf(evalE(n.a, ctx), n.a.t) };
    case 'strcat': return { str: n.parts.map(p => toStr(evalE(p, ctx), p.t)).join('') };
    case 'arr': return n.elems.map(e => V.resize(evalE(e, ctx), n.t.elem.w));
    case 'now': {
      const ps = ctx.sim ? ctx.sim.now : 0;
      return V.fromInt(Math.round(ps / (n.unit || 1)), 64, true);
    }
    default: throw new SimError(`cannot evaluate node '${n.k}'`);
  }
}

function fit(v, w, s) { return V.withSign(V.resize(v, w), s); }

export function psliceLo(t, start, w, dir) {
  const a = start, b = dir === '+' ? start + w - 1 : start - w + 1;
  return Math.min(bitpos(t, a), bitpos(t, b));
}

function evalUn(n, ctx) {
  const a = evalE(n.a, ctx);
  const w = n.ew || n.t.w;
  switch (n.o) {
    case '~': return V.not(V.resize(V.withSign(a, n.t.s), w), w, n.t.s);
    case '-': return V.neg(V.withSign(a, n.t.s), w, n.t.s);
    case '!': { const t = V.truth(a); return t < 0 ? V.X1 : V.fromBool(!t); }
    case 'abs': {
      if (a.x) return V.allX(w, true);
      const v = V.toBig(a);
      return V.mk(w, BigInt.asUintN(w, v < 0n ? -v : v), 0n, n.t.s);
    }
    default: return V.reduce(n.o, a);
  }
}

function evalBin(n, ctx) {
  const o = n.o;
  if (o === '&&' || o === '||') {
    const a = V.truth(evalE(n.a, ctx));
    if (o === '&&' && a === 0) return V.ZERO;
    if (o === '||' && a === 1) return V.ONE;
    const b = V.truth(evalE(n.b, ctx));
    if (o === '&&') return a === 1 && b === 1 ? V.ONE : (b === 0 ? V.ZERO : V.X1);
    return b === 1 ? V.ONE : (a === 0 && b === 0 ? V.ZERO : V.X1);
  }
  let a = evalE(n.a, ctx), b = evalE(n.b, ctx);
  if (isStr(a) || isStr(b)) { // string comparison (VHDL)
    if (o === '==') return V.fromBool(toStr(a) === toStr(b));
    if (o === '!=') return V.fromBool(toStr(a) !== toStr(b));
    throw new SimError(`operator ${o} on strings`);
  }
  const w = n.ew || n.t.w, s = n.t.s;
  switch (o) {
    case '==': case '!=': case '===': case '!==': case '<': case '<=': case '>': case '>=': {
      const os = n.a.t.s && n.b.t.s;
      const cw = Math.max(n.cw || 0, a.w, b.w);
      if (n.vh) { // VHDL '=': exact comparison of the values (std_match: constant 'X'/'-' bits are don't cares)
        const A = fit(a, cw, os), B = fit(b, cw, os);
        let care = V.mask(cw);
        if (n.match) care &= ~((n.a.k === 'c' ? A.x : 0n) | (n.b.k === 'c' ? B.x : 0n));
        const eq = ((A.v ^ B.v) & care) === 0n && ((A.x ^ B.x) & care) === 0n && (!n.match || ((A.x | B.x) & care) === 0n);
        return V.fromBool(o === '==' ? eq : !eq);
      }
      return V.cmp(o, fit(a, cw, os), fit(b, cw, os));
    }
    case '<<': case '<<<': return V.shl(fit(a, w, s), b, w);
    case '>>': return V.shr(fit(a, w, s), b, w, false);
    case '>>>': return V.shr(fit(a, w, s), b, w, true);
    case 'rol': return V.rotl(fit(a, w, s), b);
    case 'ror': return V.rotr(fit(a, w, s), b);
  }
  a = V.withSign(a, s); b = V.withSign(b, s);
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

// ---------------- strings / formatting ----------------
export function toStr(v, t) {
  if (isStr(v)) return v.str;
  if (Array.isArray(v)) return '(' + v.map(e => toStr(e, t?.elem)).join(', ') + ')';
  return imageOf(v, t);
}

export function imageOf(v, t) {
  if (isStr(v)) return v.str;
  if (!t) return V.toDec(v);
  switch (t.kind) {
    case 'enum': return v.x ? 'U' : (t.names[Number(v.v)] ?? V.toDec(v));
    case 'bool': return v.x ? 'X' : (v.v ? 'true' : 'false');
    case 'int': return V.toDec(v, true);
    case 'time': return v.x ? 'X' : formatTime(Number(V.toBig(v)));
    case 'logic': return t.w === 1 && t.scalar ? `'${V.toBin(v)}'` : V.toBin(v).toUpperCase();
    default: return V.toDec(v);
  }
}

export function formatTime(ps) {
  if (ps % 1e6 === 0 && ps !== 0) return `${ps / 1e6} us`;
  if (ps % 1000 === 0) return `${ps / 1000} ns`;
  return `${ps} ps`;
}

// Verilog $display-style formatting.
export function formatDisplay(args, ctx, defaultRadix = 'd') {
  let out = '';
  let i = 0;
  const nextVal = () => {
    const a = args[i++];
    return a ? { v: evalE(a, ctx), t: a.t } : { v: { str: '' } };
  };
  while (i < args.length) {
    const a = args[i];
    if (a.k === 'str' || (a.k === 'c' && isStr(a.val))) {
      i++;
      const fmt = a.k === 'str' ? a.value : a.val.str;
      for (let k = 0; k < fmt.length; k++) {
        const ch = fmt[k];
        if (ch !== '%') { out += ch; continue; }
        let j = k + 1, width = '';
        while (/[0-9]/.test(fmt[j] || '')) width += fmt[j++];
        const spec = (fmt[j] || '').toLowerCase();
        k = j;
        if (spec === '%') { out += '%'; continue; }
        if (spec === 'm') { out += ctx.scopeName || ''; continue; }
        const { v, t } = nextVal();
        out += fmtOne(v, t, spec, width, ctx);
      }
    } else {
      const { v, t } = nextVal();
      out += fmtOne(v, t, defaultRadix, '', ctx);
    }
  }
  return out;
}

function fmtOne(v, t, spec, width, ctx) {
  if (isStr(v)) return v.str;
  if (Array.isArray(v)) return toStr(v, t);
  let s;
  switch (spec) {
    case 'b': s = V.toBin(v); break;
    case 'h': case 'x': s = V.toHex(v).toLowerCase(); if (width === '') s = s.padStart(Math.ceil(v.w / 4), '0'); break;
    case 'o': s = v.x ? 'x' : v.v.toString(8); break;
    case 'c': s = v.x ? '?' : String.fromCharCode(Number(v.v & 255n)); break;
    case 's': { let b = v.v, str = ''; while (b > 0n) { str = String.fromCharCode(Number(b & 255n)) + str; b >>= 8n; } s = str; break; }
    case 't': s = V.toDec(v); break;
    case 'd': default:
      s = t && t.kind === 'enum' ? imageOf(v, t) : V.toDec(v, v.s);
      if (width === '' && t && t.kind !== 'enum') s = s.padStart(Math.ceil(v.w * Math.log10(2)) + (v.s ? 1 : 0), ' ');
  }
  if (width !== '' && width !== '0') s = s.padStart(+width, spec === 'd' ? ' ' : '0');
  return s;
}

// Convert a Verilog string literal value to bits (8 bits per char) when used as a vector.
export function strToVal(str) {
  let v = 0n;
  for (const ch of str) v = (v << 8n) | BigInt(ch.charCodeAt(0) & 255);
  return V.mk(Math.max(8, str.length * 8), v);
}

// ---------------- system functions ----------------
function evalSys(n, ctx) {
  const sim = ctx.sim;
  switch (n.name) {
    case '$time': case '$stime': case '$realtime':
      return V.fromInt(Math.round((sim ? sim.now : 0) / (ctx.timeUnit || 1000)), 64, false);
    case '$random': case '$urandom': {
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
  const frame = f.frameInit();
  n.args.forEach((a, k) => {
    const p = f.params[k];
    if (!p) return;
    const v = evalE(a, ctx);
    frame[p.i] = Array.isArray(v) ? v.slice() : (p.t.kind === 'str' ? v : fit(v, p.t.w, p.t.s));
  });
  const sub = { ...ctx, frame };
  if (++ctx.depth > 2000) throw new SimError(`recursion too deep in function ${f.name}`);
  try {
    const r = runSync(exec(f.body, sub));
    let val;
    if (r && r.brk === 'ret') val = r.value;
    else if (f.retSlot != null) val = frame[f.retSlot];
    else throw new SimError(`function ${f.name} ended without return`);
    if (val === undefined) throw new SimError(`function ${f.name} returned nothing`);
    return Array.isArray(val) || isStr(val) ? val : fit(val, f.retT.w, f.retT.s);
  } finally { ctx.depth--; }
}

// ---------------- assignment targets ----------------
// Resolve an L-target to a list of writes { sig | loc, elem, lo, w, t }
function resolveTarget(L, ctx, out) {
  switch (L.k) {
    case 'sig': out.push({ sig: L.sig, elem: null, lo: 0, w: L.t.w, whole: true }); return;
    case 'loc': out.push({ loc: L.i, elem: null, lo: 0, w: L.t.w, whole: true }); return;
    case 'cat': for (const p of L.parts) resolveTarget(p, ctx, out); return;
    case 'elem': {
      const base = [];
      resolveTarget(L.base, ctx, base);
      const b = base[0];
      const i = evalE(L.index, ctx);
      if (i.x) { out.push({ ...b, invalid: true, w: L.t.w }); return; }
      out.push({ ...b, elem: V.toNum(i) - L.base.t.lo, lo: 0, w: L.t.w, whole: false });
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
      } else if (L.k === 'pslice') {
        const st = evalE(L.start, ctx);
        if (st.x) { out.push({ ...b, invalid: true, w }); return; }
        lo = psliceLo(L.base.t, V.toNum(st), w, L.dir);
      } else {
        const l = evalE(L.left, ctx), r = evalE(L.right, ctx);
        const p1 = bitpos(L.base.t, V.toNum(l)), p2 = bitpos(L.base.t, V.toNum(r));
        lo = Math.min(p1, p2); w = Math.abs(p1 - p2) + 1;
      }
      out.push({ ...b, lo: b.lo + lo, w, whole: false, bitsOf: b.whole ? null : b });
      return;
    }
  }
  throw new SimError(`invalid assignment target ${L.k}`);
}

// Compute the new full value of a container after applying write wr with value val.
export function applyWrite(cur, wr, val) {
  if (wr.elem != null) {
    if (!Array.isArray(cur) || wr.elem < 0 || wr.elem >= cur.length) return cur;
    const arr = cur.slice();
    const old = arr[wr.elem];
    arr[wr.elem] = wr.lo === 0 && wr.w === old.w ? { ...V.resize(val, old.w), s: old.s } : V.setBits(old, wr.lo, wr.w, V.resize(val, wr.w));
    return arr;
  }
  if (wr.whole) return Array.isArray(val) ? val : { ...V.resize(val, cur.w), s: cur.s };
  return V.setBits(cur, wr.lo, wr.w, V.resize(val, wr.w));
}

// Evaluate an assignment: the value split over the resolved writes, and the delay (ps).
function prepAssign(s, ctx) {
  const val = evalE(s.value, ctx);
  const writes = [];
  resolveTarget(s.target, ctx, writes);
  // Split the value for concatenation targets (MSB part first).
  let parts;
  if (writes.length === 1) parts = [val];
  else {
    const total = writes.reduce((a, w) => a + w.w, 0);
    const v = V.resize(val, total);
    let off = total;
    parts = writes.map(w => { off -= w.w; return V.getBits(v, off, w.w); });
  }
  let delay = 0;
  if (s.delay) { const d = evalE(s.delay, ctx); delay = (d.real ?? V.toNum(d)) * (s.delayUnit || 1); }
  return { writes, parts, delay };
}

function doAssign(s, ctx) {
  const { writes, parts, delay } = prepAssign(s, ctx);
  let mech = null;
  if (s.vh) {
    mech = { mech: s.mech, cont: s.cont, reject: null };
    if (s.reject) { const r = evalE(s.reject, ctx); mech.reject = (r.real ?? V.toNum(r)) * (s.delayUnit || 1); }
  }
  writes.forEach((wr, k) => {
    if (wr.invalid) return; // X index: no effect
    if (wr.loc != null) { ctx.frame[wr.loc] = applyWrite(ctx.frame[wr.loc], wr, parts[k], true); return; }
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
    if (wr.loc != null) { ctx.frame[wr.loc] = applyWrite(ctx.frame[wr.loc], wr, parts[k], true); return; }
    if (!ctx.sim) throw new SimError(`cannot assign signal '${wr.sig.name}' in a constant expression`);
    ctx.sim.write(wr, parts[k]);
  });
}

// ---------------- statements ----------------
const severities = { note: 0, warning: 1, error: 2, failure: 3 };

export function* exec(s, ctx) {
  switch (s.k) {
    case 'blk':
      for (const x of s.stmts) {
        const r = yield* exec(x, ctx);
        if (r) return r;
      }
      return;
    case 'asg':
      ctx.loc = s.loc;
      if (s.intra) { yield* doAssignIntra(s, ctx); return; }
      doAssign(s, ctx);
      return;
    case 'if': {
      const c = V.truth(evalE(s.c, ctx));
      if (c === 1) return yield* exec(s.then, ctx);
      if (s.else) return yield* exec(s.else, ctx);
      return;
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
            const w = Math.max(sel.w, cv.w);
            hit = V.caseMatch(V.resize(sel, w), V.resize(cv, w), s.variant);
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
        if (r) { if (r.brk === 'exit') break; if (r.brk !== 'next') return r; }
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
        if (r) { if (r.brk === 'exit') break; if (r.brk !== 'next') return r; }
      }
      return;
    }
    case 'while': {
      let guard = 0;
      while (V.truth(evalE(s.cond, ctx)) === 1) {
        const r = yield* exec(s.body, ctx);
        if (r) { if (r.brk === 'exit') break; if (r.brk !== 'next') return r; }
        if (++guard > 10_000_000) throw new SimError('loop iteration limit exceeded', s.loc);
      }
      return;
    }
    case 'repeat': {
      const n = evalE(s.count, ctx);
      const cnt = n.x ? 0 : V.toNum(n);
      for (let i = 0; i < cnt; i++) {
        const r = yield* exec(s.body, ctx);
        if (r) { if (r.brk === 'exit') break; if (r.brk !== 'next') return r; }
      }
      return;
    }
    case 'forever': {
      for (;;) {
        const t0 = ctx.sim ? ctx.sim.now : 0, st0 = ctx.sim ? ctx.sim.stamp : 0;
        const r = yield* exec(s.body, ctx);
        if (r) { if (r.brk === 'exit') break; if (r.brk !== 'next') return r; }
        if (ctx.sim && ctx.sim.now === t0 && ctx.sim.stamp === st0 && !s.hasWait)
          throw new SimError('infinite loop without wait/delay', s.loc);
      }
      return;
    }
    case 'exit': case 'next':
      if (!s.c || V.truth(evalE(s.c, ctx)) === 1) return { brk: s.k };
      return;
    case 'ret': return { brk: 'ret', value: s.value ? evalE(s.value, ctx) : null };
    case 'null': return;
    case 'delay': {
      const amt = evalE(s.amount, ctx);
      const ps = Math.round((amt.real ?? V.toNum(amt)) * s.unit);
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
      const frame = f.frameInit();
      s.args.forEach((a, k) => {
        const p = f.params[k];
        if (p && !p.alias && p.dir !== 'out' && a) {
          const v = evalE(a, ctx);
          frame[p.i] = Array.isArray(v) ? v.slice() : (isStr(v) || p.t.kind === 'str' ? v : fit(v, p.t.w, p.t.s));
        }
      });
      const sub = { ...ctx, frame };
      const r = yield* exec(f.body, sub);
      // copy back outputs
      s.args.forEach((a, k) => {
        const p = f.params[k];
        if (p && !p.alias && p.dir !== 'in' && s.outTargets[k]) {
          doAssign({ target: s.outTargets[k], value: { k: 'c', val: frame[p.i], t: p.t }, nb: p.sigNb || false }, ctx);
        }
      });
      if (r && r.brk === 'ret') return;
      return;
    }
    case 'sys': return yield* execSys(s, ctx);
    case 'report': {
      const msg = toStr(evalE(s.msg, ctx), s.msg.t);
      ctx.sim?.report(s.sev, msg, s.loc);
      if (severities[s.sev] >= 3) ctx.sim?.finish('failure');
      return;
    }
    case 'assert': {
      const c = V.truth(evalE(s.c, ctx));
      if (c !== 1) {
        const msg = s.msg ? toStr(evalE(s.msg, ctx), s.msg.t) : 'Assertion violation.';
        ctx.sim?.report(s.sev, msg, s.loc);
        if (severities[s.sev] >= 3) ctx.sim?.finish('failure');
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
