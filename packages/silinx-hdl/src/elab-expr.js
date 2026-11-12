// Elaboration of expressions (#405: out of elaborate.js): an IR expression bound into an executable node (see the
// node kinds in elaborate.js's header): names resolved through the scopes (hierarchical ones too), operators typed and
// sized for Verilog and VHDL, slices, fields and packed elements, conversions, the built-in subprograms, function calls
// with their overloads and defaults, std.textio. elaborate.js imports bindExpr and the rest from here; this module
// takes the types, scopes and binders it needs from elaborate.js (the two only call each other: they load in either
// order).
import * as V from './values.js';
import { evalE, strToVal, bitpos } from './interp.js';
import { mapBits } from './vhdl/parser.js';
import {
  BIT, BOOL, CHAR, ElabError, INT, PHYS, REAL, STR, TIME, charConst, constOf, defaultValue, diag, elabType,
  enumChar, evalRange, fold, locNode, newSignal, packageScope, probeCtx, scalarBounds, stdTypeName, strVec, vecT,
} from './elaborate.js';
import { bindBuiltin, bindCall, bindVlogCall, positional } from './elab-call.js';
export { BUILTIN_SUBPROGRAMS, TEXTIO_PROCS, bindTextio, boundFunction, checkCallNesting, pickOverload, positional } from './elab-call.js';

const ARITH = new Set(['+', '-', '*', '/', '%', 'mod', 'rem', '**']);
const BITWISE = new Set(['&', '|', '^', '~^', 'nand', 'nor']);
const CMP = new Set(['==', '!=', '===', '!==', '<', '<=', '>', '>=']);
const SHIFT = new Set(['<<', '>>', '<<<', '>>>', 'rol', 'ror']);

function lookupOrErr(E, name, loc) {
  const e = E.sc.lookup(name);
  if (e) return e;
  return null;
}

// x'event / rising_edge(x) operand: a signal, or one bit of a vector signal (constant index)
export function edgeOperand(node) {
  if (node && node.k === 'sig') return { sig: node.sig };
  if (node && node.k === 'bit' && node.base.k === 'sig' && node.index.k === 'c') return { sig: node.base.sig, bit: bitpos(node.base.t, V.toNum(node.index.val)) };
  return null;
}

// VHDL subprogram alias: the alias name stands for the subprogram (a user subprogram: the same
// entry; a built-in one: calls are redirected to its name)
export function defSubAlias(E, name, target) {
  const te = E.sc.lookup(target);
  E.sc.def(name, te && (te.kind === 'func' || te.kind === 'subalias') ? te : { kind: 'subalias', target });
}

function refNode(E, entry, name) {
  switch (entry.kind) {
    case 'sig': return { k: 'sig', sig: entry.sig, t: entry.t || entry.sig.t, name };
    case 'const': return { k: 'c', val: entry.val, t: entry.t, name };
    case 'loc': return locNode(E, entry, name);
    case 'alias': return entry.rv;   // VHDL signal parameter: the actual signal itself
  }
  return null;
}

export function bindExpr(E, e, expect = null, loc) {
  const n = bindExpr0(E, e, expect, loc);
  return n;
}

function bindExpr0(E, e, expect, loc) {
  loc = e.loc || loc;
  switch (e.op) {
    case 'lit': {
      if (E.lang === 'vhdl' && expect && expect.char && e.scalar && e.ch) return charConst(e.ch);
      if (E.lang === 'vhdl' && expect && expect.kind === 'enum' && e.scalar && e.ch) { const c = enumChar(expect, e.ch); if (c) return c; }
      if (E.lang === 'vhdl' && expect && expect.kind === 'str' && e.text !== undefined) return { k: 'str', value: e.text, t: STR };
      if (E.lang === 'vhdl' && expect && expect.kind === 'str' && !e.scalar && /^[01]+$/.test(e.bits)) return { k: 'str', value: e.bits, t: STR };
      const val = V.fromBits(e.bits, !!e.signed);
      const t = e.scalar ? BIT : vecT(val.w, !!e.signed);
      if (E.lang === 'verilog' && e.sized === false && /^[xz]/.test(e.bits)) return { k: 'c', val, t, xext: e.bits[0] };
      if (E.lang === 'vhdl' && e.scalar && expect && expect.kind === 'logic' && expect.w > 1 && !expect.unconstrained) {
        // e.g. assigning '0' where a vector is expected is an error in VHDL; be lenient and extend
        return { k: 'c', val: V.resize(val, expect.w), t: expect };
      }
      if (E.lang === 'vhdl' && !e.scalar && e.sized) return { k: 'c', val, t, strText: e.text ?? e.bits };
      return { k: 'c', val, t };
    }
    case 'int': {
      const b = BigInt(e.value);
      if (E.lang === 'vhdl') return { k: 'c', val: V.mk(32, BigInt.asUintN(32, b), 0n, true), t: INT };
      let w = 32;
      while ((b >= 0n ? b >= 1n << BigInt(w - 1) : -b > 1n << BigInt(w - 1))) w += 32;
      return { k: 'c', val: V.mk(w, BigInt.asUintN(w, b), 0n, true), t: w === 32 ? INT : vecT(w, true) };
    }
    case 'real': return { k: 'c', val: V.real(e.value), t: REAL };
    case 'phys': {
      const ps = Math.round(e.value * (PHYS[e.unit] ?? 1));
      return { k: 'c', val: V.fromInt(ps, 64, true), t: TIME };
    }
    case 'str': {
      if (E.lang === 'verilog' && expect && expect.kind === 'logic') return { k: 'c', val: strToVal(e.value), t: vecT(Math.max(8, e.value.length * 8)) };
      if (E.lang === 'vhdl' && e.char && expect && expect.char) return charConst(e.value);
      if (E.lang === 'vhdl' && e.char && expect && expect.kind === 'enum') { const c = enumChar(expect, e.value); if (c) return c; }
      // a string where a vector is expected: std_logic characters only (XST rejects "1020X01Q")
      if (E.lang === 'vhdl' && expect && expect.kind === 'logic' && !e.char) {
        const wrong = [...e.value].find(c => !/^[01uxzwlh-]$/i.test(c));
        if (wrong !== undefined) throw new ElabError(`'${wrong}' is not a std_logic value (in the string "${e.value}")`, loc);
        return strAsLogic({ k: 'str', value: e.value, t: STR }, { t: expect });
      }
      return { k: 'str', value: e.value, t: STR };
    }
    case 'fill': {
      const w = expect ? expect.w : 1;
      const bit = e.bit;
      // ('0 '1 'x 'z: in a context-determined expression the fill extends to the context width)
      return { k: 'c', val: V.fromBits(bit.repeat(w)), t: expect || BIT, fillBit: bit };
    }
    case 'ref': {
      const entry = e.pkg ? packageScope(E.ctx, e.pkg, E.file, loc, E)?.lookup(e.name) : lookupOrErr(E, e.name, loc);
      if (entry?.kind === 'subalias') return bindExpr0(E, { ...e, name: entry.target }, expect, loc);
      if (entry) {
        const n = refNode(E, entry, e.name);
        if (n) return expect?.kind === 'logic' ? strVec(E, n) : n;
        if (entry.kind === 'func') return bindCall(E, entry, [], e.name, loc);
        if (entry.kind === 'type') throw new ElabError(`type '${e.name}' used as a value`, loc);
      }
      if (e.pkg) throw notDeclared(e.name, loc);
      if (E.lang === 'vhdl' && e.name === 'now') return { k: 'now', t: TIME, unit: 1 };
      if (!entry && E.lang === 'verilog' && (e.path || e.name.includes('.'))) {
        const r = hierResolve(E, e.name, e.path, loc);
        if (r?.node) return r.node;
        if (r?.entry) {
          const n = refNode(E, r.entry, e.name);
          if (n) return n;
          if (r.entry.kind === 'func') return bindCall(E, r.entry, [], e.name, loc);
        }
      }
      if (E.implicitNets && E.lang === 'verilog' && E.inst && !e.name.includes('.')) {
        diag(E, `implicit net '${e.name}' (declare it with 'wire')`, loc, 'warning');
        const sig = newSignal(E, E.prefix + e.name, BIT, V.allX(1), 'signal', loc);
        E.sc.def(e.name, { kind: 'sig', sig, t: BIT });
        return { k: 'sig', sig, t: BIT, name: e.name };
      }
      if (e.name.includes('.')) {
        // a signal of a generate block of this instance (blk[2].t)
        const gs = E.inst.signals.find(x => x.name === E.prefix + e.name) || E.inst.signals.find(x => x.name === e.name);
        if (gs) return { k: 'sig', sig: gs, t: gs.t, name: e.name };
        const hs = hierLookup(E, e.name);
        if (hs) return hs.k === 'xloc' ? { ...hs, loc } : hs;
      }
      throw notDeclared(e.name, loc);
    }
    case 'index': {
      const base = strVec(E, bindExpr(E, e.base, null, loc));
      return fold(indexNode(E, base, e.index, loc));
    }
    case 'slice': {
      const base = strVec(E, bindExpr(E, e.base, null, loc));
      return fold(sliceNode(E, base, e.left, e.right, loc, e.dir));
    }
    case 'pslice': {
      const base = strVec(E, bindExpr(E, e.base, null, loc));
      const w = V.toNum(constOf(E, bindExpr(E, e.width), loc));
      const start = bindExpr(E, e.start, null, loc);
      return fold({ k: 'pslice', base, start, dir: e.dir, t: vecT(w) });
    }
    case 'apply': return bindApply(E, e, expect, loc);
    case 'call': return bindVlogCall(E, e, expect, loc);
    case 'concat': {
      let parts = e.parts.map(p => bindExpr(E, p, null, loc));
      if (E.lang === 'vhdl' && parts.some(p => p.t.kind === 'str' || p.t.char)) {
        // "ab" & "-" & 'c': the string literals made of std_logic characters are strings here
        parts = parts.map((p, k) => (p.k === 'c' && p.t.kind === 'logic' && !p.src && (p.strText !== undefined || e.parts[k].ch)
          ? { k: 'str', value: p.strText ?? e.parts[k].ch, t: STR } : p));
        return { k: 'strcat', parts, t: STR };
      }
      if (E.lang === 'verilog') parts = parts.map(p => strVec(E, p));
      if (parts.some(p => p.t.kind === 'str')) return { k: 'strcat', parts, t: STR };
      if (parts.length === 1 && E.lang === 'verilog') return { k: 'conv', a: parts[0], ext: false, t: vecT(parts[0].t.w) };
      const w = parts.reduce((a, p) => a + p.t.w, 0);
      return fold({ k: 'cat', parts, t: vecT(w) });
    }
    case 'repl': {
      const count = bindExpr(E, e.count, null, loc);
      const n = V.toNum(constOf(E, count, loc));
      const a = bindExpr(E, e.value, null, loc);
      return fold({ k: 'repl', count: { k: 'c', val: V.fromInt(n), t: INT }, a, t: vecT(n * a.t.w) });
    }
    case 'unary': {
      const a = bindExpr(E, e.a, expect, loc);
      let t;
      if (e.o === '+' && E.lang === 'vhdl') return a;
      if (a.t.kind === 'real' && (e.o === '-' || e.o === 'abs')) return fold({ k: 'un', o: e.o, a, t: REAL, fp: true });
      if (e.o === '~' || e.o === '-' || e.o === 'abs') t = a.t.kind === 'bool' ? BOOL : (a.t.kind === 'int' || a.t.kind === 'time' ? a.t : vecT(a.t.w, a.t.s));
      else t = E.lang === 'vhdl' && e.o === '!' ? BOOL : BIT;
      if (e.o === '~' && a.t.kind === 'logic' && a.t.scalar) t = BIT;
      return fold({ k: 'un', o: e.o, a, t });
    }
    case 'binary': return fold(bindBinary(E, e, expect, loc));
    case 'cond': return bindCond(E, e, expect, loc);
    case 'attr': return bindAttr(E, e, loc);
    case 'field': return fold(fieldNode(E, bindExpr(E, e.base, null, loc), e.name, loc));
    case 'aggregate': return bindAggregate(E, e, expect, loc);
    case 'qualified': {
      const te = e.pkg ? packageScope(E.ctx, e.pkg, E.file, loc, E)?.lookup(e.type) : E.sc.lookup(e.type);
      const sn = stdTypeName(e.type);
      let t = te && te.kind === 'type' ? te.t : null;
      // unsigned'(0 => x) / std_logic_vector'(a, b): the aggregate's own length gives the width
      if (!t && sn && e.expr.op === 'aggregate' && e.expr.items.length && e.expr.items.every(i => !i.choices || i.choices.every(c => c && c.op === 'int'))) {
        const n = Math.max(e.expr.items.length, ...e.expr.items.flatMap(i => (i.choices || []).map(c => Number(c.value) + 1)));
        t = vecT(n, !!sn.signed);
      }
      let inner = bindExpr(E, e.expr, t || expect, loc);
      if (sn && sn.kind === 'logic' && inner.k === 'str') inner = strAsLogic(inner, { t: vecT(1) });
      // (std_logic_vector'(…) / bit_vector'(…) carry their type mark: overloads on the type, #72)
      if (sn && inner.t.kind === 'logic') { const { mark: _m, ...it } = inner.t; return fold({ k: 'conv', a: inner, ext: inner.t.s, t: { ...it, s: !!sn.signed, ...(sn.mark ? { mark: sn.mark } : {}) } }); }
      return inner;
    }
  }
  throw new ElabError(`unsupported expression '${e.op}'`, loc);
}

// VHDL record element selection r.f: the element of the record (an array of its fields)
export function fieldNode(E, base, name, loc) {
  // a member of a SystemVerilog packed structure: its bits of the vector
  if (base.t.members) {
    const m = base.t.members.find(x => x.name === name);
    if (!m) throw new ElabError(`structure has no member '${name}'`, loc);
    return { k: 'slice', base, lo: m.lo, t: m.t };
  }
  const F = base.t.fields;
  if (!F) throw new ElabError(`'${name}' selected from an expression that is not a record`, loc);
  const k = F.findIndex(f => f.name === name);
  if (k < 0) throw new ElabError(`record has no field '${name}'`, loc);
  return { k: 'elem', base, index: { k: 'c', val: V.fromInt(k), t: INT }, t: F[k].t };
}

// (hier: a hierarchical name, which may name a generate block elaborated later)
export function notDeclared(name, loc) {
  const err = new ElabError(`'${name}' is not declared`, loc);
  if (name.includes('.')) err.hier = true;
  return err;
}

// the parts of a hierarchical name's text: a.b[2].c -> [{ name: 'a' }, { name: 'b', index: 2 }, { name: 'c' }]
function splitHier(name) {
  return name.split('.').map(p => {
    const m = /^(.*)\[(-?\d+)\]$/.exec(p);
    return m ? { name: m[1], index: { op: 'int', value: m[2] } } : { name: p, index: null };
  });
}

// A hierarchical name inside the module (IEEE 1364-2005 12.5-12.6, 1800-2017 23.6-23.9): the first
// name is found upwards in the enclosing scopes (a generate block, a named block, a generate loop
// indexed by a constant expression, the module itself by the module's name); each next name in the
// scope the name before it names, or a member of the packed structure it selects (s.a, s[1].b).
// Returns { entry } (what the scope declares under the last name: signal, constant, variable,
// function, task) or { node } (a member or element select), or null.
export function hierResolve(E, name, path, loc) {
  const segs = path || splitHier(name);
  if (segs.length < 2) return null;
  let cur = E.sc.lookup(segs[0].name), node = null;
  if (!cur && E.modSc && segs[0].name === E.inst?.module && !segs[0].index) cur = { kind: 'gen', sc: E.modSc };
  if (!cur) return null;
  const toNode = seg => {
    if (!node) node = refNode(E, cur, seg.name);
    if (!node) throw new ElabError(`'${seg.name}' is not a value`, loc);
  };
  const select = seg => {
    if (!seg.index) return true;
    if (!node && cur.kind === 'genarr') {
      const i = V.toNum(constOf(E, bindExpr(E, seg.index, null, loc), loc));
      cur = cur.elems.get(i);
      return !!cur;
    }
    toNode(seg);
    node = fold(indexNode(E, node, seg.index, loc));
    return true;
  };
  if (!select(segs[0])) return null;
  for (let k = 1; k < segs.length; k++) {
    const seg = segs[k];
    if (!node && cur.kind === 'gen') {
      cur = cur.sc.local(seg.name);
      if (!cur) return null;
    } else {
      if (!node && (cur.kind === 'genarr' || cur.kind === 'func')) return null;
      toNode(segs[k - 1]);
      node = fold(fieldNode(E, node, seg.name, loc));
    }
    if (!select(seg)) return null;
  }
  return node ? { node } : { entry: cur };
}

// Verilog hierarchical reference relative to the current instance or from the top: a signal
// (inst.sub.sig) or a variable of a named block of a process (inst.blk.v, a node reading the
// process's frame: #12). Returns a node, or null.
function hierLookup(E, name) {
  const parts = name.split('.');
  const findChild = (i, n) => i.children.find(c => c.name === n);
  const blockVar = (inst, key, nm) => {
    const bv = inst?.blockVars?.get(key);
    return bv ? { k: 'xloc', ref: bv.ref, i: bv.i, t: bv.t, name: nm } : null;
  };
  // a named block of this instance (blk.v from another process)
  const own = blockVar(E.inst, E.prefix + name, name) || blockVar(E.inst, name, name);
  if (own) return own;
  // walk up to find the first component
  let start = E.inst;
  while (start && !findChild(start, parts[0]) && start.name !== parts[0]) start = start.parent;
  if (!start) return null;
  let cur = start.name === parts[0] && !findChild(start, parts[0]) ? start : findChild(start, parts[0]);
  let k = 1;
  for (; k < parts.length - 1 && cur && findChild(cur, parts[k]); k++) cur = findChild(cur, parts[k]);
  if (!cur) return null;
  const rest = parts.slice(k);
  if (rest.length > 1) return blockVar(cur, rest.join('.'), name);
  const sig = cur.signals.find(s => s.name === rest[0]) || cur.ports.find(p => p.name === rest[0])?.sig;
  if (sig) return { k: 'sig', sig, t: sig.t, name };
  // a parameter of the instance (u.P): its value
  const prm = cur.params?.find(p => p.name === rest[0]);
  return prm && prm.value ? { k: 'c', val: prm.value, t: prm.t, name } : null;
}

// an element of a packed array (logic [0:3][7:0], my_t [3:0]): its bits of the vector, the
// first element the most significant when the range is ascending, the last when descending
export function packedElem(base, index) {
  const p = base.t.packed, ew = p.elem.w;
  if (index.k === 'c' && !index.val.x) {
    const off = bitpos(p, V.toNum(index.val));
    if (off >= 0 && off < p.n) return { k: 'slice', base, lo: off * ew, t: p.elem };
  }
  // offset of the element: (i - right) or (right - i), times the element's width
  const cI32 = n => ({ k: 'c', val: V.fromInt(n), t: INT });
  const i = { k: 'conv', a: index, ext: !!index.t.s, t: INT };
  const off = p.desc ? { k: 'bin', o: '-', a: i, b: cI32(p.right), t: INT } : { k: 'bin', o: '-', a: cI32(p.right), b: i, t: INT };
  const start = { k: 'bin', o: '*', a: off, b: cI32(ew), t: INT };
  return { k: 'pslice', base, start, dir: '+', t: p.elem };
}

function indexNode(E, base, idxExpr, loc) {
  const index = bindExpr(E, idxExpr, null, loc);
  if (base.t.packed) return packedElem(base, index);
  // (chk: VHDL, an index outside the range of the array is a run-time error)
  if (base.t.kind === 'array') return { k: 'elem', base, index, t: base.t.elem, ...(E.lang === 'vhdl' ? { chk: true } : {}) };
  if (base.t.kind === 'str') return { k: 'chr', base, index, t: CHAR };   // s(i): a CHARACTER
  if (index.k === 'c' && !index.val.x) {
    const p = bitpos(base.t, V.toNum(index.val));
    if (p < 0 || p >= base.t.w) diag(E, `index ${V.toDec(index.val, true)} out of range for '${base.name || 'expression'}'`, loc, 'warning');
  }
  return { k: 'bit', base, index, t: BIT, ...(E.lang === 'vhdl' ? { chk: true } : {}) };
}

export function sliceNode(E, base, leftE, rightE, loc, dir) {
  const left = bindExpr(E, leftE, null, loc), right = bindExpr(E, rightE, null, loc);
  // a slice of a string (s(1 to n), n known at run time too): a string
  if (base.t.kind === 'str') return { k: 'strslice', base, left, right, ...(dir ? { dir } : {}), t: STR };
  if (base.t.kind === 'array') return arraySliceNode(E, base, left, right, loc, dir);
  if (left.k === 'c' && right.k === 'c') {
    // a VHDL null slice (`v(-1 downto 0)`, `v(0 to -1)`): no element
    if (E.lang === 'vhdl' && dir && (dir === 'downto' ? V.toNum(left.val) < V.toNum(right.val) : V.toNum(left.val) > V.toNum(right.val))) {
      return { k: 'slice', base, lo: 0, t: { ...vecT(0, base.t.kind === 'logic' ? base.t.s : false), ...(base.t.mark ? { mark: base.t.mark } : {}) } };
    }
    const p1 = bitpos(base.t, V.toNum(left.val)), p2 = bitpos(base.t, V.toNum(right.val));
    const lo = Math.min(p1, p2), w = Math.abs(p1 - p2) + 1;
    // a slice against its signal's direction (#1692): VHDL `a(1 to 2)` of a (3 downto 0) (a slice keeps its prefix's
    // direction), Verilog `a[1:2]` of a [3:0] (a part-select in the vector's order); XST refuses both
    if (base.k === 'sig' && p1 < p2) {
      const l = V.toNum(left.val), r = V.toNum(right.val), d = base.t.desc ? 'downto' : 'to';
      diag(E, E.lang === 'vhdl' ? `slice ${l} ${dir || (l > r ? 'downto' : 'to')} ${r} of '${base.name}' against its direction (${base.t.left} ${d} ${base.t.right})`
        : `part-select [${l}:${r}] of '${base.name}' in the opposite order of its range [${base.t.left}:${base.t.right}]`, loc);
    }
    if (lo < 0 || lo + w > base.t.w) diag(E, `slice out of range for '${base.name || 'expression'}'`, loc, 'warning');
    // (Verilog: a part-select is unsigned, even of a signed vector; VHDL: a slice keeps the type)
    return { k: 'slice', base, lo, t: { ...vecT(w, base.t.kind === 'logic' && E.lang === 'vhdl' ? base.t.s : false), ...(base.t.mark ? { mark: base.t.mark } : {}) } };
  }
  // dynamic slice: width from a probe evaluation (loop variables at their initial values)
  // A VHDL slice keeps its direction: against it, it is null (`v(i + N - 1 downto i)` with N = 0,
  // #61): no element, nothing read or written
  const vdir = E.lang === 'vhdl' && dir ? dir : undefined;
  let w;
  try {
    // (probe: loop variables are not at real values yet, so no run-time checks)
    const ctx = probeCtx(E);
    const l = V.toNum(evalE(left, ctx)), r = V.toNum(evalE(right, ctx));
    w = vdir && (vdir === 'downto' ? l < r : l > r) ? 0 : Math.abs(l - r) + 1;
  } catch {
    throw new ElabError('slice bounds must be constant (or depend only on loop variables)', loc);
  }
  return { k: 'dslice', base, left, right, t: vecT(w), ...(vdir ? { dir: vdir } : {}) };
}

// A slice of an array (`mem(0 to 3)` of an array of vectors, #11): the elements of a constant
// range, as an array of the same element type (arrays are stored by ascending index, so the
// slice is the elements from its low bound on); a null range has none
function arraySliceNode(E, base, left, right, loc, dir) {
  const t = base.t;
  const desc = dir ? dir === 'downto' : t.desc;
  // bounds known at run time only (`br(n to size - 1) := (others => x"00")` in a function): the
  // elements are found when it is evaluated; its length here is the probe's (loop variables at their
  // first values), 0 when it cannot be probed
  if (left.k !== 'c' || right.k !== 'c') {
    let len = 0, l0 = t.lo, r0 = t.lo - 1;
    try {
      const ctx = probeCtx(E);
      l0 = V.toNum(evalE(left, ctx)); r0 = V.toNum(evalE(right, ctx));
      len = (E.lang === 'vhdl' && (desc ? l0 < r0 : l0 > r0)) ? 0 : Math.abs(l0 - r0) + 1;
    } catch { /* not probed */ }
    return { k: 'daslice', base, left, right, ...(E.lang === 'vhdl' ? { dir: desc ? 'downto' : 'to' } : {}),
      t: { kind: 'array', left: l0, right: r0, desc, lo: Math.min(l0, r0), len, elem: t.elem, w: t.elem.w, dynamic: true }, loc };
  }
  const l = V.toNum(left.val), r = V.toNum(right.val);
  const isNull = E.lang === 'vhdl' && (desc ? l < r : l > r);
  const lo = Math.min(l, r), len = isNull ? 0 : Math.abs(l - r) + 1, off = lo - t.lo;
  if (len && (off < 0 || off + len > t.len)) diag(E, `slice out of range for '${base.name || 'expression'}'`, loc, 'warning');
  return { k: 'aslice', base, off, t: { kind: 'array', left: l, right: r, desc, lo, len, elem: t.elem, w: t.elem.w }, loc };
}

// A VHDL string literal of std_logic characters (kept as a string inside report / assert
// messages) compared with a vector is a vector literal.
export function strAsLogic(n, other) {
  if (n.k !== 'str' || other.t.kind !== 'logic' || !/^[01uxzwlh-]+$/i.test(n.value)) return n;
  const val = V.fromBits(mapBits(n.value));
  return { k: 'c', val, t: vecT(val.w) };
}

// std_logic_signed: std_logic_vector operands of arithmetic and comparisons are signed
export function slvNum(E, n) {
  if (E.slvArith !== 'signed' || n.t.kind !== 'logic' || n.t.mark !== 'std_logic_vector' || n.t.s) return n;
  return fold({ k: 'conv', a: n, ext: true, t: { ...n.t, s: true } });
}

// std_logic_arith mixes unsigned and signed operands as signed: the unsigned one is extended
// with a 0 sign bit (numeric_std does not allow the mix, so this never changes its results)
function mixedSign(a, b) {
  if (a.t.kind !== 'logic' || b.t.kind !== 'logic' || !!a.t.s === !!b.t.s) return [a, b];
  const widen = n => fold({ k: 'conv', a: n, ext: false, t: vecT(n.t.w + 1, true) });
  return a.t.s ? [a, widen(b)] : [widen(a), b];
}

function harmonizeVhdl(a, b) {
  // numeric_std: vector op integer -> integer converted to the vector's width
  if (a.t.kind === 'logic' && (b.t.kind === 'int')) b = fold({ k: 'conv', a: b, ext: true, t: vecT(a.t.w, a.t.s) });
  else if (b.t.kind === 'logic' && (a.t.kind === 'int')) a = fold({ k: 'conv', a, ext: true, t: vecT(b.t.w, b.t.s) });
  return [a, b];
}

// A chain of conditional operators (c0 ? a0 : c1 ? a1 : …, x when c0 else y when c1 else …: each else another, as deep
// as the chain is long) bound in a loop (#3375): each condition and then value from the top down, the last else, then
// each operator from the deepest up with the one below it as its else
function bindCond(E, e, expect, loc) {
  const chain = [];
  let x = e, l = loc;
  for (;;) {
    chain.push([bindExpr(E, x.cond, null, l), bindExpr(E, x.then, expect, l)]);
    if (x.else.op !== 'cond') break;
    x = x.else;
    l = x.loc || l;
  }
  let b = bindExpr(E, x.else, expect, l);
  for (let i = chain.length - 1; i >= 0; i--) b = cond1(E, ...chain[i], b);
  return b;
}
function cond1(E, c, a, b) {
  if (E.lang === 'verilog' && (a.t.kind === 'str' || b.t.kind === 'str')) { a = strVec(E, a); b = strVec(E, b); }
  if (E.lang === 'verilog' && (a.t.kind === 'real') !== (b.t.kind === 'real')) {
    // Verilog: an operand of type real makes the whole ?: real (IEEE 1364-2005 4.8.1)
    const toReal = x => (x.t.kind === 'real' ? x : fold({ k: 'conv', a: x, ext: !!x.t.s, t: REAL }));
    a = toReal(a); b = toReal(b);
  }
  const w = Math.max(a.t.w, b.t.w);
  // (Verilog: signed only when both operands are, even at the same width)
  const sameSign = !!a.t.s === !!b.t.s || E.lang === 'vhdl';
  let t = a.t.kind === b.t.kind && a.t.w === b.t.w && sameSign ? a.t : vecT(w, a.t.s && b.t.s);
  if (a.t.kind === 'array' || a.t.kind === 'str') t = a.t;
  // VHDL `x when c else y`: a condition that is not true selects the else value
  return fold({ k: 'cond', c, a, b, t, vh: E.lang === 'vhdl' });
}

// A chain of binary operators (a + b + c + …: each left operand a binary operator, as deep as the chain is long) bound
// in a loop (#3375): the left operands' expectations and locations from the top down, then each operator from the
// deepest up, its left operand the one bound before (folded, as bindExpr folds it)
function bindBinary(E, e, expect, loc) {
  const chain = [[e, expect, loc]];
  for (let x = e, ex = expect, l = loc; x.a.op === 'binary';) {
    ex = ARITH.has(x.o) || BITWISE.has(x.o) ? ex : null;
    l = x.a.loc || l;
    x = x.a;
    chain.push([x, ex, l]);
  }
  let a = null;
  for (let i = chain.length - 1; i >= 0; i--) {
    const n = bindBinary1(E, ...chain[i], a);
    a = i ? fold(n) : n;
  }
  return a;
}

// one binary operator (a: its left operand bound, or null)
function bindBinary1(E, e, expect, loc, a) {
  const o = e.o;
  let b;
  if (a) b = bindExpr(E, e.b, a.t.kind === 'logic' || a.t.kind === 'enum' ? a.t : null, loc);
  else if (e.a.op === 'aggregate' && e.b.op !== 'aggregate') { b = bindExpr(E, e.b, null, loc); a = bindExpr(E, e.a, b.t, loc); }
  else { a = bindExpr(E, e.a, ARITH.has(o) || BITWISE.has(o) ? expect : null, loc); b = bindExpr(E, e.b, a.t.kind === 'logic' || a.t.kind === 'enum' ? a.t : null, loc); }
  if (E.lang === 'vhdl' && (BITWISE.has(o) || ARITH.has(o))) { a = strAsLogic(a, b); b = strAsLogic(b, a); }
  if (E.lang === 'verilog') { a = strVec(E, a); b = strVec(E, b); }
  if (E.lang === 'vhdl' && (ARITH.has(o) || CMP.has(o))) { a = slvNum(E, a); b = slvNum(E, b); }
  // REAL operands: floating point (time * real, real / real, comparisons...)
  const fp = a.t.kind === 'real' || b.t.kind === 'real';
  if (fp && CMP.has(o)) return { k: 'bin', o, a, b, t: E.lang === 'vhdl' ? BOOL : BIT, fp };
  if (fp && (ARITH.has(o))) return { k: 'bin', o, a, b, t: a.t.kind === 'time' || b.t.kind === 'time' ? TIME : REAL, fp };
  if (CMP.has(o)) {
    if (E.lang === 'vhdl' && a.t.kind === 'enum' && b.k === 'c') b = { ...b, t: a.t };
    if (E.lang === 'vhdl') { a = strAsLogic(a, b); b = strAsLogic(b, a); [a, b] = mixedSign(a, b); }
    // std_logic_1164 '=' on std_logic_vector (no std_logic_unsigned / _signed): arrays of
    // different lengths are never equal (IEEE 1076 §9.2.3)
    if (E.lang === 'vhdl' && !E.slvArith && (o === '==' || o === '!=') && a.t.kind === 'logic' && b.t.kind === 'logic' &&
        (a.t.mark || b.t.mark) && a.t.w !== b.t.w) return { k: 'c', val: V.fromBool(o === '!='), t: BOOL };
    // VHDL '=' / '/=' compare the enumeration values exactly ('X' = 'X' is true, 'U' /= '1' too);
    // the matching ?= / ?/= treat '-' (constant) bits as don't cares
    if (E.lang === 'vhdl') return { k: 'bin', o, a, b, t: BOOL, vh: o === '==' || o === '!=', ...(e.match && a.t.kind === 'logic' ? { match: true } : {}) };
    return { k: 'bin', o, a, b, t: BIT };
  }
  if (o === '&&' || o === '||') return { k: 'bin', o, a, b, t: BIT };
  if (SHIFT.has(o)) {
    const n = { k: 'bin', o, a, b, t: a.t.kind === 'int' ? a.t : { ...vecT(a.t.w, a.t.s), ...(a.t.mark ? { mark: a.t.mark } : {}) } };
    // VHDL sll/srl/sla/sra/rol/ror: a negative count shifts the other way; bit_vector sla / sra
    // replicate the rightmost / leftmost bit (numeric_std's sla / sra are shift_left / shift_right)
    if (E.lang === 'vhdl') { n.vs = true; if (a.t.mark === 'bit_vector') n.fill = true; }
    return n;
  }
  if (E.lang === 'vhdl' && (ARITH.has(o) && o !== '**')) [a, b] = harmonizeVhdl(a, b);
  if (E.lang === 'vhdl' && ARITH.has(o) && o !== '**') [a, b] = mixedSign(a, b);
  const s = a.t.s && b.t.s;
  if (a.t.kind === 'int' && b.t.kind === 'int') {
    // VHDL INTEGER: division by zero and results outside the 32-bit range are run-time errors
    const chk = E.lang !== 'vhdl' ? {} : o === '/' || o === 'mod' || o === 'rem' ? { dz: true } : o === '+' || o === '-' || o === '*' ? { ov: true } : {};
    return { k: 'bin', o, a, b, t: INT, ...chk };
  }
  if (a.t.kind === 'time' && b.t.kind === 'time' && o === '/') return { k: 'bin', o, a, b: { ...b, t: { ...b.t, s: true } }, t: { ...INT, w: 64 } };   // time / time: universal integer
  if (a.t.kind === 'time' || b.t.kind === 'time') return { k: 'bin', o, a, b, t: TIME };
  if (o === '**') return { k: 'bin', o, a, b, t: a.t.kind === 'int' ? INT : vecT(a.t.w, a.t.s) };
  let w = Math.max(a.t.w, b.t.w);
  if (o === '*' && E.lang === 'vhdl') w = a.t.w + b.t.w;
  // (VHDL boolean and / or / nand / nor are short-circuit operators: sc)
  if (BITWISE.has(o) && a.t.kind === 'bool' && b.t.kind === 'bool') return { k: 'bin', o, a, b, t: BOOL, ...(o !== '^' && o !== '~^' ? { sc: true } : {}) };
  const t = BITWISE.has(o) && w === 1 && (a.t.scalar || b.t.scalar) ? BIT : vecT(w, s);
  return { k: 'bin', o, a, b, t };
}

// An aggregate of an unconstrained array type takes its bounds (IEEE 1076-2008 9.3.3.3, #2548): a positional one
// from the index subtype's left bound in its direction (`natural range <>`: 0 to n - 1), a named one from its
// choices, in the index subtype's direction. (Elements are stored from the low index up.)
function unconstrainedAggregate(E, e, expect, loc) {
  const desc = !!expect.idesc, mk = (lo, len, elems) => fold({
    k: 'arr', elems, t: { ...expect, unconstrained: false, left: desc ? lo + len - 1 : lo, right: desc ? lo : lo + len - 1, desc, lo, len },
  });
  if (e.items.every(i => !i.choices)) {
    const elems = e.items.map(i => bindExpr(E, i.value, expect.elem, loc)), lb = expect.ileft ?? 0;
    return mk(desc ? lb - elems.length + 1 : lb, elems.length, desc ? elems.reverse() : elems);
  }
  const at = new Map();
  for (const it of e.items) {
    if (!it.choices) throw new ElabError('an aggregate mixes positional and named elements', loc);
    const val = bindExpr(E, it.value, expect.elem, loc);
    for (const ch of it.choices) {
      if (ch === 'others') throw new ElabError('aggregate with others needs a constrained target', loc);
      if (ch.range) {
        const r = evalRange(E, ch.range);
        if (!r.isNull) for (let i = Math.min(r.left, r.right); i <= Math.max(r.left, r.right); i++) at.set(i, val);
      } else at.set(V.toNum(constOf(E, bindExpr(E, ch, null, loc), loc)), val);
    }
  }
  if (!at.size) return mk(expect.ileft ?? 0, 0, []);
  const lo = Math.min(...at.keys()), len = Math.max(...at.keys()) - lo + 1;
  const elems = Array.from({ length: len }, (_, k) => at.get(lo + k));
  const gap = elems.findIndex(x => !x);
  if (gap >= 0) throw new ElabError(`aggregate has no element for index ${lo + gap}`, loc);
  return mk(lo, len, elems);
}

function bindAttr(E, e, loc) {
  const at = e.attr.toLowerCase();
  if (at === 'image' || at === 'to_string') {
    const a = bindExpr(E, e.args[0], null, loc);
    // T'image(x): formatted as a value of T (boolean / enumeration prefixes)
    const pe = e.prefix.op === 'ref' ? (e.prefix.pkg ? packageScope(E.ctx, e.prefix.pkg, E.file, loc, E)?.lookup(e.prefix.name) : E.sc.lookup(e.prefix.name)) : null;
    const it = pe && pe.kind === 'type' && pe.t && (pe.t.kind === 'enum' || pe.t.kind === 'bool') ? pe.t
      : e.prefix.op === 'ref' && /^boolean$/i.test(e.prefix.name) ? BOOL : e.prefix.op === 'ref' && /^character$/i.test(e.prefix.name) ? CHAR : null;
    if (it === CHAR && a.k === 'str' && a.value.length === 1) return { k: 'image', a: charConst(a.value), t: STR, it };
    return { k: 'image', a, t: STR, ...(it ? { it } : {}), ...(at === 'to_string' ? { ts: true } : {}) };
  }
  // prefix could be a type name
  let t, node = null;
  if (e.prefix.op === 'ref') {
    const ent = e.prefix.pkg ? packageScope(E.ctx, e.prefix.pkg, E.file, loc, E)?.lookup(e.prefix.name) : E.sc.lookup(e.prefix.name);
    if (ent && ent.kind === 'type') t = ent.t;
    else if (!ent && stdTypeName(e.prefix.name)) t = elabType(E, stdTypeName(e.prefix.name));
  }
  if (!t) { node = bindExpr(E, e.prefix, null, loc); t = node.t; }
  const cint = n => ({ k: 'c', val: V.fromInt(n, 32, true), t: INT });
  // A'length(N) ... of a multi-dimensional array (an array of arrays): dimension N
  if (e.args.length && t.kind === 'array' && ['length', 'left', 'right', 'high', 'low', 'ascending'].includes(at)) {
    const dim = V.toNum(constOf(E, bindExpr(E, e.args[0], null, loc), loc));
    for (let k = 1; k < dim; k++) { if (t.elem?.kind !== 'array' && t.elem?.kind !== 'logic') throw new ElabError(`'${at}(${dim}): no dimension ${dim}`, loc); t = t.elem; }
  }
  if (t.kind === 'str' && at === 'length' && node) return { k: 'strlen', a: node, t: INT };
  // the bounds of a string (strings index from 1 here): 'low / 'left 1, 'high / 'right its length
  if (t.kind === 'str' && ['left', 'low'].includes(at)) return cint(1);
  if (t.kind === 'str' && ['right', 'high'].includes(at)) return t.slen !== undefined ? cint(t.slen) : node ? { k: 'strlen', a: node, t: INT } : cint(0);
  if (t.kind === 'str' && at === 'ascending') return { k: 'c', val: V.fromBool(true), t: BOOL };
  if (t.kind === 'str' && at === 'length' && t.slen !== undefined) return cint(t.slen);
  if (t.kind === 'str' && at !== 'event') throw new ElabError(`'${at} of a string is not supported (use std_logic_vector)`, loc);
  if ((t.kind === 'int' || t.kind === 'enum' || t.kind === 'bool') && ['left', 'right', 'high', 'low'].includes(at)) {
    // scalar types: bounds of the range; T'low is T'left of an ascending range, T'right of a
    // descending one (a null range too: `range 5 to 3` has 'low 5, 'high 3; IEEE 1076-2008 16.2.2)
    const [l, r] = t.kind === 'int' ? scalarBounds(t) : [0, t.kind === 'bool' ? 1 : t.names.length - 1];
    const down = t.kind === 'int' && !!t.rdown;
    const v = { left: l, right: r, low: down ? r : l, high: down ? l : r }[at];
    return t.kind === 'int' ? cint(v) : { k: 'c', val: V.fromInt(v, t.w, false), t };
  }
  switch (at) {
    case 'event':
      if (!edgeOperand(node)) throw new ElabError("'event requires a signal", loc);
      return { k: 'event', ...edgeOperand(node), t: BOOL };
    case 'length': return cint(t.kind === 'array' ? t.len : t.w);
    case 'ascending': return { k: 'c', val: V.fromBool(t.kind === 'int' ? !t.rdown : t.kind === 'enum' || t.kind === 'bool' ? true : !t.desc), t: BOOL };
    case 'left': return cint(t.left);
    case 'right': return cint(t.right);
    // (by the direction: a null range `3 downto 5` has 'high 3, 'low 5)
    case 'high': return cint(t.desc === undefined ? Math.max(t.left, t.right) : t.desc ? t.left : t.right);
    case 'low': return cint(t.desc === undefined ? Math.min(t.left, t.right) : t.desc ? t.right : t.left);
    case 'pos': return fold({ k: 'conv', a: bindExpr(E, e.args[0], t, loc), ext: false, t: INT });
    case 'val': return fold({ k: 'conv', a: bindExpr(E, e.args[0], null, loc), ext: true, t });
    case 'succ': case 'pred': case 'leftof': case 'rightof': {
      // ('leftof is 'pred, 'rightof is 'succ; the other way round for a descending integer subtype)
      const a = bindExpr(E, e.args[0], null, loc);
      const up = at === 'succ' || (at === 'rightof') !== (t.kind === 'int' && !!t.rdown);
      if (t.kind === 'int') return fold({ k: 'bin', o: up ? '+' : '-', a, b: cint(1), t: INT });
      return fold({ k: 'bin', o: up ? '+' : '-', a, b: { k: 'c', val: V.fromInt(1, a.t.w, false), t: vecT(a.t.w) }, t });
    }
    case 'value': {   // T'value("text") of a constant string
      const a = bindExpr(E, e.args[0], STR, loc);
      const str = a.k === 'str' ? a.value : a.k === 'c' && a.val.str !== undefined ? a.val.str : null;
      if (str === null) throw new ElabError("'value needs a constant string", loc);
      const txt = str.trim().toLowerCase();
      if (t.kind === 'enum') {
        const i = t.names.indexOf(txt);
        if (i < 0) throw new ElabError(`'${str}' is not a value of type '${t.name}'`, loc);
        return { k: 'c', val: V.fromInt(i, t.w, false), t };
      }
      if (t.kind === 'bool' && (txt === 'true' || txt === 'false')) return { k: 'c', val: V.fromBool(txt === 'true'), t: BOOL };
      if (t.kind === 'int' && /^[-+]?\d+$/.test(txt)) return cint(Number(txt));
      throw new ElabError(`'value of '${str}' is not supported`, loc);
    }
    case 'stable':
      if (!edgeOperand(node)) throw new ElabError("'stable requires a signal", loc);
      if (e.args.length) {   // S'stable(T): no event during the last T
        if (node.k !== 'sig') throw new ElabError("'stable(T) requires a whole signal", loc);
        return { k: 'sigattr', a: 'stable', sig: node.sig, T: bindExpr(E, e.args[0], TIME, loc), t: BOOL };
      }
      return { k: 'un', o: '!', a: { k: 'event', ...edgeOperand(node), t: BOOL }, t: BOOL };
    case 'last_value': case 'last_event':
      if (!node || node.k !== 'sig') throw new ElabError(`'${at} requires a whole signal`, loc);
      return { k: 'sigattr', a: at, sig: node.sig, t: at === 'last_event' ? TIME : node.t };
  }
  throw new ElabError(`attribute '${e.attr} is not supported`, loc);
}

function bindAggregate(E, e, expect, loc) {
  if (!expect) {
    // positional aggregate without context: concatenation
    if (e.items.every(i => !i.choices)) {
      const parts = e.items.map(i => bindExpr(E, i.value, BIT, loc));
      return fold({ k: 'cat', parts, t: vecT(parts.reduce((a, p) => a + p.t.w, 0)) });
    }
    throw new ElabError('cannot determine the type of the aggregate', loc);
  }
  if (expect.kind === 'str') {
    // a string aggregate ((others => ' '), ('a', 'b'), (1 => 'x', others => '.')) of constant
    // characters: its declared length, or as many characters as it lists (strings index from 1 here)
    const chars = [];
    let pos = 0, other = null;
    const ch = it => String.fromCharCode(V.toNum(constOf(E, bindExpr(E, it.value, CHAR, loc), loc)) & 255);
    for (const it of e.items) {
      if (!it.choices) { chars[pos++] = ch(it); continue; }
      for (const c of it.choices) {
        if (c === 'others') { other = ch(it); continue; }
        if (c.range) { const r = evalRange(E, c.range); if (!r.isNull) for (let i = Math.min(r.left, r.right); i <= Math.max(r.left, r.right); i++) chars[i - 1] = ch(it); continue; }
        chars[V.toNum(constOf(E, bindExpr(E, c, null, loc), loc)) - 1] = ch(it);
      }
    }
    const n = expect.slen ?? chars.length;
    let str = '';
    for (let i = 0; i < n; i++) {
      if (chars[i] === undefined && other === null) throw new ElabError(`string aggregate: no value for character ${i + 1}`, loc);
      str += chars[i] ?? other;
    }
    return { k: 'str', value: str, t: expect.slen !== undefined ? expect : STR };
  }
  if (expect.kind === 'array' && expect.fields) {
    // record aggregate: positional and / or named (field => value, others => value)
    const F = expect.fields, slots = new Array(F.length).fill(null);
    let pos = 0;
    for (const it of e.items) {
      if (!it.choices) { if (pos < F.length) { slots[pos] = bindExpr(E, it.value, F[pos].t, loc); pos++; } continue; }
      for (const ch of it.choices) {
        if (ch === 'others') { F.forEach((f, k) => { if (!slots[k]) slots[k] = bindExpr(E, it.value, f.t, loc); }); continue; }
        const k = ch.op === 'ref' ? F.findIndex(f => f.name === ch.name) : -1;
        if (k < 0) throw new ElabError(`record has no field '${ch.name ?? '?'}'`, loc);
        slots[k] = bindExpr(E, it.value, F[k].t, loc);
      }
    }
    const elems = slots.map((x, k) => x || { k: 'c', val: defaultValue(F[k].t, E.lang), t: F[k].t });
    return fold({ k: 'arr', elems, t: expect });
  }
  if (expect.kind === 'array') {
    if (expect.unconstrained) return unconstrainedAggregate(E, e, expect, loc);
    const slots = new Array(expect.len).fill(null);
    let pos = 0;
    for (const it of e.items) {
      const val = bindExpr(E, it.value, expect.elem, loc);
      if (!it.choices) {
        const idx = expect.desc ? expect.left - pos : expect.left + pos;
        pos++;
        if (idx - expect.lo >= 0 && idx - expect.lo < expect.len) slots[idx - expect.lo] = val;
        continue;
      }
      for (const ch of it.choices) {
        if (ch === 'others') { for (let k = 0; k < slots.length; k++) if (!slots[k]) slots[k] = val; }
        else if (ch.range) {
          const r = evalRange(E, ch.range);
          if (!r.isNull) for (let i = Math.min(r.left, r.right); i <= Math.max(r.left, r.right); i++) slots[i - expect.lo] = val;
        } else slots[V.toNum(constOf(E, bindExpr(E, ch, null, loc), loc)) - expect.lo] = val;
      }
    }
    const def = { k: 'c', val: defaultValue(expect.elem, E.lang), t: expect.elem };
    return fold({ k: 'arr', elems: slots.map(s => s || def), t: expect });
  }
  // vector aggregate
  const t = expect.unconstrained ? null : expect;
  if (!t) {
    if (e.items.every(i => !i.choices)) {
      const parts = e.items.map(i => bindExpr(E, i.value, BIT, loc));
      return fold({ k: 'cat', parts, t: vecT(parts.length) });
    }
    throw new ElabError('aggregate with others needs a constrained target', loc);
  }
  const w = t.w;
  const bits = new Array(w).fill(null); // indexed by bit position
  let pos = 0;
  for (const it of e.items) {
    const val = bindExpr(E, it.value, BIT, loc);
    if (!it.choices) {
      const idx = t.desc ? t.left - pos : t.left + pos;
      pos++;
      bits[bitpos(t, idx)] = val;
      continue;
    }
    for (const ch of it.choices) {
      if (ch === 'others') { for (let k = 0; k < w; k++) if (!bits[k]) bits[k] = val; }
      else if (ch.range) {
        const r = evalRange(E, ch.range);
        if (!r.isNull) for (let i = Math.min(r.left, r.right); i <= Math.max(r.left, r.right); i++) bits[bitpos(t, i)] = val;
      } else bits[bitpos(t, V.toNum(constOf(E, bindExpr(E, ch, null, loc), loc)))] = val;
    }
  }
  // (a null array: no element; its choices are still bound, for their diagnostics)
  if (w === 0) return { k: 'c', val: V.mk(0, 0n, 0n, !!t.s), t: vecT(0, t.s) };
  const zero = { k: 'c', val: V.ZERO, t: BIT };
  const parts = [];
  for (let p = w - 1; p >= 0; p--) parts.push(bits[p] || zero);
  if (parts.every(p => p === parts[0])) return fold({ k: 'repl', count: { k: 'c', val: V.fromInt(w), t: INT }, a: parts[0], t: vecT(w, t.s) });
  return fold({ k: 'cat', parts, t: { ...vecT(w, t.s) } });
}

// VHDL name(args): index, call, or conversion
function bindApply(E, e, expect, loc) {
  const name = e.name;
  const args = e.args.slice();
  const entry = e.pkg ? packageScope(E.ctx, e.pkg, E.file, loc, E)?.lookup(name) : E.sc.lookup(name);
  if (entry?.kind === 'subalias') return bindApply(E, { ...e, name: entry.target }, expect, loc);
  if (entry && (entry.kind === 'sig' || entry.kind === 'const' || entry.kind === 'loc' || entry.kind === 'alias')) {
    let base = refNode(E, entry, name);
    // m(i, j) of a multi-dimensional array (an array of arrays): one index per dimension
    while (args.length > 1 && base.t.kind === 'array') {
      const a = args.shift();
      base = fold({ k: 'elem', base, index: bindExpr(E, a.named !== undefined ? a.value : a, null, loc), t: base.t.elem });
    }
    if (args.length !== 1) throw new ElabError(`'${name}' indexed with ${args.length} indices`, loc);
    const a = args[0].named !== undefined ? args[0].value : args[0];
    if (a.op === 'slice' && a.base == null) return fold(sliceNode(E, base, a.left, a.right, loc, a.dir));
    return fold(indexNode(E, base, a, loc));
  }
  if (entry && entry.kind === 'func') return bindCall(E, entry, args, name, loc);
  if (entry && entry.kind === 'type') {
    const a = bindExpr(E, positional(args)[0], null, loc);
    const t = entry.t;
    return fold({ k: 'conv', a, ext: a.t.s, t: t.unconstrained ? { ...a.t } : t });
  }
  if (e.pkg) throw notDeclared(name, loc);
  return bindBuiltin(E, name, args, expect, loc);
}
