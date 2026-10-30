// Silinx HLS (#2080): a sequential function's states scheduled against the clock, as Vitis HLS schedules them. A state of
// core/c-fsmd.js runs its block in one cycle, however long its path; here its operations are chained while they fit the
// period less its uncertainty (core/c-timing.js's delays), and a state whose path does not fit becomes a chain of states,
// the values crossing from one to the next in registers of their own. The C's registers are written in the chain's last
// state only: every state of the chain reads the same values, so the machine does what it did, in more cycles.
// Not split (yet): a state that accesses a memory or a stream, or waits on one, and a pipelined loop's.
// Isomorphic ES module: no DOM and no Node APIs.
//
//   scheduled(checked, opts, { clock, family }) -> fsmd's result, its states split; subStates: Map state id -> [ids
//     of the states after it in its chain]
import { fsmd } from './c-fsmd.js';
import { hdlName } from './c-graph.js';
import { DEFAULT_CLOCK, UNCERTAINTY, nodeDelay } from './c-timing.js';

/** A sequential function's machine (core/c-fsmd.js) with its states split by the clock (ns). */
export function scheduled(checked, opts = {}, { clock = DEFAULT_CLOCK, family = 'artix7' } = {}) {
  let m = fsmd(checked, opts);
  if (m.diagnostics.some((d) => d.severity === 'error')) return m;
  const budget = clock * (1 - UNCERTAINTY);
  const plan = () => {
    const piped = new Set(m.loops.flatMap((l, k) => (l.pipeline ? m.loopStates[k] : [])));
    return m.states.map((st) => (piped.has(st.id) ? null : stagesOf(m, st, budget, family)));
  };
  let plans = plan();
  const extra = plans.reduce((a, p) => a + (p ? p.n - 1 : 0), 0);
  if (!extra) return { ...m, subStates: new Map() };
  // (the state's register wide enough for the states added: the machine made again with room for them)
  if ((m.done + extra).toString(2).length > m.stateT.w) {
    m = fsmd(checked, { ...opts, spare: extra });
    plans = plan();
  }
  return split(m, plans);
}

const splittable = (m, st) => !st.gate && !st.access?.size && !st.fifo?.size && m.graph.isConst(st.stall) && !m.graph.k(st.stall);

/** A state's operations by the cycle they run in: { n: cycles, stage: Map node -> cycle }, or null when it fits one
 *  cycle or is not split (a pipelined loop's state, a memory's or a stream's access: not yet). */
function stagesOf(m, st, budget, family) {
  if (!splittable(m, st)) return null;
  const g = m.graph;
  const stage = new Map(), at = new Map();
  let n = 1;
  for (const node of g.needed([st.next, ...st.updates.values()])) {
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

function split(m, plans) {
  const g = m.graph;
  const regs = [...m.regs], states = [], subStates = new Map();
  let id = m.done;
  m.states.forEach((st, k) => {
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
    // the values each cycle hands on: computed in it, read in a later one
    const ids = [st.id, ...Array.from({ length: p.n - 1 }, () => ++id)];
    subStates.set(st.id, ids.slice(1));
    const last = p.n - 1;
    const fLast = at(last);
    const next = fLast(st.next);
    const updates = new Map([...st.updates].map(([r, v]) => [r, fLast(v)]));
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
      states.push({ ...st, id: ids[c], updates: u, next: g.const(ids[c + 1], m.stateT), sub: c > 0 });
    }
    states.push({ ...st, id: ids[last], updates, next, sub: true });
  });
  // (a loop's states an iteration: its states' chains in them)
  const loops = m.loops.map((l, k) => {
    const more = (m.loopStates?.[k] || []).reduce((a, s) => a + (subStates.get(s)?.length || 0), 0);
    if (!more || l.unroll === 'whole' || l.pipeline) return l;
    const ii = l.ii + more, n = l.trip ?? l.max;
    return { ...l, ii, cycles: n === null ? null : Math.ceil(n / (typeof l.unroll === 'number' ? l.unroll : 1)) * ii + 1 };
  });
  return { ...m, regs, states, loops, subStates };
}

const extraOf = (node) => {
  const { id, op, args, w, s, ...extra } = node;
  return extra;
};
