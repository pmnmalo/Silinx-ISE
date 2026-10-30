// Silinx HLS (#1924): the delay of a combinational function's longest path, estimated from its dataflow graph
// (core/c-graph.js), and whether it fits the target clock: a function that does not is scheduled over cycles, as Vitis HLS does,
// a sequential module with ap_clk and ap_rst (core/c-fsmd.js). The clock is the project's: syn.clock of
// hls_config.cfg, else Vitis HLS's 10 ns. Vitis HLS keeps 27 % of the period for its clock uncertainty; the estimate
// is checked against the rest. The delays, in ns, are of the order of Vitis HLS's own for an Artix-7 (its default
// part): enough to tell a function of a few additions (it fits) from a chain of them, a wide multiplication, a table
// read or a floating-point operation (it does not).
// Isomorphic ES module: no DOM and no Node APIs.

export const DEFAULT_CLOCK = 10;
export const UNCERTAINTY = 0.27;

// (an operation's delay by its kind and its result's width)
const delays = ({ carry, eq, mul, lut, shift }) => ({
  add: carry, sub: carry, neg: carry, lt: carry, le: carry, gt: carry, ge: carry,
  eq, ne: eq,   // (n: the operands' width)
  mul,
  mux: () => lut.mux, and: () => lut.gate, or: () => lut.gate, xor: () => lut.gate, not: () => 0,
  shl: (w, n, k) => (k ? 0 : shift(w)), shr: (w, n, k) => (k ? 0 : shift(w)),
});
// The delays of a family (#2080). artix7: of the order of Vitis HLS's own, to compare with it. spartan3e: the boards',
// fitted on small designs through the open flow, speed grade -4 (test/c-timing.test.js has the periods measured): an
// operation between two registers takes its delay here and about 1.2 ns of the registers'. A chain of additions costs
// less than the sum of its additions (their carries overlap): the estimate of a chain is high, never low.
export const FAMILIES = {
  artix7: delays({
    carry: (w) => 0.8 + 0.04 * w,   // add, sub, a comparison: a carry chain
    eq: (w, n) => 0.6 + 0.02 * n,
    mul: (w) => 3.4 * Math.ceil(w / 36),   // one DSP slice up to 18 x 18, a cascade beyond
    lut: { mux: 0.5, gate: 0.3 },
    shift: (w) => 0.5 * Math.ceil(Math.log2(w + 1)),
  }),
  spartan3e: delays({
    carry: (w) => 3.1 + 0.03 * w,
    eq: (w, n) => 1.4 + 0.03 * n,
    mul: (w) => 7 * Math.ceil(w / 36),   // one MULT18X18 up to 18 x 18, more beyond
    lut: { mux: 1.4, gate: 1.4 },
    shift: (w) => 1.4 * Math.ceil(Math.log2(w + 1) / 2),   // (a LUT and its F5 mux: two bits of the amount)
  }),
};

/** The estimated delay, in ns, of one node's operation (core/c-schedule.js's, #2080). */
export function nodeDelay(graph, n, family = 'artix7') {
  const d = FAMILIES[family][n.op];
  const args = n.args || [];
  // (a shift by a constant is wiring; the operands' width of a comparison its own)
  const constAmount = (n.op === 'shl' || n.op === 'shr') && args.length > 1 && graph.nodes[args[1]].op === 'const';
  // (a multiplication by a power of 2: a shift by a constant, wiring)
  const pow2 = (a) => { const x = graph.nodes[a]; return x.op === 'const' && x.k > 0n && (x.k & (x.k - 1n)) === 0n; };
  if (n.op === 'mul' && args.some(pow2)) return 0;
  return d ? d(n.w, args.length ? graph.nodes[args[0]].w : n.w, constAmount) : 0;
}

/** The estimated delay, in ns, of the graph's longest path from an input or a constant to any node. */
export function pathDelay(graph, family = 'artix7') {
  const at = new Array(graph.nodes.length).fill(0);
  let worst = 0;
  for (const n of graph.nodes) {
    const start = (n.args || []).reduce((m, a) => Math.max(m, at[a] ?? 0), 0);
    at[n.id] = start + nodeDelay(graph, n, family);
    if (at[n.id] > worst) worst = at[n.id];
  }
  return worst;
}

/** Whether a combinational function's graph fits the clock (ns): its estimate within the period less its
 *  uncertainty. */
export function fitsClock(graph, clock = DEFAULT_CLOCK, family = 'artix7') {
  return pathDelay(graph, family) <= clock * (1 - UNCERTAINTY);
}
