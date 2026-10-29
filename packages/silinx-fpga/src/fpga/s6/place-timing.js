// Silinx - the Spartan-6 placer's timing estimate (#729): a static timing analysis of the netlist on a placement,
// with a simple delay model until the one fitted to ISE's trce (#731) replaces it (browser + Node).
//
// The paths are those of trce's clock period: from a clocked element (a flip-flop or latch, a shift register, a
// block RAM, a DSP48A1 with registers) to a clocked element, through the LUTs, carry stages, wide multiplexers and
// unregistered DSP48A1s. A connection inside a slice (a LUT into its carry stage, flip-flop or multiplexer) costs
// nothing; one between sites costs the model's base plus a delay per tile of Manhattan distance. The criticality
// of a connection (0 … 1) is 1 - slack / (the critical path's delay), as the Spartan-3E placer's (place.js
// analyzeTiming).
//
//   const tg = timingGraphS6(nl, phys)        once per design
//   analyzeS6(tg, pos) -> { dmax, crit: Float64Array by phys.conns, delay }   pos[inst] = [px, py]
import { ffKind } from './pack.js';

/** The delays of the estimate (ns): a -3 part's order of magnitude (DS162), not yet fitted (#731). */
export const S6_ESTIMATE = {
  base: 0.45, perTile: 0.06,          // a connection between sites: base + perTile x the Manhattan distance in tiles
  lut: 0.25, carry: 0.30, mux: 0.25,  // through a LUT, a CARRY4, an F7 / F8
  dsp: 3.9, clkToQ: 0.45, setup: 0.30,  // through an unregistered DSP48A1; a clocked element's clock to out, setup
  ramClkToQ: 1.9, dspClkToQ: 1.2,
};

const SEQ = /^(SRL16E?|SRLC16E|SRLC32E|RAMB8BWER|RAMB16BWER|RAM\d+X\d+[SD]|RAM32M|RAM64M)$/;
const dspRegistered = c => ['AREG', 'BREG', 'MREG', 'PREG', 'CREG', 'DREG', 'OPMODEREG', 'CARRYINREG', 'B0REG', 'B1REG', 'A0REG', 'A1REG'].some(p => Number(c.params[p] ?? 0) > 0);

/** The timing graph of a physical design (core/fpga/s6/phys.js) over its netlist's cells. */
export function timingGraphS6(nl, phys, model = S6_ESTIMATE) {
  const cells = nl.cells, C = cells.length;
  const kind = new Int8Array(C);       // 0 none (no paths: I/O, clock buffers), 1 comb, 2 clocked
  const cdelay = new Float64Array(C), clkq = new Float64Array(C);
  cells.forEach((c, i) => {
    const t = c.type;
    if (ffKind(t) || SEQ.test(t)) { kind[i] = 2; clkq[i] = /^RAMB/.test(t) ? model.ramClkToQ : model.clkToQ; }
    else if (t === 'DSP48A1') { if (dspRegistered(c)) { kind[i] = 2; clkq[i] = model.dspClkToQ; } else { kind[i] = 1; cdelay[i] = model.dsp; } }
    else if (/^(LUT\d|INV|BUF)$/.test(t)) { kind[i] = 1; cdelay[i] = model.lut; }
    else if (t === 'CARRY4') { kind[i] = 1; cdelay[i] = model.carry; }
    else if (/^MUXF[78]$/.test(t)) { kind[i] = 1; cdelay[i] = model.mux; }
  });
  // the connections that carry paths: out of a comb or clocked cell, into a comb or clocked one
  const conns = phys.conns;
  const live = [];
  conns.forEach((x, j) => { if (kind[x.src] && kind[x.dst]) live.push(j); });
  const into = Array.from({ length: C }, () => []), outOf = Array.from({ length: C }, () => []);
  for (const j of live) { into[conns[j].dst].push(j); outOf[conns[j].src].push(j); }
  // the comb cells in an order of their inputs first (Kahn; the cells of a combinational loop are left out)
  const deg = new Int32Array(C), order = [];
  for (let i = 0; i < C; i++) if (kind[i] === 1) for (const j of into[i]) if (kind[conns[j].src] === 1) deg[i]++;
  const q = [];
  for (let i = 0; i < C; i++) if (kind[i] === 1 && deg[i] === 0) q.push(i);
  while (q.length) {
    const i = q.pop();
    order.push(i);
    for (const j of outOf[i]) { const d = conns[j].dst; if (kind[d] === 1 && --deg[d] === 0) q.push(d); }
  }
  return { kind, cdelay, clkq, live, into, outOf, order, model, C };
}

/** The timing of a placement: the critical path's estimated delay (dmax, ns), each connection's criticality and delay. */
export function analyzeS6(tg, phys, pos) {
  const { kind, cdelay, clkq, live, into, outOf, order, model, C } = tg;
  const conns = phys.conns;
  const delay = new Float64Array(conns.length), crit = new Float64Array(conns.length);
  for (const j of live) {
    const x = conns[j];
    if (x.internal || x.srcInst === x.dstInst) continue;
    const a = pos[x.srcInst], b = pos[x.dstInst];
    delay[j] = model.base + model.perTile * (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]));
  }
  // arrival at each cell's output
  const arr = new Float64Array(C).fill(-Infinity);
  for (let i = 0; i < C; i++) if (kind[i] === 2) arr[i] = clkq[i];
  for (const i of order) {
    let t = -Infinity;
    for (const j of into[i]) t = Math.max(t, arr[conns[j].src] + delay[j]);
    arr[i] = t + cdelay[i];
  }
  let dmax = 0;
  for (const j of live) { const x = conns[j]; if (kind[x.dst] === 2 && arr[x.src] + delay[j] + model.setup > dmax) dmax = arr[x.src] + delay[j] + model.setup; }
  // required time at each comb cell's output, latest first
  const req = new Float64Array(C).fill(Infinity);
  const reqAt = j => { const d = conns[j].dst; return kind[d] === 2 ? dmax - model.setup : req[d] - cdelay[d]; };
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k];
    let r = Infinity;
    for (const j of outOf[i]) r = Math.min(r, reqAt(j) - delay[j]);
    req[i] = r;
  }
  if (dmax > 0) {
    for (const j of live) {
      const slack = reqAt(j) - (arr[conns[j].src] + delay[j]);
      if (Number.isFinite(slack)) crit[j] = Math.max(0, Math.min(1, 1 - slack / dmax));
    }
  }
  return { dmax, crit, delay };
}
