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
const carry = (w) => 0.8 + 0.04 * w;   // add, sub, a comparison: a carry chain
const DELAY = {
  add: carry, sub: carry, neg: carry, lt: carry, gt: carry, ge: carry,
  eq: (w, n) => 0.6 + 0.02 * n, ne: (w, n) => 0.6 + 0.02 * n,   // (n: the operands' width)
  mul: (w) => 3.4 * Math.ceil(w / 36),   // one DSP slice up to 18 x 18, a cascade beyond
  mux: () => 0.5, and: () => 0.3, or: () => 0.3, xor: () => 0.3, not: () => 0,
  shl: (w, n, k) => (k ? 0 : 0.5 * Math.ceil(Math.log2(w + 1))), shr: (w, n, k) => (k ? 0 : 0.5 * Math.ceil(Math.log2(w + 1))),
};

/** The estimated delay, in ns, of the graph's longest path from an input or a constant to any node. */
export function pathDelay(graph) {
  const at = new Array(graph.nodes.length).fill(0);
  let worst = 0;
  for (const n of graph.nodes) {
    const args = n.args || [];
    const start = args.reduce((m, a) => Math.max(m, at[a] ?? 0), 0);
    const d = DELAY[n.op];
    // (a shift by a constant is wiring; the operands' width of a comparison its own)
    const constAmount = (n.op === 'shl' || n.op === 'shr') && args.length > 1 && graph.nodes[args[1]].op === 'const';
    const own = d ? d(n.w, args.length ? graph.nodes[args[0]].w : n.w, constAmount) : 0;
    at[n.id] = start + own;
    if (at[n.id] > worst) worst = at[n.id];
  }
  return worst;
}

/** Whether a combinational function's graph fits the clock (ns): its estimate within the period less its
 *  uncertainty. */
export function fitsClock(graph, clock = DEFAULT_CLOCK) {
  return pathDelay(graph) <= clock * (1 - UNCERTAINTY);
}
