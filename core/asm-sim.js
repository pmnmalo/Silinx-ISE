// Silinx ASM charts - a chart's simulation, cycle by cycle (#2880): the ASM editor's Simulate panel and the MCP's
// step_drawing tool. Its semantics are the generated HDL's (core/asm-gen.js), which the tests check cycle by cycle
// against the VHDL and the Verilog simulated:
//   - the expressions are evaluated as Verilog evaluates them (the VHDL is generated to match, core/asm-emit.js):
//     + - & | ^ ~ and the left operand of << >> at the width of their context (the assignment's target or the wider
//     side of a comparison), unsized literals and generics 32 bits, a shift amount and the operands of ! && || at
//     their own width; a condition is true when its value is not 0;
//   - in a cycle, every output starts at its default (a registered output and a register at their present value), then
//     the every-cycle blocks assign theirs (chart order), then the state's Moore actions and the actions of the
//     conditional outputs on the path taken: the last assignment of a target wins;
//   - everything read is a present value: the inputs (a synchronised one: its second flip-flop), the registers and the
//     registered outputs; a combinational output is not read;
//   - at the clock edge the state, the registers, the registered outputs and the synchronisers load their next values;
//     a reset (synchronous: at the edge; asynchronous: as soon as it is active) loads their reset values.
// Isomorphic ES module: no DOM and no Node APIs.
import { analyze, stateEncoding } from './asm.js';

const ARITH = new Set(['+', '-', '&', '|', '^']);
const SHIFT = new Set(['<<', '>>']);
const CMP = new Set(['==', '!=', '<', '>', '<=', '>=']);
const mask = (w) => (1n << BigInt(w)) - 1n;

/** The chart ready to simulate: { sim } or { errors } (its validation's errors, the reason it cannot be simulated). */
export function prepareAsmSim(model) {
  let a;
  try { a = analyze(model); } catch (e) { return { errors: [{ severity: 'error', message: `Internal error: ${e.message}` }] }; }
  const errors = a.diags.filter((d) => d.severity === 'error');
  if (errors.length) return { errors };
  if (!a.m.nodes.some((n) => n.type === 'state')) return { errors: [{ severity: 'error', message: 'The chart has no state' }] };
  const enc = stateEncoding(a.m);
  const generics = new Map(a.generics.map((g) => [g.name, BigInt(g.default)]));
  const regs = [...a.m.outputs.filter((o) => o.registered), ...a.registers];
  return { sim: { a, m: a.m, enc, initial: enc[0].id, generics, regs, synced: a.m.inputs.filter((i) => i.sync) } };
}

/** Verilog's self-determined width of an expression (core/asm-emit.js vlSelfWidth). */
function selfWidth(ast, syms) {
  switch (ast.k) {
    case 'lit': return ast.w ?? 32;
    case 'id': { const s = syms.get(ast.name); return !s ? 1 : s.kind === 'generic' ? 32 : s.width; }
    case 'sel': return ast.hi - ast.lo + 1;
    case 'un': return ast.op === '!' ? 1 : selfWidth(ast.a, syms);
    case 'bin':
      if (ARITH.has(ast.op)) return Math.max(selfWidth(ast.a, syms), selfWidth(ast.b, syms));
      if (SHIFT.has(ast.op)) return selfWidth(ast.a, syms);
      return 1;
  }
  return 1;
}

/** The value of `ast` evaluated at the width W (a BigInt of W bits at most); read(name): a symbol's present value. */
function evalAt(ast, W, sim, read) {
  const syms = sim.a.syms;
  const own = (x) => evalAt(x, selfWidth(x, syms), sim, read);
  switch (ast.k) {
    case 'lit': return ast.v & mask(W);
    case 'id': return read(ast.name) & mask(W);
    case 'sel': {
      const s = syms.get(ast.name);
      const v = read(ast.name);
      return (s.width === 1 ? v : (v >> BigInt(ast.lo)) & mask(ast.hi - ast.lo + 1)) & mask(W);
    }
    case 'un':
      if (ast.op === '!') return own(ast.a) === 0n ? 1n : 0n;
      if (ast.op === '~') return ~evalAt(ast.a, W, sim, read) & mask(W);
      return -evalAt(ast.a, W, sim, read) & mask(W);
    case 'bin': {
      const { op } = ast;
      if (op === '&&') return own(ast.a) !== 0n && own(ast.b) !== 0n ? 1n : 0n;
      if (op === '||') return own(ast.a) !== 0n || own(ast.b) !== 0n ? 1n : 0n;
      if (SHIFT.has(op)) {
        const a = evalAt(ast.a, W, sim, read), n = own(ast.b);
        if (op === '>>') return n >= BigInt(W) ? 0n : a >> n;
        return n >= BigInt(W) ? 0n : (a << n) & mask(W);
      }
      if (CMP.has(op)) {
        const Wc = Math.max(selfWidth(ast.a, syms), selfWidth(ast.b, syms));
        const a = evalAt(ast.a, Wc, sim, read), b = evalAt(ast.b, Wc, sim, read);
        return ({ '==': a === b, '!=': a !== b, '<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b }[op]) ? 1n : 0n;
      }
      const a = evalAt(ast.a, W, sim, read), b = evalAt(ast.b, W, sim, read);
      const v = op === '+' ? a + b : op === '-' ? a - b : op === '&' ? a & b : op === '|' ? a | b : a ^ b;
      return v & mask(W);
    }
  }
  return 0n;
}

const big = (v, w) => {
  if (typeof v === 'bigint') return v & mask(w);
  if (typeof v === 'string' && /^[01]+$/.test(v) && v.length > 1) return BigInt(`0b${v}`) & mask(w);
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? BigInt(Math.floor(n)) & mask(w) : 0n;
};

/** Whether the reset is active for these inputs ({ [reset name]: level }). */
export function asmResetActive(sim, inputs = {}) {
  const r = sim.m.reset;
  if (!(r.name in inputs)) return false;
  return big(inputs[r.name], 1) === (r.active === 'high' ? 1n : 0n);
}

/** The reset state: { state, regs: { name: value }, meta, sync } (values BigInt). */
export function asmSimReset(sim) {
  return {
    state: sim.initial,
    regs: Object.fromEntries(sim.regs.map((r) => [r.name, sim.a.defaults.get(r.name) & mask(r.width)])),
    meta: Object.fromEntries(sim.synced.map((i) => [i.name, 0n])),
    sync: Object.fromEntries(sim.synced.map((i) => [i.name, 0n])),
  };
}

/**
 * One cycle of the chart in the present state `st` with the inputs (name: value, a number, a BigInt or binary
 * digits; the reset's level by its name, none: not active): {
 *   state, next (state ids), outputs: { name: value } (the Moore and Mealy outputs, the registered ones' present
 *   value), assigned: { name: value } (the registers' and the registered outputs' next values), by: { name: id } (the
 *   box whose action assigned it last this cycle: a state's a Moore output, a conditional output's a Mealy one),
 *   path: { nodes: [id] (the decisions and cases tested, the conditional outputs reached), edges: [id] (the exits
 *   followed), outputs: [id] (the conditional outputs reached) }, blocks: [{ id, nodes, edges, outputs }] (the
 *   every-cycle blocks' paths), reset (the asynchronous reset holds the machine in its reset state) }.
 */
export function asmSimEval(sim, st, inputs = {}) {
  const { a, m } = sim;
  const reset = !m.reset.sync && asmResetActive(sim, inputs);
  if (reset) st = asmSimReset(sim);
  const width = (name) => a.syms.get(name)?.width ?? 1;
  const read = (name) => {
    const s = a.syms.get(name);
    if (!s) return 0n;
    if (s.kind === 'generic') return sim.generics.get(name);
    if (s.kind === 'input') return s.sig === `${name}_sync` ? st.sync[name] : big(inputs[name], s.width);
    return st.regs[name] ?? 0n;
  };
  const vals = {}, by = {};
  for (const o of m.outputs) vals[o.name] = o.registered ? st.regs[o.name] : a.defaults.get(o.name) & mask(o.width);
  for (const r of a.registers) vals[r.name] = st.regs[r.name];
  const act = (id) => {
    for (const x of a.parsedActions.get(id) || []) {
      const w = width(x.target);
      vals[x.target] = evalAt(x.ast, Math.max(w, selfWidth(x.ast, a.syms)), sim, read) & mask(w);
      by[x.target] = id;
    }
  };
  const truth = (id) => { const ast = a.parsedConds.get(id); return evalAt(ast, selfWidth(ast, a.syms), sim, read) !== 0n; };
  const caseExit = (id) => {
    const pc = a.parsedCases.get(id);
    const v = evalAt(pc.ast, pc.width, sim, read);
    const i = pc.branches.findIndex((b) => !b.others && b.values.some((x) => x === v));
    return pc.branches[i >= 0 ? i : pc.branches.findIndex((b) => b.others)]?.label;
  };
  // the path from a box: [ending state id or null]; decisions and cases follow the exit their value selects
  const walk = (from, p) => {
    let id = from;
    for (let guard = 0; guard < 10000; guard++) {
      const ex = a.idx.exits.get(id) || {};
      const n = a.idx.nodes.get(id);
      const port = n.type === 'decision' ? (truth(id) ? 'true' : 'false') : n.type === 'case' ? caseExit(id) : 'next';
      if (n.type === 'output') act(id);
      const e = ex[port];
      if (!e) return null;
      p.edges.push(e.id);
      const to = a.idx.nodes.get(e.to);
      if (!to || to.type === 'state' || to.type === 'always') return to?.type === 'state' ? to.id : null;
      p.nodes.push(to.id);
      if (to.type === 'output') p.outputs.push(to.id);
      id = to.id;
    }
    return null;
  };
  const blocks = a.alwaysNodes.map((n) => {
    const p = { id: n.id, nodes: [], edges: [], outputs: [] };
    act(n.id);
    walk(n.id, p);
    return p;
  });
  const path = { nodes: [], edges: [], outputs: [] };
  act(st.state);
  const next = walk(st.state, path) ?? st.state;
  const outputs = Object.fromEntries(m.outputs.map((o) => [o.name, o.registered ? st.regs[o.name] : vals[o.name]]));
  const assigned = Object.fromEntries(sim.regs.map((r) => [r.name, vals[r.name]]));
  return { state: st.state, next, outputs, assigned, by, path, blocks, reset, st };
}

/** The state after a clock edge from `st` with the inputs: { st (the new state), cycle (asmSimEval's of the cycle) }. */
export function asmSimStep(sim, st, inputs = {}) {
  const cycle = asmSimEval(sim, st, inputs);
  if (asmResetActive(sim, inputs)) return { st: asmSimReset(sim), cycle };
  const from = cycle.st;
  return {
    st: {
      state: cycle.next,
      regs: { ...cycle.assigned },
      meta: Object.fromEntries(sim.synced.map((i) => [i.name, big(inputs[i.name], i.width)])),
      sync: Object.fromEntries(sim.synced.map((i) => [i.name, from.meta[i.name]])),
    },
    cycle,
  };
}

/** A value for JSON: a number up to 2^53, else its binary digits. */
export const asmSimValue = (v) => (v < 2n ** 53n ? Number(v) : v.toString(2));
/** A value as the panel shows it: a bit as 0 / 1, a vector in binary with its decimal value. */
export function asmSimText(v, w) {
  if (w === 1) return String(v);
  return `${v.toString(2).padStart(w, '0')} (${v})`;
}

/** The chart's run through a sequence of inputs (one entry per cycle, from reset): per cycle its state, outputs, next. */
export function simulateAsm(model, vectors) {
  const r = prepareAsmSim(model);
  if (r.errors) throw Object.assign(new Error(r.errors.map((d) => d.message).join('; ')), { diagnostics: r.errors });
  const { sim } = r;
  const name = (id) => sim.a.idx.nodes.get(id)?.name;
  let st = asmSimReset(sim);
  return vectors.map((inputs) => {
    const x = asmSimStep(sim, st, inputs);
    st = x.st;
    return { state: name(x.cycle.state), outputs: x.cycle.outputs, registers: x.cycle.st.regs, next: name(x.st.state), path: x.cycle.path };
  });
}
