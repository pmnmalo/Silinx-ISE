// Silinx HLS (#2424): #pragma HLS ARRAY_RESHAPE of an array argument as Vitis HLS makes it (UG1399): one memory of
// wide words, its ap_memory port of those words (a_address0 of the words, a_q0 / a_d0 N elements wide). type=cyclic
// factor=N: element k in word k / N, at slice k % N; type=block factor=N: S = ceil(L / N) words, element k in word
// k % S, at slice k / S (the first slice the first S elements). The array is a group of core/c-aggregate.js's kind
// (#1668), of one field of N elements: core/c-agg-mem.js accesses it (an element's word read once and held while its
// index does not change, its other elements taken from it; an element written into the held word, the word written
// whole, read first when some of its slices were not written), and the co-simulation packs its words so.
// Isomorphic ES module: no DOM and no Node APIs.
//
// A local array (of more than MEM_MIN elements, or with a BIND_STORAGE: a memory) is one too, a memory of those words
// inside the module, its initial values packed.
//
//   reshapeOf(fn, name)         the argument's reshape: { type, N, S, L } (S words of N elements), or null
//   reshapeGroups(fn)           the reshaped arguments' groups: [{ name, kind: 'mem', fields, w, n }]
//   localReshape(a, type, mem)  a local array's (its pragma's arguments, its type, whether it is a memory), or null
//   localReshapeIn(fn, name, a) the same of a local of fn by its name
//   reshapeMethods              SeqFlow's (core/c-fsmd.js): reshapeSlot(v), the local's slot, or null

import { typeOf } from './c-types.js';
import { MEM_MIN } from './c-mem.js';

const kindOf = (a) => String(a.type || (a.block ? 'block' : a.cyclic ? 'cyclic' : 'complete')).toLowerCase();

/** The first ARRAY_RESHAPE of `name` in the function's body: its arguments, else null. */
function pragmaOf(fn, name) {
  let found = null;
  const walk = (x) => {
    if (!x || typeof x !== 'object' || found) return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x.kind === 'pragma' && x.pragma.name === 'ARRAY_RESHAPE' && String(x.pragma.args.variable) === name) { found = x.pragma.args; return; }
    for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type' && k !== 'pragma') walk(v);
  };
  walk(fn.body);
  return found;
}

/** The reshape a pragma's arguments make of an array of that type: block or cyclic of one dimension, factor 2 or
 *  more, of integers of known size; else null. */
function planOf(a, t) {
  const type = kindOf(a), N = Number(a.factor), L = Number(t.length ?? 0), et = t.of;
  if ((type !== 'block' && type !== 'cyclic') || !Number.isInteger(N) || N < 2 || !L || t.flat || String(a.dim ?? 1) !== '1') return null;
  if (et?.kind !== 'int' || et.fixed) return null;
  const n = Math.min(N, L);
  return { type, N: n, S: Math.ceil(L / n), L };
}

/** A local array's ARRAY_RESHAPE, as made: a memory's (`mem`: more than MEM_MIN elements, or a BIND_STORAGE) of
 *  planOf's; else null (a small one: registers, as a partition makes them). */
export const localReshape = (a, t, mem) => (mem && t?.kind === 'array' ? planOf(a, t) : null);

/** A local of the function's body by name, its declaration's variable, and whether a BIND_STORAGE names it. */
function localOf(fn, name) {
  let v = null, storage = false;
  const walk = (x) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x.kind === 'decl') for (const d of x.vars) if (d.name === name) v ||= d;
    if (x.kind === 'pragma' && x.pragma.name === 'BIND_STORAGE' && String(x.pragma.args.variable) === name) storage = true;
    for (const [k, y] of Object.entries(x)) if (k !== 'loc' && k !== 'type' && k !== 'pragma') walk(y);
  };
  walk(fn?.body);
  return v ? { v, storage } : null;
}

/** A local array of the function's ARRAY_RESHAPE (its arguments a), as core/c-fsmd.js makes it (localReshape), or
 *  null. */
export function localReshapeIn(fn, name, a) {
  const l = localOf(fn, name);
  return l ? localReshape(a, l.v.type, Number(l.v.type.length ?? 0) > MEM_MIN || l.storage) : null;
}

/** An array argument's ARRAY_RESHAPE, as made: block or cyclic of one dimension, factor 2 or more, of an integer
 *  array of known size; else null (the pragma's warning says why, core/c-pragma.js). */
export function reshapeOf(fn, name) {
  const pa = fn.params.find((p) => p.name === name);
  const a = pa?.type.kind === 'array' ? pragmaOf(fn, name) : null;
  return a ? planOf(a, pa.type) : null;
}

/** The reshaped arguments, each a memory of words of one field of N elements (core/c-aggregate.js's wordGroups'). */
export function reshapeGroups(fn) {
  const out = [];
  for (const pa of fn.params) {
    const r = reshapeOf(fn, pa.name);
    if (!r) continue;
    const w = pa.type.of.bits;
    out.push({ name: pa.name, kind: 'mem', fields: [{ param: pa.name, off: 0, w, size: w, k: r.N, ...(r.type === 'block' ? { block: r.S } : {}) }], w: w * r.N, n: r.S, reshape: r });
  }
  return out;
}

const U = (w) => ({ w, s: false });
const clog2 = (n) => Math.max(1, (n - 1).toString(2).length);

export const reshapeMethods = {
  /** A local array's slot when ARRAY_RESHAPE makes it a memory of wide words: its member's, the memory (its group's
   *  of core/c-agg-mem.js) a slot of its own; else null. */
  reshapeSlot(v, isMem) {
    const a = this.partPragma?.get(v.orig ?? v.name);
    const r = a?.reshape ? localReshape(a, v.type, isMem) : null;
    if (!r) return null;
    const et = typeOf(v.type.of);
    const w = et.w, field = { param: v.name, off: 0, w, size: w, k: r.N, ...(r.type === 'block' ? { block: r.S } : {}) };
    const at = (i, j) => (r.type === 'block' ? j * r.S + i : i * r.N + j);
    let init = null;
    if (v.init?.kind === 'init') {
      const items = v.init.items.map((x) => { const c = this.constOf(x, et); if (c === null) this.error(x.loc || v.loc, `'${v.name}': a memory's initial values must be constants`); return c; });
      const mask = (1n << BigInt(w)) - 1n;
      init = Array.from({ length: r.S }, (_, i) => Array.from({ length: r.N }, (_, j) => ((items[at(i, j)] ?? 0n) & mask) << BigInt(j * w)).reduce((x, y) => x | y, 0n));
    } else if (v.static) init = [];
    const name = `ap_w_${v.name}`, full = (1n << BigInt(w * r.N)) - 1n;
    const style = this.impls?.get(v.orig ?? v.name);
    this.slots.set(name, { ...(style && style !== 'register' ? { style } : {}), kind: 'mem', name, port: v.name, t: U(w * r.N), n: r.S, aw: clog2(r.S), ext: false, init, rom: !!v.const, static: !!v.static, read: false, written: false, reads: 0, fields: [field], full, loc: v.loc });
    this.wordOf.set(v.name, { G: name, field, index: 0, last: true });
    return { kind: 'mem', name: v.name, group: name, field, index: 0, last: true, t: et, n: r.L, ext: false, rom: !!v.const, read: false, written: false, reads: 0, loc: v.loc };
  },
};
