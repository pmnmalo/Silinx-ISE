// Silinx HLS (#2503): #pragma HLS ARRAY_STENCIL variable=a as Vitis HLS makes it (UG1399): a pipelined loop over a 2-D
// array's rows and columns (for y { for x { PIPELINE; ARRAY_STENCIL; body } }) whose body reads a[y + i][x + j], i and j
// constants or its inner loops' counters, reads each element of a once: the loops are made one over the array's elements
// in order, an element read an iteration, kept in line buffers (one memory of a row for each row of the window but the
// last) and in a window of registers, the taps of the body. Iteration p reads element p and makes the output whose newest
// tap it is, so the outputs come in the order of the loops, later; the body runs every iteration and its writes (of a
// memory, of a variable not its own) only on those of an output. A local array the body reads at constant indices (once its
// inner loops unrolled) is made registers, as Vitis HLS's partitioning for the II does. What cannot be made so keeps its
// loops, with a warning saying why. On the checked syntax tree, before core/c-flatten.js; the C simulation runs the C as
// written. Isomorphic ES module: no DOM and no Node APIs.
//
//   makeStencils(checked, warn) -> the number of loops made
//     warn(loc, message)
import { constValue } from './c-check.js';
import { MEM_MIN } from './c-mem.js';

const INT = { kind: 'int', name: 'int', bits: 32, signed: true };
const isLoop = (s) => s && (s.kind === 'for' || s.kind === 'while' || s.kind === 'do');
const walk = (x, f) => {
  if (!x || typeof x !== 'object') return;
  if (Array.isArray(x)) { x.forEach((y) => walk(y, f)); return; }
  if (f(x) === false) return;
  for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type' && k !== 'pragma') walk(v, f);
};
const num = (v, loc) => ({ kind: 'num', value: BigInt(v), text: String(v), unsigned: false, long: false, loc });
const id = (name, loc) => ({ kind: 'id', name, loc });
const bin = (op, l, r, loc) => ({ kind: 'binary', op, l, r, loc });
const idx = (e, is, loc) => is.reduce((acc, i) => ({ kind: 'index', e: acc, i, loc }), e);
const assign = (l, r, loc) => ({ kind: 'expr', e: { kind: 'assign', op: '=', l, r, loc }, loc });
const inc = (name, loc) => ({ kind: 'expr', e: { kind: 'postfix', op: '++', e: id(name, loc), loc }, loc });
const block = (items, loc) => ({ kind: 'block', items, loc });
const iff = (cond, then, els, loc) => ({ kind: 'if', cond, then, else: els, loc });
const decl = (name, type, init, loc) => ({ kind: 'decl', vars: [{ kind: 'var', name, type, init, static: false, const: false, loc }], loc });
const arrayT = (of, ds) => ds.reduceRight((t, n) => ({ kind: 'array', of: t, size: num(n), length: n }), of);
const pragma = (name, args, loc) => ({ kind: 'pragma', pragma: { name, args, text: `HLS ${name} ${Object.entries(args).map(([k, v]) => (v === true ? k : `${k}=${v}`)).join(' ')}` }, loc });
const forUp = (v, n, body, loc) => ({ kind: 'for', init: decl(v, INT, num(0, loc), loc), cond: bin('<', id(v, loc), num(n, loc), loc), step: { kind: 'postfix', op: '++', e: id(v, loc), loc }, body, loc });
const unlabel = (s) => { while (s?.kind === 'label') s = s.stmt; return s; };
const itemsOf = (l) => (l.body?.kind === 'block' ? l.body.items : [l.body]);
const target = (n) => (n.kind === 'assign' ? n.l : n.kind === 'postfix' || (n.kind === 'unary' && (n.op === '++' || n.op === '--')) ? n.e : null);
const rootOf = (e) => { while (e?.kind === 'index') e = e.e; return e?.kind === 'id' ? e.name : null; };

/** An affine form { t: Map(name -> coefficient), k } of e, its names those of env (each a form) or constants; else null. */
function affine(e, env, consts) {
  const c = constValue(e, consts);
  if (c !== null) return { t: new Map(), k: c };
  const comb = (a, b, s) => {
    if (!a || !b) return null;
    const t = new Map(a.t);
    for (const [n, v] of b.t) t.set(n, (t.get(n) ?? 0n) + s * v);
    for (const [n, v] of t) if (v === 0n) t.delete(n);
    return { t, k: a.k + s * b.k };
  };
  const scale = (a, s) => (a ? { t: new Map([...a.t].map(([n, v]) => [n, v * s])), k: a.k * s } : null);
  switch (e.kind) {
    case 'id': return env.get(e.name) ?? null;
    case 'cast': return e.type?.kind === 'int' ? affine(e.e, env, consts) : null;
    case 'unary': return e.op === '-' ? scale(affine(e.e, env, consts), -1n) : e.op === '+' ? affine(e.e, env, consts) : null;
    case 'binary': {
      if (e.op === '+' || e.op === '-') return comb(affine(e.l, env, consts), affine(e.r, env, consts), e.op === '+' ? 1n : -1n);
      if (e.op !== '*') return null;
      const a = affine(e.l, env, consts), b = affine(e.r, env, consts);
      if (!a || !b) return null;
      return !a.t.size ? scale(b, a.k) : !b.t.size ? scale(a, b.k) : null;
    }
    default: return null;
  }
}

/** A for loop counting up by one from a constant to a constant: { v, lo, hi (its last value) }, else null. */
function counted(l, consts) {
  if (l?.kind !== 'for' || l.init?.kind !== 'decl' || l.init.vars.length !== 1) return null;
  const v = l.init.vars[0], lo = constValue(v.init, consts);
  const c = l.cond, s = l.step;
  if (lo === null || c?.kind !== 'binary' || c.l.kind !== 'id' || c.l.name !== v.name || !['<', '<='].includes(c.op)) return null;
  const n = constValue(c.r, consts);
  const up = s && ((s.kind === 'postfix' || s.kind === 'unary') && s.op === '++' && s.e.kind === 'id' && s.e.name === v.name);
  if (n === null || !up) return null;
  return { v: v.name, type: v.type, lo, hi: c.op === '<' ? n - 1n : n };
}

/** The range [min, max] of a form over its names' ranges. */
const rangeOf = (f, ranges) => {
  let lo = f.k, hi = f.k;
  for (const [n, c] of f.t) { const r = ranges.get(n); lo += c > 0n ? c * r.lo : c * r.hi; hi += c > 0n ? c * r.hi : c * r.lo; }
  return { lo, hi };
};
/** A form's expression (its names, its constant plus `add`). */
const exprOf = (f, add, loc) => {
  let e = null;
  for (const [n, c] of f.t) { const term = c === 1n ? id(n, loc) : bin('*', num(c, loc), id(n, loc), loc); e = e ? bin('+', e, term, loc) : term; }
  const k = f.k + add;
  return !e ? num(k, loc) : k === 0n ? e : bin(k > 0n ? '+' : '-', e, num(k > 0n ? k : -k, loc), loc);
};

/** The loops of a function's body with an ARRAY_STENCIL made, each said when not. */
function stencilsOf(fn, consts, warn) {
  let made = 0;
  const arrays = new Map();   // (the function's arrays: its arguments and its locals, by name)
  for (const p of fn.params) arrays.set(p.name, { type: p.type, param: true });
  walk(fn.body, (n) => { if (n.kind === 'decl') for (const v of n.vars) if (v.type?.kind === 'array') arrays.set(v.name, { type: v.type, param: false, v }); });
  const pragmaNames = new Set();
  walk(fn.body, (n) => { if (n.kind === 'pragma' && ['ARRAY_PARTITION', 'ARRAY_RESHAPE', 'BIND_STORAGE'].includes(n.pragma.name) && n.pragma.args.variable) pragmaNames.add(String(n.pragma.args.variable)); return true; });
  const visit = (items, parent) => {
    for (let k = 0; k < items.length; k++) {
      const s = unlabel(items[k]);
      if (!s || typeof s !== 'object') continue;
      if (isLoop(s)) {
        const inner = itemsOf(s).map(unlabel).find(isLoop);
        const st = inner && itemsOf(inner).find((x) => x?.kind === 'pragma' && x.pragma.name === 'ARRAY_STENCIL');
        if (st && itemsOf(s).every((x) => unlabel(x) === inner || x?.kind === 'pragma')) {
          const r = makeOne(s, inner, st, { arrays, consts, pragmaNames });
          if (typeof r === 'string') warn(st.loc, `#pragma HLS ARRAY_STENCIL variable=${st.pragma.args.variable ?? ''}: not made (${r}): its reads one at a time`);
          else {
            items[k] = items[k].kind === 'label' ? { ...items[k], stmt: r } : r;
            made++;
            continue;
          }
          visit(itemsOf(inner), inner);
          continue;
        }
        for (const x of itemsOf(s)) if (x?.kind === 'pragma' && x.pragma.name === 'ARRAY_STENCIL') warn(x.loc, `#pragma HLS ARRAY_STENCIL variable=${x.pragma.args.variable ?? ''}: not made (it applies to a pipelined loop in a loop over the array's rows, alone in it): its reads one at a time`);
        visit(itemsOf(s), s);
        continue;
      }
      if (s.kind === 'pragma' && s.pragma.name === 'ARRAY_STENCIL' && !isLoop(parent)) warn(s.loc, `#pragma HLS ARRAY_STENCIL variable=${s.pragma.args.variable ?? ''}: not made (it applies to a pipelined loop's body): its reads one at a time`);
      if (s.kind === 'block') visit(s.items, s);
      else if (s.kind === 'if') visit([s.then, s.else].filter(Boolean), s);
      else if (s.kind === 'switch') visit([s.body], s);
    }
  };
  visit(fn.body.items, null);
  return made;
}

/** The loops outer { inner } made one with the stencil's line buffers and window: the block replacing outer, or why not. */
function makeOne(outer, inner, st, { arrays, consts, pragmaNames }) {
  const loc = inner.loc, name = st.pragma.args.variable;
  if (!name) return 'it needs variable=<the array>';
  const pipe = itemsOf(inner).find((x) => x?.kind === 'pragma' && x.pragma.name === 'PIPELINE');
  if (!pipe || pipe.pragma.args.off) return 'its loop is not pipelined';
  const arr = arrays.get(String(name));
  const ds = [];
  let et = arr?.type;
  for (; et?.kind === 'array'; et = et.of) ds.push(et.length ?? null);
  if (!arr || ds.length !== 2 || ds.some((n) => !n)) return `'${name}' is not an array of two dimensions, both known`;
  const [H, W] = ds.map(BigInt);
  const Y = counted(outer, consts), X = counted(inner, consts);
  if (!Y || !X || Y.hi < Y.lo || X.hi < X.lo) return 'its loops do not count up by one between constants';
  if (X.hi - X.lo >= W) return `its loop over the columns is longer than a row of '${name}'`;
  // the body: its inner loops' counters, its own variables, the forms of those it never writes again
  const body = itemsOf(inner).filter((x) => !(x?.kind === 'pragma' && (x.pragma.name === 'PIPELINE' || x.pragma.name === 'ARRAY_STENCIL')));
  const ranges = new Map([[Y.v, { lo: Y.lo, hi: Y.hi }], [X.v, { lo: X.lo, hi: X.hi }]]);
  const env = new Map([[Y.v, { t: new Map([[Y.v, 1n]]), k: 0n }], [X.v, { t: new Map([[X.v, 1n]]), k: 0n }]]);
  const own = new Set(), declared = new Map(), written = new Set(), steps = new Set(), inits = new Set();
  let why = null;
  walk(body, (n) => { if (counted(n, consts)) { steps.add(n.step); inits.add(n.init); } return true; });
  walk(body, (n) => {
    if (steps.has(n)) return false;   // (a counted loop's step: its counter's)
    if (n.kind === 'decl') for (const v of n.vars) { own.add(v.name); declared.set(v.name, (declared.get(v.name) ?? 0) + 1); }
    const t = target(n);
    if (t) written.add(rootOf(t));
    if (['break', 'continue', 'return', 'goto'].includes(n.kind)) why ||= `a '${n.kind}' is in its body`;
    if (n.kind === 'call') why ||= 'its body calls a function';
    return true;
  });
  if (why) return why;
  if (written.has(Y.v) || written.has(X.v)) return 'its body writes its loops\' counters';
  walk(body, (n) => {
    const l = counted(n, consts);
    if (l && !written.has(l.v)) { ranges.set(l.v, { lo: l.lo, hi: l.hi }); env.set(l.v, { t: new Map([[l.v, 1n]]), k: 0n }); }
    if (n.kind === 'decl' && !inits.has(n)) for (const v of n.vars) {
      if (v.init && declared.get(v.name) === 1 && !written.has(v.name) && v.type?.kind === 'int') { const f = affine(v.init, env, consts); if (f) env.set(v.name, f); }
    }
    return true;
  });
  // the reads of the array, a[y + i][x + j]; of another argument (out of its range on an iteration of no output), none
  const targets = new Set();
  walk(body, (n) => { const t = target(n); if (t && n.kind === 'assign' && n.op === '=') targets.add(t); return true; });
  const reads = [];
  why = null;
  walk(body, (n) => {
    if (n.kind === 'index' && n.e.kind === 'index' && n.e.e.kind === 'id' && n.e.e.name === name) { reads.push({ n, f0: affine(n.e.i, env, consts), f1: affine(n.i, env, consts) }); return false; }
    if (n.kind === 'id' && n.name === name) why ||= `'${name}' is used in its body other than read at an element`;
    if (n.kind === 'index' && arrays.get(rootOf(n))?.param) { if (!targets.has(n)) why ||= `its body reads the argument '${rootOf(n)}'`; return false; }
    return true;
  });
  if (why) return why;
  if (!reads.length) return `its body does not read '${name}'`;
  if (written.has(name)) return `its body writes '${name}'`;
  const shifted = (f, v, w) => {
    if (!f || f.t.get(v) !== 1n || f.t.has(w)) return null;
    const t = new Map(f.t);
    t.delete(v);
    return [...t.keys()].every((m) => ranges.has(m) && m !== Y.v && m !== X.v) ? { t, k: f.k } : null;
  };
  let amin = null, amax = null, bmin = null, bmax = null;
  for (const rd of reads) {
    rd.a = shifted(rd.f0, Y.v, X.v);
    rd.b = shifted(rd.f1, X.v, Y.v);
    if (!rd.a || !rd.b) return `a read of '${name}' is not at [${Y.v} + i][${X.v} + j], i and j constants or its inner loops' counters`;
    const ra = rangeOf(rd.a, ranges), rb = rangeOf(rd.b, ranges);
    amin = amin === null || ra.lo < amin ? ra.lo : amin; amax = amax === null || ra.hi > amax ? ra.hi : amax;
    bmin = bmin === null || rb.lo < bmin ? rb.lo : bmin; bmax = bmax === null || rb.hi > bmax ? rb.hi : bmax;
  }
  const first = (Y.lo + amax) * W + X.lo + bmax;   // (the iteration of the first output: its newest tap's element)
  if (first < 0n) return 'its taps are all before the element of its output';
  const V = Number(amax - amin + 1n), Hw = Number(bmax - bmin + 1n);
  // the names made here
  const P = `ap_st_${name}`;
  const win = `${P}_win`, out = `${P}_out`, p = `${P}_p`, r = `${P}_r`, c = `${P}_c`, v = `${P}_v`;
  const lb = (k) => `${P}_lb${k}`, col = (k) => `${P}_col${k}`;
  // the body's writes not its own: on an output's iteration only
  const guarded = [];
  for (const s of body) {
    let ws = false;
    walk(s, (n) => { const t = target(n); if (t && (t.kind === 'index' || !own.has(rootOf(t)))) ws = true; return !ws; });
    if (!ws) { guarded.push(s); continue; }
    if (s.kind !== 'expr') return 'its body writes a memory or a variable not its own inside a statement of more';
    guarded.push(iff(id(out, loc), s, null, s.loc));
  }
  // the local arrays it reads at constant indices: registers
  const parts = [];
  walk(body, (n) => {
    if (n.kind !== 'index') return true;
    const a = arrays.get(rootOf(n)), at = rootOf(n);
    if (!a || a.param || pragmaNames.has(at) || parts.includes(at)) return false;
    let ok = true;
    for (let e = n; e.kind === 'index'; e = e.e) { const f = affine(e.i, env, consts); if (!f || [...f.t.keys()].some((m) => !ranges.has(m) || m === Y.v || m === X.v)) ok = false; }
    if (ok) parts.push(at);
    return false;
  });
  // the reads made the window's taps
  for (const rd of reads) {
    const tap = idx(id(win, loc), [exprOf(rd.a, -amin, loc), exprOf(rd.b, -bmin, loc)], rd.n.loc);
    for (const k of Object.keys(rd.n)) delete rd.n[k];
    Object.assign(rd.n, tap);
  }
  const T = et;
  const pre = [
    decl(win, arrayT(T, [V, Hw]), null, loc), pragma('ARRAY_PARTITION', { variable: win, type: 'complete', dim: '0' }, loc),
    ...Array.from({ length: V - 1 }, (_, k) => [decl(lb(k), arrayT(T, [Number(W)]), null, loc), ...(W > MEM_MIN ? [pragma('BIND_STORAGE', { variable: lb(k), type: 'ram_2p' }, loc)] : [])]).flat(),
    decl(r, INT, num(0, loc), loc), decl(c, INT, num(0, loc), loc),
    decl(Y.v, Y.type, num(Y.lo, loc), loc), decl(X.v, X.type, num(X.lo, loc), loc),
  ];
  const loopBody = [
    { ...pipe },
    decl(v, T, idx(id(name, loc), [id(r, loc), id(c, loc)], loc), loc),
    ...Array.from({ length: V - 1 }, (_, k) => decl(col(k + 1), T, idx(id(lb(k), loc), [id(c, loc)], loc), loc)),
    ...Array.from({ length: V * (Hw - 1) }, (_, k) => { const a = Math.floor(k / (Hw - 1)), b = k % (Hw - 1); return assign(idx(id(win, loc), [num(a, loc), num(b, loc)], loc), idx(id(win, loc), [num(a, loc), num(b + 1, loc)], loc), loc); }),
    assign(idx(id(win, loc), [num(V - 1, loc), num(Hw - 1, loc)], loc), id(v, loc), loc),
    ...Array.from({ length: V - 1 }, (_, k) => assign(idx(id(win, loc), [num(V - 2 - k, loc), num(Hw - 1, loc)], loc), id(col(k + 1), loc), loc)),
    ...(V > 1 ? [assign(idx(id(lb(0), loc), [id(c, loc)], loc), id(v, loc), loc)] : []),
    ...Array.from({ length: V - 2 > 0 ? V - 2 : 0 }, (_, k) => assign(idx(id(lb(k + 1), loc), [id(c, loc)], loc), id(col(k + 1), loc), loc)),
    decl(out, INT, bin('&&', bin('>=', id(p, loc), num(first, loc), loc), bin('<=', id(X.v, loc), num(X.hi, loc), loc), loc), loc),
    ...guarded,
    iff(bin('==', id(c, loc), num(W - 1n, loc), loc), block([assign(id(c, loc), num(0, loc), loc), iff(bin('<', id(r, loc), num(H - 1n, loc), loc), inc(r, loc), null, loc)], loc), inc(c, loc), loc),
    iff(bin('>=', id(p, loc), num(first, loc), loc), iff(bin('==', id(X.v, loc), num(X.lo + W - 1n, loc), loc), block([assign(id(X.v, loc), num(X.lo, loc), loc), inc(Y.v, loc)], loc), inc(X.v, loc), loc), null, loc),
  ];
  const n = first + (Y.hi - Y.lo) * W + X.hi - X.lo + 1n;
  const loop = { ...forUp(p, Number(n), block(loopBody, inner.body.loc ?? loc), loc), count: { trip: Number(n), max: Number(n) } };
  return block([...pre, ...parts.map((a) => pragma('ARRAY_PARTITION', { variable: a, type: 'complete', dim: '0' }, loc)), loop], outer.loc);
}

/** The ARRAY_STENCIL loops of the top and of the functions it calls made: their number. */
export function makeStencils(checked, warn) {
  const seen = new Set();
  let made = 0;
  const visit = (name) => {
    const f = checked.funcs.get(name);
    if (!f?.body || seen.has(name)) return;
    seen.add(name);
    let any = false;
    walk(f.body, (n) => { if (n.kind === 'pragma' && n.pragma.name === 'ARRAY_STENCIL') any = true; return !any; });
    if (any) made += stencilsOf(f, checked.consts ?? new Map(), warn);
    walk(f.body, (n) => { if (n.kind === 'call' && n.callee?.kind === 'id') visit(n.callee.name); return true; });
  };
  visit(checked.top);
  return made;
}
