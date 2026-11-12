// Silinx toolchain - the slices of a Spartan-3E netlist as nextpnr packs it (#2529): the open synthesis compares its
// mappings by their slices (synth-open.js keepDepth, keepChains; synth-area.js), counted here as the spartan3e
// micro-architecture of nextpnr (the fork pmnmalo/nextpnr-spartan, spartan3e.cc pack()) fills them, without running it
// (browser + Node). Its steps, in its order:
// - the inverters on the flip-flops' clocks, enables and sets / resets, taken by the slices' inverters (Silinx's
//   nextpnrNetlist, lowerControlInverters): their flip-flops on the inverter's input;
// - the wide multiplexers (pack_muxes): a tree of MUXF6 .. MUXF8 over MUXF5s, one slice per MUXF5, a MUXF5 alone one
//   slice; each MUXF5's two LUTs (the input's LUT when it feeds only that input, else a copy or a LUT passing it
//   through), the flip-flop of the top's output with them; a MUXF6 .. MUXF8 that is not the top of a whole tree, a LUT;
//   each slice's BX the select of its MUXF5, BY that of the MUXF6 .. MUXF8 placed in it (record_mux_slices, 1.5.1);
// - the distributed RAMs and shift registers (pack_mems): a RAM16X1D, a RAM32X1S a slice each; the others two a slice,
//   of one clock and enable (a RAM16X1S of one address), a shift register into another's D on its Q15 with it, the
//   flip-flop an always shifting one feeds beside it;
// - the carry chains (pack_carry): a stage is a MUXCY and the XORCY of its carry in (a sum whose LI is 0 and a stage
//   whose select is 0, of a net, wires: left out, 1.5.1; a stage whose select is 1 and whose carry in no sum reads, left
//   out), two stages a slice; a stage before the first that brings its carry in when the
//   first's LUT reads four other nets than its DI, an XORCY of the carry out at the end; each stage's LUT (the select's
//   driver when it feeds only the stage, or the sum is not used; else a copy or a LUT passing it through) and the
//   flip-flop of its sum, when its control set suits the slice's other one;
// - the other LUTs and flip-flops (pack_slices): a LUT with the first flip-flop it feeds (the LUTs in the netlist's
//   order, 1.5.1), a LUT alone, a flip-flop alone (first into a free side of a chain's or a wide multiplexer's slice of
//   its control set, whose BX / BY brings nothing else: ffs_into_chains), two LUTs and two flip-flops of one control set
//   (clock, enable, set / reset, each inverted or not, synchronous or not: 1.5.1, whether it sets or resets each
//   flip-flop's own) a slice: as many slices as the LUTs need or as each control set's flip-flops need, the larger
//   (nextpnr fills them greedily, by the nets they share, or the critical connections' first when that costs at most 2 %
//   more slices; its greedy fill reaches that bound on the examples).
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
  const isConst = k => k === 0 || k === 1;
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
  // a flip-flop's control set (pack_luts_ffs: an enable at 1, a set / reset at 0, none; same_mode: the set / reset
  // synchronous or not, whether it sets or resets the flip-flop's own; the slice's CLKINV, CEINV, SRINV: a pin inverted by
  // its parameter, the cell's _1 or an inverter, #3389)
  const ctrl = i => {
    const c = cells[i], p = c.pins, srPin = ['R', 'S', 'CLR', 'PRE'].find(x => p[x] !== undefined), sr = srPin ? p[srPin] : 0;
    const mode = sr === 0 ? '' : srPin === 'R' || srPin === 'S' ? 'S' : 'A';
    const inv = (pin, k) => (Number(c.params[`IS_${pin}_INVERTED`]) & 1) ^ (invOf.has(k) ? 1 : 0) ? '~' : '';
    const [cp, ep] = c.type[0] === 'L' ? ['G', 'GE'] : ['C', 'CE'], ce = p[ep] ?? 1;
    const clk = `${pinNet(p[cp])}${inv(cp, p[cp]) === '~' !== c.type.endsWith('_1') ? '~' : ''}`;
    return `${c.type[0]}:${clk}:${ce === 1 ? '' : pinNet(ce) + inv(ep, ce)}:${mode && pinNet(sr) + inv(srPin, sr)}:${mode}`;
  };
  // the flip-flop a net feeds on its D, not in a cluster yet (the first)
  const ffOn = k => { for (const l of loads(k)) if (kind[l.cell] === 'ff' && l.pin === 'D' && !taken.has(l.cell)) return l.cell; return -1; };
  const take = i => { if (i >= 0) taken.add(i); return i; };

  // the wide multiplexers; their slices, for the flip-flops alone: each side's flip-flop (its control set) and the
  // select its BX / BY brings (record_mux_slices)
  const muxSlices = [];
  const lutIn = k => { const d = driverOf(k); if (d >= 0 && kind[d] === 'lut' && !taken.has(d) && loads(k).length === 1) taken.add(d); };
  const f5 = i => { taken.add(i); lutIn(cells[i].pins.I1); lutIn(cells[i].pins.I0); slices++; };
  const level = i => MUX_LEVEL[kind[i]] || 0;
  const tree = (i, out) => {
    out.push(i);
    if (level(i) === 5) return true;
    return ['I1', 'I0'].every(p => { const d = driverOf(cells[i].pins[p]); return d >= 0 && level(d) === level(i) - 1 && !taken.has(d) && !out.includes(d) && tree(d, out); });
  };
  const sel = i => (isConst(cells[i].pins.S) ? -1 : cells[i].pins.S);
  // (a tree's places, place_mux: a MUXF6 .. MUXF8 in the slice of a MUXF5 under it, by (column, row))
  const place = (i, col, row, at) => {
    const key = `${col}:${row}`;
    if (!at.has(key)) at.set(key, { ff: [null, null], b: [null, null] });
    const l = level(i), [a, b] = [driverOf(cells[i].pins.I1), driverOf(cells[i].pins.I0)];
    at.get(key).b[l === 5 ? 0 : 1] = sel(i);
    if (l === 6) { place(a, col, row, at); place(b, col, row + 1, at); }
    else if (l === 7) { place(a, col, row - 1, at); place(b, col + 1, row - 1, at); }
    else if (l === 8) { place(a, col - 1, row, at); place(b, col - 1, row + 2, at); }
  };
  for (const l of [8, 7, 6]) {
    cells.forEach((c, i) => {
      if (level(i) !== l || taken.has(i)) return;
      const t = [];
      if (!tree(i, t)) { kind[i] = 'lut'; return; }   // (a LUT: O = S ? I1 : I0)
      for (const m of t) { taken.add(m); if (level(m) === 5) f5(m); }
      const at = new Map(), col = l === 8 ? 1 : 0, row = l === 6 ? 0 : 1;
      place(i, col, row, at);
      const ff = take(ffOn(c.pins.O));
      if (ff >= 0) at.get(`${col}:${row}`).ff[1] = ctrl(ff);   // (the top's output on its slice's FFY)
      muxSlices.push(...at.values());
    });
  }
  cells.forEach((c, i) => {
    if (level(i) !== 5 || taken.has(i)) return;
    f5(i);
    const ff = take(ffOn(c.pins.O));
    muxSlices.push({ ff: [ff >= 0 ? ctrl(ff) : null, null], b: [sel(i), null] });
  });

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
  let muxes = [], xors = [];
  cells.forEach((c, i) => { if (c.type === 'MUXCY') muxes.push(i); else if (c.type === 'XORCY') xors.push(i); });
  // (a sum whose LI is 0 passes its carry in, a stage whose select is 0 its DI: wires, when that is a net, left out, their
  // loads reading it; the sums first)
  const bypass = (i, to) => {
    const p = cells[i].pins;
    for (const [pin, k] of Object.entries(p)) if (pin !== 'O' && k > 1) nets[k].loads = nets[k].loads.filter(l => l.cell !== i);
    if (p.O > 1) {
      for (const l of nets[p.O].loads) { cells[l.cell].pins[l.pin] = to; nets[to].loads.push(l); }
      nets[p.O].loads = [];
    }
    kind[i] = 'gone';
  };
  xors = xors.filter(i => { const p = cells[i].pins; if (p.LI === 0 && p.CI > 1) { bypass(i, p.CI); return false; } return true; });
  muxes = muxes.filter(i => { const p = cells[i].pins; if (p.S === 0 && p.DI > 1) { bypass(i, p.DI); return false; } return true; });
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
      // its LUT: the select's driver when it feeds only this stage, or the sum is not used; else a copy of it or a LUT
      // passing it through, the stage no longer a load of the select (stage_lut): a later stage may take the driver (#3389)
      const s = mx >= 0 ? cells[mx].pins.S : cells[xr].pins.LI, d = driverOf(s);
      const others = loads(s).some(l => l.cell !== mx && l.cell !== xr);
      const sumFree = xr < 0 || loads(cells[xr].pins.O).length === 0;
      const lutd = d >= 0 && kind[d] === 'lut';
      if (lutd && !taken.has(d) && (!others || sumFree)) taken.add(d);
      else if (s > 1) nets[s].loads = nets[s].loads.filter(l => l.cell !== mx && l.cell !== xr);
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

  // the other LUTs and flip-flops: each LUT with the first flip-flop its output feeds on D (in the netlist's order); a
  // flip-flop alone into a free side of a chain's or a wide multiplexer's slice of its control set (ffs_into_chains)
  let luts = 0;
  const ffs = new Map();
  const inUnit = new Set();
  const count = i => ffs.set(ctrl(i), (ffs.get(ctrl(i)) || 0) + 1);
  cells.forEach((c, i) => {
    if (kind[i] !== 'lut' || taken.has(i)) return;
    luts++;
    const f = loads(c.pins.O).find(l => kind[l.cell] === 'ff' && l.pin === 'D' && !taken.has(l.cell) && !inUnit.has(l.cell));
    if (f) { inUnit.add(f.cell); count(f.cell); }
  });
  const macros = [...chainSlices, ...muxSlices];
  cells.forEach((c, i) => {
    if (kind[i] !== 'ff' || taken.has(i) || inUnit.has(i)) return;
    const cs = ctrl(i), D = c.pins.D;
    const side = x => [0, 1].find(k => !x.ff[k] && (x.b[k] === null || x.b[k] === D));
    const sl = D === undefined ? undefined : macros.find(x => (x.ff[0] ?? x.ff[1] ?? cs) === cs && side(x) !== undefined);
    if (sl) { const k = side(sl); sl.ff[k] = cs; sl.b[k] = D; return; }
    count(i);
  });
  let byCtrl = 0;
  for (const n of ffs.values()) byCtrl += Math.ceil(n / 2);
  return slices + Math.max(Math.ceil(luts / 2), byCtrl);
}
