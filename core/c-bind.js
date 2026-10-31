// Silinx HLS (#2125): the multiplications of different states bound to one unit, as Vitis HLS binds operations. Only one
// state of a machine (core/c-fsmd.js) runs in a cycle, so a state's multiplications take the first free units of their
// kind and the unit's operands are multiplexed by the state (a tree on ap_CS_fsm: its depth the log of its uses). Kind: a
// multiplication that one block makes (18 x 18 signed at its operands' own widths, core/c-mul-split.js), else its
// operands' widths. Left alone: a multiplication by a power of 2 (wiring), and one with an operand under 6 bits (a few
// LUTs, less than the multiplexers), and one with no room for the multiplexers in the period (`budget`, ns; see roomy),
// unless `always` (the device's blocks are too few for one each: the path reported, core/c-schedule.js). The units are in
// one order and a unit's operands read only units before it, within a state and so in all of them: no combinational
// loop in the hardware, even a false one between states. The soft-float's
// operations share their multiplications here; the rest of an operation stays each state's own.
// Isomorphic ES module: no DOM and no Node APIs.
//
//   bindMuls(g, states, stateT, { family, budget, always }) -> { states: rewritten, units: [{ a, b, w, blocks, uses, inputs }] }
//     a, b, w: its operands' and product's widths; blocks: the multiplier blocks it takes; uses: the multiplications bound
//     to it; inputs: the operand pairs its multiplexers choose between
import { operandOf } from './c-mul-split.js';
import { FAMILIES, nodeDelay } from './c-timing.js';
import { BOOL } from './c-types.js';

const LIMB = 17, MIN_BITS = 6;

/** Whether a node is a multiplication worth a unit. */
export function bindable(g, n) {
  if (n.op !== 'mul' || !nodeDelay(g, n)) return false;
  return n.args.every((x) => operandOf(g, x, n.s)[1] >= MIN_BITS);
}

/** All the nodes a state reads. */
const rootsOf = (st) => [st.next, st.stall, ...st.updates.values(),
  ...[...st.access.values()].flatMap((a) => [a.addr, a.ce, a.we, a.d]),
  ...[...(st.fifo?.values() || [])].flatMap((a) => [a.d, a.g, a.ok])].filter((x) => x != null);

function rebuilt(st, f) {
  const opt = (x) => (x == null ? x : f(x));
  return { ...st, next: f(st.next), stall: opt(st.stall), updates: new Map([...st.updates].map(([r, v]) => [r, f(v)])),
    access: new Map([...st.access].map(([k, a]) => [k, { ...a, addr: opt(a.addr), ce: opt(a.ce), we: opt(a.we), d: opt(a.d) }])),
    fifo: new Map([...(st.fifo || [])].map(([k, a]) => [k, { ...a, d: opt(a.d), g: opt(a.g), ok: opt(a.ok) }])) };
}

/** A value chosen by the state: leaves [{ state, val }] by state, those next to each other with one value made one. */
function chosen(g, cs, stateT, leaves, t) {
  const merged = leaves.filter((l, i) => !i || l.val !== leaves[i - 1].val);
  const tree = (lo, hi) => {
    if (hi - lo === 1) return merged[lo].val;
    const mid = (lo + hi) >> 1;
    const sel = g.add('lt', [cs, g.const(merged[mid].state, stateT)], BOOL);
    return g.add('mux', [sel, tree(lo, mid), tree(mid, hi)], t);
  };
  return tree(0, merged.length);
}

const kindOf = (g, n) => {
  const ea = operandOf(g, n.args[0], n.s)[1], eb = operandOf(g, n.args[1], n.s)[1];
  return [ea <= LIMB + 1 && eb <= LIMB + 1 ? 'block' : `${ea}x${eb}`, ea, eb];
};

/** The multiplications with room for a unit's multiplexers ('state index:node'): those with no other multiplication before
 *  them in their state, of a kind whose unit's path fits the budget, from the latest operands of its uses through the
 *  multiplexers (their depth the log of its uses, their selects compared with the state) and the multiplication to the
 *  longest path after any of them (what one state's operands start and another's results end is a path of the
 *  hardware too, if never taken). Of a kind's, the most whose path fits. */
function roomy(g, states, stateW, { family, budget }) {
  const F = FAMILIES[family], select = F.lt(stateW), lut = F.mux(), byKind = new Map();
  states.forEach((st, k) => {
    const nodes = g.needed(rootsOf(st)), at = new Map(), tail = new Map(), muls = new Set();
    for (const n of nodes) {
      at.set(n.id, n.args.reduce((m, a) => Math.max(m, at.get(a) ?? 0), 0) + nodeDelay(g, n, family));
      if (bindable(g, n) || n.args.some((a) => muls.has(a))) muls.add(n.id);
    }
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i], t = (tail.get(n.id) ?? 0) + nodeDelay(g, n, family);
      for (const a of n.args) tail.set(a, Math.max(tail.get(a) ?? 0, t));
    }
    for (const n of nodes) {
      if (!bindable(g, n) || n.args.some((a) => muls.has(a))) continue;
      const kind = kindOf(g, n)[0];
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind).push({ key: `${k}:${n.id}`, a: Math.max(select, ...n.args.map((x) => at.get(x) ?? 0)), t: nodeDelay(g, n, family) + (tail.get(n.id) ?? 0) });
    }
  });
  const room = new Set();
  for (const c of byKind.values()) {
    const mux = Math.ceil(Math.log2(Math.max(2, c.length))) * lut;
    let best = [];
    for (const a0 of new Set(c.map((x) => x.a))) {
      const fit = c.filter((x) => x.a <= a0 && a0 + mux + x.t <= budget);
      if (fit.length > best.length) best = fit;
    }
    if (best.length > 1) for (const x of best) room.add(x.key);
  }
  return room;
}

/** Each state's multiplications bound to units (see above). */
export function bindMuls(g, states, stateT, { family = 'artix7', budget = Infinity, always = false } = {}) {
  const units = [], rank = new Map(), byState = states.map(() => new Map());
  // (the select's comparison as wide as the states' numbers: the state's register's bits above them always 0)
  const stateW = Math.max(...states.map((st) => st.id)).toString(2).length;
  const room = always ? null : roomy(g, states, stateW, { family, budget });
  states.forEach((st, k) => {
    const free = new Set(units), after = new Map();
    for (const n of g.needed(rootsOf(st))) {
      let dep = n.args.reduce((m, a) => Math.max(m, after.get(a) ?? -1), -1);
      if (bindable(g, n)) {
        const [shared, ea, eb] = kindOf(g, n);
        // (no room for the multiplexers: a unit of its own)
        const kind = !room || room.has(`${k}:${n.id}`) ? shared : `own${n.id}`;
        let u = units.find((x) => x.kind === kind && free.has(x) && rank.get(x) > dep);
        if (!u) { u = { kind, uses: [] }; rank.set(u, units.length); units.push(u); }
        free.delete(u);
        u.uses.push({ k, state: st.id, n, ea, eb });
        byState[k].set(n.id, u);
        dep = rank.get(u);
      }
      after.set(n.id, dep);
    }
  });
  if (units.length === 0) return { states, units: [] };
  const cs = g.add('reg', [], stateT, { port: { key: 'reg:ap_CS_fsm', name: 'ap_CS_fsm' } });
  const memos = states.map(() => new Map());
  // a node as a state computes it: its multiplications the outputs of their units (of a lower rank when a unit is being made)
  const value = (k, v) => {
    const memo = memos[k];
    if (memo.has(v)) return memo.get(v);
    const n = g.get(v);
    let r = v;
    if (byState[k].has(v)) r = byState[k].get(v).out(k, n);
    else if (n.args.length) {
      const args = n.args.map((a) => value(k, a));
      if (args.some((a, i) => a !== n.args[i])) {
        const { id: _i, op, args: _a, w, s, ...extra } = n;
        r = g.add(op, args, { w, s }, extra);
      }
    }
    memo.set(v, r);
    return r;
  };
  for (const u of units) {
    const made = u.uses.map((x) => ({ ...x, a: value(x.k, operandOf(g, x.n.args[0], x.n.s)[0]), b: value(x.k, operandOf(g, x.n.args[1], x.n.s)[0]) }));
    const whole = u.uses.map((x) => x.n.args.map((a) => value(x.k, a)));
    const one = u.uses.every((x, i) => x.n.w === u.uses[0].n.w && x.n.s === u.uses[0].n.s && whole[i][0] === whole[0][0] && whole[i][1] === whole[0][1]);
    u.inputs = one ? 1 : new Set(made.map((x) => `${x.a},${x.b},${x.ea},${x.eb}`)).size;
    u.a = Math.max(...made.map((x) => x.ea));
    u.b = Math.max(...made.map((x) => x.eb));
    u.w = u.a + u.b;
    u.blocks = Math.max(1, Math.ceil((u.a - 1) / LIMB)) * Math.max(1, Math.ceil((u.b - 1) / LIMB));
    if (one) {
      // (the same multiplication in all its uses: as it was)
      const { id: _i, op, args: _a, w, s, ...extra } = u.uses[0].n;
      const node = g.add(op, whole[0], { w, s }, extra);
      u.out = () => node;
      continue;
    }
    const ta = { w: u.a, s: true }, tb = { w: u.b, s: true }, t = { w: u.w, s: true };
    const operand = (key, tt) => chosen(g, cs, stateT, [...made].sort((x, y) => x.state - y.state).map((x) => ({ state: x.state, val: g.add('ext', [x[key]], tt) })), tt);
    const node = g.add('mul', [operand('a', ta), operand('b', tb)], t);
    u.out = (k, n) => g.add('ext', [node], { w: n.w, s: n.s });
  }
  return {
    states: states.map((st, k) => rebuilt(st, (v) => value(k, v))),
    units: units.map(({ a, b, w, blocks, uses, inputs }) => ({ a, b, w, blocks, uses: uses.length, inputs })),
  };
}
