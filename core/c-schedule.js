// Silinx HLS (#2080): a sequential function's states scheduled against the clock, as Vitis HLS schedules them. A state of
// core/c-fsmd.js runs its block in one cycle, however long its path; here its operations are chained while they fit the
// period less its uncertainty (core/c-timing.js's delays), and a state whose path does not fit becomes a chain of states,
// the values crossing from one to the next in registers of their own. The C's registers are written in the chain's last
// state only, and a memory is accessed there (its address, enables and data computed by then; a value read before the
// chain held on its q0, no other access to it in between), and a stream too (the machine waits for its FIFO in that last
// state, not computing again): every state of the chain reads the same values, so the machine does what it did, in more
// cycles. Not split: a pipelined loop's state, its II kept, and reported when its path does not fit (`slow`). The split is made
// inside core/c-fsmd.js (its `split`), before the ports the states drive.
// Isomorphic ES module: no DOM and no Node APIs.
//
//   scheduled(checked, opts, { clock, family }) -> fsmd's result, its states split; subStates: Map state id -> [ids
//     of the states after it in its chain]
import { fsmd } from './c-fsmd.js';
import { hdlName } from './c-graph.js';
import { splitMuls } from './c-mul-split.js';
import { BOOL } from './c-types.js';
import { DEFAULT_CLOCK, UNCERTAINTY, nodeDelay } from './c-timing.js';

/** A sequential function's machine (core/c-fsmd.js) with its states split by the clock (ns). */
export function scheduled(checked, opts = {}, { clock = DEFAULT_CLOCK, family = 'artix7' } = {}) {
  const budget = clock * (1 - UNCERTAINTY);
  const split = (ctx) => schedule(ctx, budget, family);
  let m = fsmd(checked, { ...opts, split });
  // (the state's register wide enough for the states added: the machine made again with room for them)
  if (m.overflow) m = fsmd(checked, { ...opts, split, spare: m.overflow });
  if (m.diagnostics.some((d) => d.severity === 'error')) return m;
  const subStates = m.subStates || new Map();
  // (a loop's states an iteration: its states' chains in them)
  const loops = m.loops.map((l, k) => {
    const more = (m.loopStates?.[k] || []).reduce((a, s) => a + (subStates.get(s)?.length || 0), 0);
    if (!more || l.unroll === 'whole' || l.pipeline) return l;
    const ii = l.ii + more, n = l.trip ?? l.max;
    return { ...l, ii, cycles: n === null ? null : Math.ceil(n / (typeof l.unroll === 'number' ? l.unroll : 1)) * ii + 1 };
  });
  return { ...m, loops, subStates };
}

// (a state that accesses a stream: next is "this state again while it waits, else where it goes", core/c-fsmd.js; the value
// it writes to compute, its flags read in the last state)
const waits = (g, st) => {
  if (!st.fifo?.size) return false;
  const n = g.get(st.next);
  return n.op === 'mux' && g.isConst(n.args[1]) && g.k(n.args[1]) === BigInt(st.id) && [...st.fifo.values()].every((a) => g.isConst(a.g));
};
const splittable = (g, st) => !st.gate && g.isConst(st.stall) && !g.k(st.stall) && (!st.fifo?.size || waits(g, st));
const onward = (g, st) => (st.fifo?.size ? g.get(st.next).args[2] : st.next);
// (a state's roots: where it goes, its registers' next values, its memories' accesses, the values it writes to streams)
const ACC = ['addr', 'ce', 'we', 'd'];
const rootsOf = (g, st) => [onward(g, st), ...st.updates.values(), ...[...st.access.values()].flatMap((a) => ACC.map((k) => a[k]).filter((x) => x != null)),
  ...[...st.fifo.values()].map((a) => a.d).filter((x) => x !== undefined)];
function rebuilt(g, st, f, stateT, self) {
  const access = new Map([...st.access].map(([k, a]) => [k, Object.fromEntries(ACC.map((x) => [x, a[x] == null ? a[x] : f(a[x])]))]));
  const fifo = new Map([...st.fifo].map(([k, a]) => [k, a.d === undefined ? a : { ...a, d: f(a.d) }]));
  const on = f(onward(g, st));
  const next = st.fifo?.size ? g.add('mux', [g.get(st.next).args[0], g.const(self, stateT), on], stateT) : on;
  return { ...st, next, updates: new Map([...st.updates].map(([r, v]) => [r, f(v)])), access, fifo };
}
/** The longest path of a state, in ns. */
function longest(g, st, family) {
  const at = new Map();
  let worst = 0;
  for (const n of g.needed([st.next, ...st.updates.values(), ...[...st.access.values()].flatMap((a) => ACC.map((k) => a[k]).filter((x) => x != null)), ...[...st.fifo.values()].map((a) => a.d).filter((x) => x !== undefined)])) {
    at.set(n.id, n.args.reduce((t, a) => Math.max(t, at.get(a) ?? 0), 0) + nodeDelay(g, n, family));
    worst = Math.max(worst, at.get(n.id));
  }
  return worst;
}

/** The states of the machine core/c-fsmd.js makes, split by the clock: { states, regs, subStates, slow: Map pipelined
 *  loop's state -> its path, when over the budget }, or { overflow: the states added } when the state's register is too
 *  narrow for them. */
function schedule({ graph: g, states, stateT, done, piped }, budget, family) {
  // (a wide multiplication of a state split: 18 x 18 ones, chained as the other operations, core/c-mul-split.js)
  const sts = states.map((st) => {
    if (piped.has(st.id) || !splittable(g, st)) return st;
    const roots = rootsOf(g, st), out = splitMuls(g, roots);
    const m = new Map(roots.map((r, i) => [r, out[i]]));
    return rebuilt(g, st, (x) => m.get(x), stateT, st.id);
  });
  const slow = new Map();
  for (const st of sts) if (piped.has(st.id)) { const d = longest(g, st, family); if (d > budget) slow.set(st.id, d); }
  const plans = sts.map((st) => (piped.has(st.id) || !splittable(g, st) ? null : stagesOf(g, st, budget, family)));
  const extra = plans.reduce((a, p) => a + (p ? p.n - 1 : 0), 0);
  if (!extra) return { states: sts, regs: [], subStates: new Map(), slow };
  if ((done + extra).toString(2).length > stateT.w) return { overflow: extra };
  return { ...split(g, sts, plans, stateT, done), slow };
}

/** A state's operations by the cycle they run in: { n: cycles, stage: Map node -> cycle }, or null when it fits one
 *  cycle. */
function stagesOf(g, st, budget, family) {
  const stage = new Map(), at = new Map();
  let n = 1;
  for (const node of g.needed(rootsOf(g, st))) {
    let s = 0, t = 0;
    for (const a of node.args) {
      const sa = stage.get(a) ?? 0, ta = at.get(a) ?? 0;
      if (sa > s || (sa === s && ta > t)) { s = sa; t = ta; }
    }
    const d = nodeDelay(g, node, family);
    // (a new cycle when it does not fit what is left of this one; an operation longer than the period alone in its own)
    if (d > 0 && t > 0 && t + d > budget) { s++; t = 0; }
    stage.set(node.id, s);
    at.set(node.id, t + d);
    n = Math.max(n, s + 1);
  }
  return n > 1 ? { n, stage } : null;
}

function split(g, sts, plans, stateT, done) {
  const regs = [], states = [], subStates = new Map();
  let id = done;
  sts.forEach((st, k) => {
    const p = plans[k];
    if (!p) { states.push(st); return; }
    // the registers of the values a later cycle of the chain reads
    const cut = new Map();
    const cutReg = (v) => {
      if (!cut.has(v)) {
        const node = g.get(v), name = `s${st.id}_c${p.stage.get(v)}_${v}`, t = { w: node.w, s: node.s };
        const r = { name, w: t.w, s: t.s, t, reset: 0n, latch: null };
        regs.push(r);
        cut.set(v, { reg: r, node: g.add('reg', [], t, { port: { key: `reg:${name}`, name: `ap_r_${hdlName(name)}` } }) });
      }
      return cut.get(v).node;
    };
    // a node as the cycle `c` computes it: its operands of an earlier cycle read from their registers
    const at = (c) => {
      const memo = new Map();
      const f = (v) => {
        const node = g.get(v);
        if (!node.args.length || !p.stage.has(v)) return v;
        const s = p.stage.get(v);
        if (s < c) return cutReg(v);
        if (memo.has(v)) return memo.get(v);
        const r = s === 0 && c === 0 ? v : g.add(node.op, node.args.map(f), { w: node.w, s: node.s }, extraOf(node));
        memo.set(v, r);
        return r;
      };
      return f;
    };
    const ids = [st.id, ...Array.from({ length: p.n - 1 }, () => ++id)];
    subStates.set(st.id, ids.slice(1));
    const last = p.n - 1;
    const end = rebuilt(g, st, at(last), stateT, ids[last]);
    // (the cycles before the last, from the last back: each writes the registers of the values it computes for a later
    // one, those its own operations read from an earlier one known before that one is made)
    const handOn = Array.from({ length: last }, () => new Map());
    for (let c = last - 1; c >= 0; c--) {
      const f = at(c);
      for (const v of [...cut.keys()]) if (p.stage.get(v) === c) handOn[c].set(v, f(v));
    }
    for (let c = 0; c < last; c++) {
      const u = new Map();
      for (const [v, val] of handOn[c]) u.set(cut.get(v).reg.name, val);
      states.push({ ...st, id: ids[c], updates: u, next: g.const(ids[c + 1], stateT), access: new Map(), fifo: new Map(), stall: g.const(0, BOOL), sub: c > 0 });
    }
    states.push({ ...end, id: ids[last], sub: true });
  });
  return { states, regs, subStates };
}

const extraOf = (node) => {
  const { id, op, args, w, s, ...extra } = node;
  return extra;
};
