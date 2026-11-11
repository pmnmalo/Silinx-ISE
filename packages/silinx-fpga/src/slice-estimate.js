// Silinx toolchain - the slices of a Spartan-3E netlist as nextpnr packs it (#2529): the open synthesis compares its
// mappings by their slices (synth-open.js keepDepth, keepChains; synth-area.js), counted here as the spartan3e
// micro-architecture of nextpnr (the fork pmnmalo/nextpnr-spartan, spartan3e.cc pack()) fills them, without running it
// (browser + Node). Its steps, in its order:
// - the inverters on the flip-flops' clocks, enables and sets / resets, taken by the slices' inverters (Silinx's
//   nextpnrNetlist, lowerControlInverters): their flip-flops on the inverter's input;
// - the wide multiplexers (pack_muxes): a tree of MUXF6 .. MUXF8 over MUXF5s, one slice per MUXF5, a MUXF5 alone one
//   slice; each MUXF5's two LUTs (the input's LUT when it feeds only that input, else a copy or a LUT passing it
//   through), the flip-flop of the top's output with them; a MUXF6 .. MUXF8 that is not the top of a whole tree, a LUT;
// - the distributed RAMs and shift registers (pack_mems): a RAM16X1D, a RAM32X1S a slice each; the others two a slice,
//   of one clock and enable (a RAM16X1S of one address), a shift register into another's D on its Q15 with it, the
//   flip-flop an always shifting one feeds beside it;
// - the carry chains (pack_carry): a stage is a MUXCY and the XORCY of its carry in (a stage whose select is 1 and whose
//   carry in no sum reads, left out), two stages a slice; a stage before the first that brings its carry in when the
//   first's LUT reads four other nets than its DI, an XORCY of the carry out at the end; each stage's LUT (the select's
//   driver when it feeds only the stage, or the sum is not used; else a copy or a LUT passing it through) and the
//   flip-flop of its sum, when its control set suits the slice's other one;
// - the other LUTs and flip-flops (pack_slices): a flip-flop with the LUT that drives its D, a LUT alone, a flip-flop
//   alone (first into a free side of a chain's slice of its control set, whose BX / BY brings nothing else:
//   ffs_into_chains), two LUTs and two flip-flops of one control set (clock, enable, set / reset and its mode) a slice: as many
//   slices as the LUTs need or as each control set's flip-flops need, the larger (nextpnr fills them greedily, by the
//   nets they share, or the critical connections' first when that costs at most 2 % more slices).
// Measured against nextpnr's slices on the examples and the open synthesis's choices on the corpus (#2529).
import { readYosysJson } from './fpga/netlist.js';

// the cells the spartan3e micro-architecture packs (open-flow-nextpnr.js NEXTPNR_CELL, the same): a netlist with
// others (another family's LUT6, CARRY4…) has no estimate
export const S3E_CELL = /^(LUT[1-4]|INV|FD[RSCP]?E?(_1)?|LD(CE|PE|E)?(_1)?|MUXCY|XORCY|MUXF[5-8]|GND|VCC|IBUF|IBUFG|OBUF|OBUFT|IOBUF|IDDR2|ODDR2|BUFG|BUFGMUX(_1)?|DCM|DCM_SP|BSCAN_SPARTAN3|RAMB16_S(1|2|4|9|18|36)(_S(1|2|4|9|18|36))?|MULT18X18(S|SIO)?|RAM16X1[SD]|RAM32X1S|SRLC?16E?(_1)?)$/;
const LUT = /^(LUT[1-4]|INV)$/;
const MUX_LEVEL = { MUXF5: 5, MUXF6: 6, MUXF7: 7, MUXF8: 8 };
const MEM = /^(RAM16X1S|RAM16X1D|RAM32X1S|SRLC?16E?(_1)?)$/;

/** The slices of a mapped Spartan-3E netlist (Yosys's JSON: object, text or bytes) as nextpnr packs them, estimated;
 *  null when the netlist cannot be read or has cells of another family. */
export function sliceEstimate(json, top) {
  let nl;
  try { nl = readYosysJson(typeof json === 'string' || json?.modules ? json : new TextDecoder().decode(json), { top }); } catch { return null; }
  const { cells, nets } = nl;
  if (cells.some(c => !S3E_CELL.test(c.type))) return null;
  const kind = cells.map(c => (LUT.test(c.type) ? 'lut' : /^FD/.test(c.type) || /^LD/.test(c.type) ? 'ff' : c.type));
  const taken = new Set();   // the cells in a cluster (a multiplexer's, a memory's, a chain's)
  const loads = k => (k > 1 ? nets[k].loads : []);
  const driverOf = k => (k > 1 && nets[k].driver ? nets[k].driver.cell : -1);
  let slices = 0;
  // the inverters on control pins (open-flow-nextpnr.js lowerControlInverters): a flip-flop's clock, enable or set / reset
  // reads the inverter's input (the slice's CLKINV, CEINV, SRINV), the inverter left out when nothing else reads it
  const CTRL = /^(C|G|CE|GE|R|S|CLR|PRE)$/;
  const invOf = new Map();
  cells.forEach((c, i) => {
    const src = c.pins.I, out = c.pins.O;
    if (c.type !== 'INV' || !(src > 1) || !(out > 1) || nets[out].port) return;
    invOf.set(out, src);
    if (nets[out].loads.every(l => kind[l.cell] === 'ff' && CTRL.test(l.pin))) kind[i] = 'gone';
  });
  const pinNet = k => invOf.get(k) ?? k;
  // a flip-flop's control set (pack_luts_ffs: an enable at 1, a set / reset at 0, none)
  const ctrl = i => {
    const c = cells[i], p = c.pins, sr = p.R ?? p.S ?? p.CLR ?? p.PRE ?? 0;
    const mode = sr === 0 ? 'NONE' : p.R !== undefined ? 'SR' : p.S !== undefined ? 'SS' : p.CLR !== undefined ? 'AR' : 'AS';
    return `${c.type[0]}:${pinNet(p.C ?? p.G)}:${(p.CE ?? p.GE ?? 1) === 1 ? '' : pinNet(p.CE ?? p.GE)}:${mode === 'NONE' ? '' : pinNet(sr)}:${mode}`;
  };
  // the flip-flop a net feeds on its D, not in a cluster yet (the first)
  const ffOn = k => { for (const l of loads(k)) if (kind[l.cell] === 'ff' && l.pin === 'D' && !taken.has(l.cell)) return l.cell; return -1; };
  const take = i => { if (i >= 0) taken.add(i); return i; };

  // the wide multiplexers
  const lutIn = k => { const d = driverOf(k); if (d >= 0 && kind[d] === 'lut' && !taken.has(d) && loads(k).length === 1) taken.add(d); };
  const f5 = i => { taken.add(i); lutIn(cells[i].pins.I1); lutIn(cells[i].pins.I0); slices++; };
  const level = i => MUX_LEVEL[kind[i]] || 0;
  const tree = (i, out) => {
    out.push(i);
    if (level(i) === 5) return true;
    return ['I1', 'I0'].every(p => { const d = driverOf(cells[i].pins[p]); return d >= 0 && level(d) === level(i) - 1 && !taken.has(d) && !out.includes(d) && tree(d, out); });
  };
  for (const l of [8, 7, 6]) {
    cells.forEach((c, i) => {
      if (level(i) !== l || taken.has(i)) return;
      const t = [];
      if (!tree(i, t)) { kind[i] = 'lut'; return; }   // (a LUT: O = S ? I1 : I0)
      for (const m of t) { taken.add(m); if (level(m) === 5) f5(m); }
      take(ffOn(c.pins.O));
    });
  }
  cells.forEach((c, i) => { if (level(i) === 5 && !taken.has(i)) { f5(i); take(ffOn(c.pins.O)); } });

  // the memories
  const mems = [];
  cells.forEach((c, i) => {
    if (!MEM.test(c.type)) return;
    const srl = c.type[0] === 'S', p = c.pins, en = (srl ? p.CE : p.WE) ?? 1;
    const inv = c.type.endsWith('_1') !== !!(Number(c.params[`IS_${srl ? 'CLK' : 'WCLK'}_INVERTED`]) & 1);
    mems.push({ i, srl, type: c.type, clk: srl ? p.CLK : p.WCLK, en: en === 1 ? null : en, inv, out: srl ? p.Q : p.O ?? p.SPO, q15: p.Q15, d: p.D });
  });
  const sameKey = (a, b) => a.clk === b.clk && a.en === b.en && a.inv === b.inv && a.srl === b.srl;
  const byCell = new Map(mems.map((m, k) => [m.i, k]));
  const used = mems.map(() => false), next = mems.map(() => -1), prev = mems.map(() => false);
  mems.forEach((m, k) => {
    const l = m.srl && m.q15 !== undefined ? loads(m.q15) : [];
    if (l.length === 1 && byCell.has(l[0].cell)) { next[k] = byCell.get(l[0].cell); prev[next[k]] = true; }
  });
  const sideFf = m => {
    if (!m.srl || m.en || m.inv) return;
    for (const l of loads(m.out)) {
      const p = cells[l.cell].pins;
      if (kind[l.cell] === 'ff' && l.pin === 'D' && !taken.has(l.cell) && p.C === m.clk && (p.CE ?? 1) === 1 && (p.R ?? p.S ?? p.CLR ?? p.PRE ?? 0) === 0) { taken.add(l.cell); return; }
    }
  };
  const memSlice = (...ms) => { slices++; for (const m of ms) if (m) { taken.add(m.i); sideFf(m); } };
  mems.forEach((m, k) => {
    if (prev[k] || next[k] < 0) return;
    const chain = [];
    for (let j = k; j >= 0 && chain.length < 4; j = next[j]) { chain.push(mems[j]); used[j] = true; }
    memSlice(chain[0], chain[1]);
    if (chain.length > 2) memSlice(chain[2], chain[3]);
  });
  const allVcc = m => ['A0', 'A1', 'A2', 'A3'].every(a => cells[m.i].pins[a] === 1);
  mems.forEach((m, k) => {
    if (used[k]) return;
    if (mems.some((h, j) => j !== k && !used[j] && h.srl && m.srl && sameKey(h, m) && m.d !== undefined && h.out === m.d && allVcc(h))) return;
    used[k] = true;
    if (/^RAM(16X1D|32X1S)$/.test(m.type)) { memSlice(m); return; }
    let mate = -1;
    if (m.srl && allVcc(m)) mate = mems.findIndex((h, j) => j !== k && !used[j] && h.srl && sameKey(h, m) && h.d === m.out);
    if (mate < 0) {
      mate = mems.findIndex((h, j) => j !== k && !used[j] && sameKey(h, m) && h.type === m.type
        && (m.srl || ['A0', 'A1', 'A2', 'A3'].every(a => cells[h.i].pins[a] === cells[m.i].pins[a])));
    }
    if (mate >= 0) used[mate] = true;
    memSlice(m, mate >= 0 ? mems[mate] : null);
  });

  // the carry chains
  const isConst = k => k === 0 || k === 1;
  const muxes = [], xors = [];
  cells.forEach((c, i) => { if (c.type === 'MUXCY') muxes.push(i); else if (c.type === 'XORCY') xors.push(i); });
  // (a stage whose select is 1 and whose carry in no sum reads: left out, its loads read the carry in)
  const gone = new Set(muxes.filter(i => {
    const p = cells[i].pins;
    return p.S === 1 && !isConst(p.CI) && !loads(p.CI).some(l => cells[l.cell].type === 'XORCY' && l.pin === 'CI');
  }));
  const carryIn = i => { let k = cells[i].pins.CI; for (let d = driverOf(k); d >= 0 && gone.has(d); d = driverOf(k)) k = cells[d].pins.CI; return k; };
  const kept = muxes.filter(i => !gone.has(i));
  const nextMux = new Map(), continued = new Set();
  for (const i of kept) {
    const d = driverOf(carryIn(i));
    if (d >= 0 && cells[d].type === 'MUXCY' && !gone.has(d) && !nextMux.has(d)) { nextMux.set(d, i); continued.add(i); }
  }
  const usedXor = new Set();
  const takeXor = (ci, li) => {
    const ok = x => !usedXor.has(x) && (li === null || cells[x].pins.LI === li);
    // (a constant carry in: an XORCY on that constant, with that select)
    const x = isConst(ci) ? xors.find(j => cells[j].pins.CI === ci && li !== null && ok(j))
      : xors.find(j => carryIn(j) === ci && ok(j));
    if (x !== undefined) usedXor.add(x);
    return x ?? -1;
  };
  const chains = [];
  for (const m of kept) {
    if (continued.has(m)) continue;
    const stages = [];
    for (let c = m; c !== undefined; c = nextMux.get(c)) stages.push([c, takeXor(carryIn(c), cells[c].pins.S)]);
    // (the first stage's DI on BX, its LUT reading four other nets: a stage before it brings the carry in)
    const di = cells[m].pins.DI;
    if (di !== undefined && !isConst(di)) {
      const d = driverOf(cells[m].pins.S);
      const ins = d >= 0 && kind[d] === 'lut' ? ['I0', 'I1', 'I2', 'I3', 'I'].map(p => cells[d].pins[p]).filter(k => k !== undefined && !isConst(k)) : [];
      if (ins.length === 4 && !ins.includes(di)) stages.unshift([-1, -1, 'cin']);
    }
    const x = takeXor(cells[stages.at(-1)[0]].pins.O, null);
    if (x >= 0) stages.push([-1, x]);
    chains.push(stages);
  }
  for (const x of xors) if (!usedXor.has(x)) { usedXor.add(x); chains.push([[-1, x]]); }
  // the chains' slices: each side's flip-flop (its control set) or the net its BX / BY brings (a side free for a
  // flip-flop alone whose D is that net, or none)
  const chainSlices = [];
  for (const stages of chains) {
    stages.forEach(([mx, xr, cin], k) => {
      if (mx >= 0) taken.add(mx);
      if (xr >= 0) taken.add(xr);
      if (k % 2 === 0) { slices++; chainSlices.push({ ff: [null, null], b: [null, null] }); }
      const sl = chainSlices.at(-1), side = k % 2;
      if (cin) return;
      // (the chain's carry in on BX: a net, or a constant from the VCC / GND source)
      if (k === 0 && mx >= 0) sl.b[0] = isConst(carryIn(mx)) ? -1 : carryIn(mx);
      // its LUT: the select's driver when it feeds only this stage, or the sum is not used
      const s = mx >= 0 ? cells[mx].pins.S : cells[xr].pins.LI, d = driverOf(s);
      const others = loads(s).some(l => l.cell !== mx && l.cell !== xr);
      const sumFree = xr < 0 || loads(cells[xr].pins.O).length === 0;
      const lutd = d >= 0 && kind[d] === 'lut';
      if (lutd && !taken.has(d) && (!others || sumFree)) taken.add(d);
      // (its DI on BX / BY: a net its LUT, of four other inputs, does not read)
      const di = mx >= 0 ? cells[mx].pins.DI : undefined;
      const ins = lutd ? ['I0', 'I1', 'I2', 'I3', 'I'].map(p => cells[d].pins[p]).filter(n => n !== undefined && !isConst(n)) : [s];
      if (di !== undefined && !isConst(di) && ins.length === 4 && !ins.includes(di)) sl.b[side] = di;
      // the sum's flip-flop, its control set the slice's other one's
      if (xr >= 0) {
        for (const l of loads(cells[xr].pins.O)) {
          if (kind[l.cell] !== 'ff' || l.pin !== 'D' || taken.has(l.cell)) continue;
          if (sl.ff[1 - side] && sl.ff[1 - side] !== ctrl(l.cell)) continue;
          taken.add(l.cell);
          sl.ff[side] = ctrl(l.cell);
          break;
        }
      }
    });
  }

  // the other LUTs and flip-flops: a flip-flop with the LUT driving its D; a flip-flop alone into a free side of a chain's
  // slice of its control set (ffs_into_chains), then the LUTs alone
  let luts = 0;
  const ffs = new Map();
  const inUnit = new Set();
  cells.forEach((c, i) => {
    if (kind[i] !== 'ff' || taken.has(i)) return;
    const d = driverOf(c.pins.D);
    if (d >= 0 && kind[d] === 'lut' && !taken.has(d) && !inUnit.has(d)) { inUnit.add(d); luts++; }
    else {
      const cs = ctrl(i), D = c.pins.D;
      const sl = chainSlices.find(x => (x.ff[0] ?? x.ff[1] ?? cs) === cs && [0, 1].some(k => !x.ff[k] && (x.b[k] === null || x.b[k] === D)));
      if (sl) { const k = [0, 1].find(j => !sl.ff[j] && (sl.b[j] === null || sl.b[j] === D)); sl.ff[k] = cs; sl.b[k] = D; return; }
    }
    ffs.set(ctrl(i), (ffs.get(ctrl(i)) || 0) + 1);
  });
  kind.forEach((k, i) => { if (k === 'lut' && !taken.has(i) && !inUnit.has(i)) luts++; });
  let byCtrl = 0;
  for (const n of ffs.values()) byCtrl += Math.ceil(n / 2);
  return slices + Math.max(Math.ceil(luts / 2), byCtrl);
}
