// Silinx - the Spartan-6 slice model and packer (#721; the plan: research/s6/README.md, #1): the cells of a netlist
// of the open synthesis for the Spartan-6 (Yosys synth_xilinx -family xc6s, read by core/fpga/netlist.js) grouped
// into slices (browser + Node). The Spartan-3E packer, core/fpga/pack.js, is another module.
//
// A Spartan-6 slice (UG384) has four positions A, B, C, D, each with
//   - a 6-input LUT with two outputs: O6 (a function of A1-A6), or O6 and O5 (two functions of the shared A1-A5,
//     A6 high) - LUT combining, which ISE's map leaves off by default (-lc off; combine: 'area' turns it on here);
//   - two storage elements: the FF (AFF … DFF: a flip-flop or a latch) and the 5FF (A5FF … D5FF: a flip-flop only),
//     the FF's D from O6, O5, the carry chain's XOR or carry out, the F7 / F8 multiplexer or the bypass input X
//     (AX … DX), the 5FF's from O5 or the bypass input;
//   - one multiplexed output (AMUX … DMUX), the only way out of the slice for O5, the carry's XOR or carry out, the
//     F7 / F8 multiplexer and the 5FF (O6 has its own output A … D, the FF its own AQ … DQ);
// one control set for the eight storage elements: the clock (its inversion), the clock enable, the set / reset (each
// storage element's SRINIT says which, its INIT the value after configuration) and whether the set / reset is
// synchronous; flip-flops or latches, latches only in the FFs and only when no 5FF is used. Three kinds of slice:
//   SLICEX: the above only;
//   SLICEL: + the carry chain CARRY4 (S from the LUTs' O6, DI from their O5 or the bypass inputs, CYINIT from AX,
//           CI from the CARRY4 below in the same column) and the wide multiplexers F7AMUX (LUTs A and B, select AX),
//           F7BMUX (C and D, CX), F8MUX (the two F7s, BX);
//   SLICEM: + the LUTs as distributed RAM (RAM32X1S / D, RAM64X1S / D, RAM128X1S / D, RAM256X1S, RAM32M, RAM64M, one
//           write clock, write enable and write address for the slice, the D LUT's) and as shift registers (SRL16E,
//           SRLC32E: one clock and clock enable for the slice).
// A CLB has two slices: SLICEM and SLICEX, or SLICEL and SLICEX; half the slices of a device are SLICEX.
//
// packS6(netlist, { combine }) -> {
//   slices: [{ kind: 'X' | 'L' | 'M', pos: { A: { o6, o5, ff, ff5, x (the bypass input's net), mux } … }, carry, f7: { A, B },
//              f8, chain: { id, index } | null, ctrl (the storage elements' control set key) | null, mem (the SLICEM's
//              RAM / SRL control key) | null }]   (cells by their index in the netlist; o6 / o5 / ff / ff5: a cell or
//              null; ff: AND2L, the storage element as a gate passing the carry's sum; o5 'thru:<net>': the LUT passing a
//              net to the 5FF (#1143); mux: what leaves by AMUX … ('o5', 'xor',
//              'cy', 'f7', 'f8', 'ff5'))
//   chains: [[slice indices, bottom to top]]   carry chains: consecutive SLICEL / SLICEM of one column
//   others: { type: count }   the cells on sites of their own (I/O buffers, BUFG, RAMB8BWER / RAMB16BWER, DSP48A1…)
//   stats:  { slices, X, L, M, luts, ffs, and2l (storage elements used as gates), carry4, f7, f8, lutram, srl, others }   (X / L / M: the slices that need that
//            kind at least: an X fits any slice, an L a SLICEL or SLICEM, an M a SLICEM)
//   warnings: [] }
// checkSlice(slice, nl) -> [errors]: every rule above, for the tests (and the placer, #729).
import { paramInt } from '../netlist.js';

export class PackError extends Error {}

/** A storage element used as a gate (ISE map's AND2L): the carry's sum out of the slice by the position's Q, the
 *  multiplexed output being the carry out's. The slice then has no storage element (its control key is this). */
export const AND2L = 'and2l';

const POS = ['A', 'B', 'C', 'D'];
const LUT_TYPE = /^LUT([1-6])$/;
// storage elements: the pin of the set / reset, whether it is asynchronous, a latch (its gate G, enable GE)
const FF_KIND = {
  FDRE: { sr: 'R', async: false }, FDSE: { sr: 'S', async: false }, FDCE: { sr: 'CLR', async: true }, FDPE: { sr: 'PRE', async: true },
  FD: { sr: null }, FDE: { sr: null }, FDR: { sr: 'R', async: false }, FDS: { sr: 'S', async: false }, FDC: { sr: 'CLR', async: true }, FDP: { sr: 'PRE', async: true },
  LDCE: { sr: 'CLR', async: true, latch: true }, LDPE: { sr: 'PRE', async: true, latch: true }, LD: { sr: null, latch: true }, LDE: { sr: null, latch: true },
};
export const ffKind = type => {
  const m = /^(\w+?)(_1)?$/.exec(type);
  const k = m && FF_KIND[m[1]];
  return k ? { ...k, neg: !!m[2] } : null;
};
// the SLICEM's cells: the LUT positions they take (D first: the write address is the D LUT's), their wide
// multiplexers, and their write address pins (a RAM) or none (a shift register)
const MEM = {
  RAM32X1S: { luts: 1, addr: 'A', n: 5 }, RAM64X1S: { luts: 1, addr: 'A', n: 6 },
  RAM32X1D: { luts: 2, addr: 'A', n: 5 }, RAM64X1D: { luts: 2, addr: 'A', n: 6 },
  RAM128X1S: { luts: 2, addr: 'A', n: 7, f7: 1 }, RAM128X1D: { luts: 4, addr: 'A', n: 7, f7: 2 }, RAM256X1S: { luts: 4, addr: 'A', n: 8, f7: 2, f8: 1 },
  RAM32M: { luts: 4, addr: 'ADDRD', n: 5 }, RAM64M: { luts: 4, addr: 'ADDRD', n: 6 },
  SRL16E: { luts: 1, srl: true }, SRLC32E: { luts: 1, srl: true }, SRL16: { luts: 1, srl: true }, SRLC16E: { luts: 1, srl: true },
};
// the cells on sites of their own, counted
const OWN_SITE = /^(IBUF|IBUFG|OBUF|OBUFT|IOBUF|BUFG|BUFGMUX|BUFGCE|BUFIO2|BUFH|RAMB8BWER|RAMB16BWER|DSP48A1|DCM_SP|PLL_BASE|PLL_ADV|GND|VCC|PULLUP|PULLDOWN)$/;

/** The netlist's index: a net's driver and loads, a cell's input nets. */
function indexOf(nl) {
  const inputs = c => Object.entries(c.pins).filter(([p]) => c.dirs[p.replace(/<\d+>$/, '')] !== 'output').map(([p, n]) => [p, n]);
  return { inputs, driver: n => nl.nets[n]?.driver || null, loads: n => nl.nets[n]?.loads || [] };
}

/** The distinct non-constant input nets of a LUT cell (or an INV: a LUT1). */
export function lutInputs(c) {
  return [...new Set(Object.entries(c.pins).filter(([p]) => /^I\d$/.test(p)).map(([, n]) => n).filter(n => n > 1))];
}
const isLut = c => LUT_TYPE.test(c.type) || c.type === 'INV' || c.type === 'BUF';

/** The control set of a storage element: 'clk:inv:ce:sr:async:latch' (no set / reset: neither sync nor async). */
export function ctrlKey(c) {
  const k = ffKind(c.type);
  const clk = c.pins[k.latch ? 'G' : 'C'] ?? 0;
  const ce = c.pins[k.latch ? 'GE' : 'CE'] ?? 1;
  const sr = k.sr ? c.pins[k.sr] ?? 0 : 0;
  return `${clk}:${k.neg ? 1 : 0}:${ce}:${sr}:${sr === 0 ? '-' : k.async ? 'a' : 's'}:${k.latch ? 'L' : 'F'}`;
}
// the control key of a SLICEM's RAM / shift register cell: its clock, write / clock enable, and (a RAM) write address
function memKey(c) {
  const m = MEM[c.type];
  const clk = c.pins[m.srl ? 'CLK' : 'WCLK'] ?? 0, we = c.pins[m.srl ? 'CE' : 'WE'] ?? 1;
  const addr = m.srl ? [] : Array.from({ length: m.n }, (_, i) => c.pins[`${m.addr}<${i}>`] ?? c.pins[`${m.addr}${i}`] ?? 0);
  return `${m.srl ? 'srl' : 'ram'}:${clk}:${we}:${addr.join(',')}`;
}

const emptyPos = () => ({ o6: null, o5: null, ff: null, ff5: null, x: null, mux: null });
const newSlice = kind => ({ kind, pos: Object.fromEntries(POS.map(p => [p, emptyPos()])), carry: null, f7: { A: null, B: null }, f8: null, chain: null, ctrl: null, mem: null });
const KIND_RANK = { X: 0, L: 1, M: 2 };

/**
 * Pack a Spartan-6 netlist (core/fpga/netlist.js readYosysJson of Yosys's xc6s netlist) into slices.
 * combine: 'off' (ISE map's default: a LUT per position) or 'area' (two LUTs of 5 shared inputs at most in one
 * position, O6 and O5).
 */
export function packS6(nl, { combine = 'off' } = {}) {
  const ix = indexOf(nl);
  const cells = nl.cells;
  const slices = [], chains = [], others = {}, warnings = [];
  const where = new Map();   // cell -> slice index
  const put = (ci, s) => { if (where.has(ci)) throw new PackError(`the cell ${cells[ci].name} packed twice`); where.set(ci, s); };
  const lutOf = net => { const d = ix.driver(net); return d && isLut(cells[d.cell]) && !where.has(d.cell) ? d.cell : null; };
  const slice = kind => { slices.push(newSlice(kind)); return slices.length - 1; };
  // a position's LUT: the cell driving `net` when it is a free LUT, else a route-through of the net ('thru:<net>')
  const placeLut = (si, p, net) => {
    const lc = net > 1 ? lutOf(net) : null;
    if (lc !== null) { slices[si].pos[p].o6 = lc; put(lc, si); } else slices[si].pos[p].o6 = net > 1 ? `thru:${net}` : `const:${net}`;
  };

  // ---- carry chains: CARRY4s linked CO<3> -> CI, bottom first; a SLICEL each, its LUTs those driving S
  const carry = cells.map((c, i) => (c.type === 'CARRY4' ? i : -1)).filter(i => i >= 0);
  const below = new Map();
  for (const ci of carry) {
    const d = ix.driver(cells[ci].pins.CI ?? 0);
    if (d && cells[d.cell].type === 'CARRY4' && d.pin === 'CO<3>') below.set(ci, d.cell);
  }
  const above = new Map([...below].map(([a, b]) => [b, a]));
  for (const bottom of carry.filter(ci => !below.has(ci))) {
    const chain = [];
    for (let ci = bottom; ci !== undefined; ci = above.get(ci)) {
      const si = slice('L');
      const s = slices[si];
      s.carry = ci; put(ci, si);
      s.chain = { id: chains.length, index: chain.length };
      chain.push(si);
      const c = cells[ci];
      POS.forEach((p, i) => {
        placeLut(si, p, c.pins[`S<${i}>`] ?? 0);
        // DI from the position's O5 (LUT combining in the carry chain, which map does: a 5-input LUT sharing the S
        // LUT's inputs, its only load the carry: O5 has no way out of the slice but the multiplexed output, which
        // the carry's sum may need) or from the bypass input
        const di = c.pins[`DI<${i}>`] ?? 0, o6 = s.pos[p].o6;
        const dl = di > 1 && ix.loads(di).every(l => l.cell === ci) ? lutOf(di) : null;
        if (dl !== null && typeof o6 === 'number' && new Set([...lutInputs(cells[o6]), ...lutInputs(cells[dl])]).size <= 5 && lutInputs(cells[dl]).length <= 5) {
          s.pos[p].o5 = dl; put(dl, si);
        } else if (di > 1 && di !== c.pins[`S<${i}>`]) s.pos[p].x = di;
      });
      // the sum and the carry out both out of a position (the sum to anything but a flip-flop, the carry out to
      // anything but the carry above): the carry out by the multiplexed output, the sum through the position's
      // storage element set as a gate (map's AND2L, out by Q; night 1's clock example), the slice then without any
      // flip-flop (the gate takes the slice's control)
      POS.forEach((p, i) => {
        const o = c.pins[`O<${i}>`], co = c.pins[`CO<${i}>`];
        const sumOut = o > 1 && ix.loads(o).some(l => !(ffKind(cells[l.cell].type) && l.pin === 'D'));
        const coOut = i < 3 && co > 1 && ix.loads(co).some(l => !(cells[l.cell].type === 'CARRY4' && l.pin === 'CI'));
        if (sumOut && coOut && s.ctrl === null) { s.pos[p].ff = AND2L; s.ctrl = AND2L; }
      });
      // CYINIT from AX when it is a signal (a constant is a setting)
      const cy = c.pins.CYINIT ?? 0;
      if (cy > 1 && !below.has(ci)) {
        if (s.pos.A.x !== null && s.pos.A.x !== cy) warnings.push(`carry chain at ${c.name}: CYINIT and DI<0> both need the bypass input AX`);
        s.pos.A.x = cy;
      }
    }
    chains.push(chain);
  }

  // ---- the wide multiplexers: an F8 with its two F7s and four LUTs, then the F7s two by two (a SLICEL)
  const f7Of = net => { const d = ix.driver(net); return d && cells[d.cell].type === 'MUXF7' && !where.has(d.cell) ? d.cell : null; };
  const placeF7 = (si, half, f7) => {
    const s = slices[si], [p, q] = half === 'A' ? ['A', 'B'] : ['C', 'D'];
    s.f7[half] = f7; put(f7, si);
    // (MUXF7's I1 is the upper LUT's: F7AMUX takes A on I0? UG384: F7AMUX selects between LUT A and LUT B)
    placeLut(si, p, cells[f7].pins.I0 ?? 0);
    placeLut(si, q, cells[f7].pins.I1 ?? 0);
    const sel = cells[f7].pins.S ?? 0;
    if (sel > 1) s.pos[half === 'A' ? 'A' : 'C'].x = sel;
  };
  for (let ci = 0; ci < cells.length; ci++) {
    if (cells[ci].type !== 'MUXF8' || where.has(ci)) continue;
    const a = f7Of(cells[ci].pins.I0 ?? 0), b = f7Of(cells[ci].pins.I1 ?? 0);
    if (a === null || b === null) throw new PackError(`the MUXF8 ${cells[ci].name}: its inputs must be two MUXF7s`);
    const si = slice('L');
    slices[si].f8 = ci; put(ci, si);
    placeF7(si, 'A', a); placeF7(si, 'B', b);
    const sel = cells[ci].pins.S ?? 0;
    if (sel > 1) slices[si].pos.B.x = sel;
  }
  let half = null;
  for (let ci = 0; ci < cells.length; ci++) {
    if (cells[ci].type !== 'MUXF7' || where.has(ci)) continue;
    if (half && slices[half.si].pos.C.o6 === null) { placeF7(half.si, 'B', ci); half = null; continue; }
    const si = slice('L');
    placeF7(si, 'A', ci);
    half = { si };
  }

  // ---- the SLICEM's RAMs and shift registers: by control key, four LUT positions a slice (D first)
  const memSlices = new Map();
  for (let ci = 0; ci < cells.length; ci++) {
    const m = MEM[cells[ci].type];
    if (!m) continue;
    const key = memKey(cells[ci]);
    let si = memSlices.get(key);
    const used = s => POS.filter(p => slices[s].pos[p].o6 !== null).length;
    if (si === undefined || used(si) + m.luts > 4) { si = slice('M'); slices[si].mem = key; memSlices.set(key, si); }
    const s = slices[si];
    const free = [...POS].reverse().filter(p => s.pos[p].o6 === null).slice(0, m.luts);
    for (const p of free) s.pos[p].o6 = ci;
    put(ci, si);
    if (m.f7) { s.f7.A = s.f7.A ?? `mem:${ci}`; if (m.f7 > 1) s.f7.B = `mem:${ci}`; }
    if (m.f8) s.f8 = `mem:${ci}`;
  }

  // ---- the storage elements: into the slice of the logic that drives their D (a LUT's O6, the carry's XOR or
  // carry out, an F7 / F8) when its control set allows, else beside their LUT, else with others of their control set
  const ffs = cells.map((c, i) => (ffKind(c.type) ? i : -1)).filter(i => i >= 0);
  // (a SLICEM's storage elements are clocked by its RAMs' or shift registers' clock)
  const sameClock = (s, key) => !s.mem || s.mem.split(':')[1] === key.split(':')[0];
  const fits = (s, key, latch) => (s.ctrl === null || s.ctrl === key) && sameClock(s, key) && !(latch && POS.some(p => s.pos[p].ff5 !== null));
  const fitsFf5 = (s, key) => (s.ctrl === null || s.ctrl === key) && sameClock(s, key) && !(s.ctrl && s.ctrl.endsWith(':L'));
  const placeFf = (si, p, ci, five, x = null) => {
    const s = slices[si];
    s.pos[p][five ? 'ff5' : 'ff'] = ci; put(ci, si);
    s.ctrl = ctrlKey(cells[ci]);
    if (x !== null) s.pos[p].x = x;
    if (five) s.pos[p].mux = 'ff5';
  };
  // the position whose logic drives a net, in a slice: [slice, pos, source] (source: 'o6', 'o5', 'xor', 'cy', 'f7', 'f8')
  const localSource = net => {
    const d = ix.driver(net);
    if (!d || !where.has(d.cell)) return null;
    const si = where.get(d.cell), s = slices[si], c = cells[d.cell];
    if (c.type === 'CARRY4') { const m = /^(O|CO)<(\d)>$/.exec(d.pin); return [si, POS[+m[2]], m[1] === 'O' ? 'xor' : 'cy']; }
    if (c.type === 'MUXF7') return [si, s.f7.A === d.cell ? 'A' : 'C', 'f7'];
    if (c.type === 'MUXF8') return [si, 'B', 'f8'];
    for (const p of POS) { if (s.pos[p].o6 === d.cell) return [si, p, 'o6']; if (s.pos[p].o5 === d.cell) return [si, p, 'o5']; }
    return null;
  };
  const rest = [];
  for (const ci of ffs) {
    const key = ctrlKey(cells[ci]), latch = ffKind(cells[ci].type).latch;
    const src = localSource(cells[ci].pins.D ?? 0);
    if (src) {
      const [si, p, how] = src, s = slices[si];
      if (fits(s, key, latch) && s.pos[p].ff === null) { placeFf(si, p, ci, false); continue; }
      // (the 5FF takes O5 or the bypass input only)
      if (how === 'o5' && !latch && fitsFf5(s, key) && s.pos[p].ff5 === null && s.pos[p].mux === null) { placeFf(si, p, ci, true); continue; }
    }
    rest.push(ci);
  }
  // the LUTs not packed yet: a slice of their own with the flip-flops they drive (by control set), four positions
  const looseLuts = cells.map((c, i) => (isLut(c) && !where.has(i) ? i : -1)).filter(i => i >= 0);
  const openX = new Map();   // control set key (or '' for none) -> slice with room
  const lutSlice = (key) => {
    let si = openX.get(key);
    if (si === undefined || POS.every(p => slices[si].pos[p].o6 !== null)) { si = slice('X'); openX.set(key, si); }
    return si;
  };
  const ffOfLut = new Map();
  for (const ci of rest) {
    const d = ix.driver(cells[ci].pins.D ?? 0);
    if (d && looseLuts.includes(d.cell) && !ffOfLut.has(d.cell)) ffOfLut.set(d.cell, ci);
  }
  const placed = new Set();
  for (const lc of looseLuts) {
    const ff = ffOfLut.get(lc);
    const key = ff !== undefined ? ctrlKey(cells[ff]) : '';
    const si = lutSlice(key);
    const s = slices[si], p = POS.find(q => s.pos[q].o6 === null);
    s.pos[p].o6 = lc; put(lc, si);
    if (ff !== undefined && fits(s, key, ffKind(cells[ff].type).latch)) { placeFf(si, p, ff, false); placed.add(ff); }
  }
  // LUT combining ('area'): a 5-input LUT at most into the O5 of a SLICEX's position whose O6 LUT shares the
  // inputs (a SLICEL's multiplexed outputs are the carry's and the F7s')
  if (combine === 'area') {
    const free = [];
    for (let si = 0; si < slices.length; si++) {
      const s = slices[si];
      if (s.kind !== 'X') continue;
      for (const p of POS) {
        const o6 = s.pos[p].o6;
        if (typeof o6 === 'number' && isLut(cells[o6]) && s.pos[p].o5 === null && lutInputs(cells[o6]).length <= 5) free.push([si, p]);
      }
    }
    // (a slice emptied of all its LUTs this way is dropped below)
    for (const [si, p] of free) {
      const s = slices[si];
      if (s.pos[p].o5 !== null || s.pos[p].o6 === null) continue;
      const mine = new Set(lutInputs(cells[s.pos[p].o6]));
      for (let sj = si + 1; sj < slices.length; sj++) {
        const t = slices[sj];
        if (t.kind !== 'X' || t.pos.A.ff || t.pos.B.ff || t.pos.C.ff || t.pos.D.ff) continue;
        const q = POS.find(r => typeof t.pos[r].o6 === 'number' && t.pos[r].o5 === null && lutInputs(cells[t.pos[r].o6]).length <= 5
          && new Set([...mine, ...lutInputs(cells[t.pos[r].o6])]).size <= 5);
        if (!q) continue;
        const lc = t.pos[q].o6;
        t.pos[q].o6 = null; where.set(lc, si);
        s.pos[p].o5 = lc;
        if (s.pos[p].mux === null) s.pos[p].mux = 'o5';
        break;
      }
    }
  }
  // the other storage elements: with others of their control set, the FF of a position by its bypass input (one
  // net per bypass input), the 5FF (whose D is O5's only, #1143) through the position's O5 as a route-through of a
  // LUT input ('thru:<net>', as map's PK_PACKTHRU): when O5 is free and the O6 LUT leaves it an input (5 shared at
  // most, A6 high)
  const o5Thru = (q, net) => {
    if (q.o5 !== null || net <= 1) return false;
    if (q.o6 === null || (typeof q.o6 === 'string' && q.o6.startsWith('const:'))) return true;
    if (typeof q.o6 === 'string') return true;   // a route-through of S: two inputs
    if (!isLut(cells[q.o6])) return false;
    return new Set([...lutInputs(cells[q.o6]), net]).size <= 5;
  };
  for (const ci of rest) {
    if (placed.has(ci)) continue;
    const key = ctrlKey(cells[ci]), latch = ffKind(cells[ci].type).latch, dnet = cells[ci].pins.D ?? 0;
    let done = false;
    for (let si = 0; si < slices.length && !done; si++) {
      const s = slices[si];
      if (!fits(s, key, latch)) continue;
      for (const p of POS) {
        const pos = s.pos[p];
        if (pos.x !== null && pos.x !== dnet) continue;
        if (pos.ff === null) { placeFf(si, p, ci, false, dnet); done = true; break; }
        if (!latch && pos.ff5 === null && pos.mux === null && fitsFf5(s, key) && o5Thru(pos, dnet)) { placeFf(si, p, ci, true); pos.o5 = `thru:${dnet}`; done = true; break; }
      }
    }
    if (!done) { const si = slice('X'); placeFf(si, 'A', ci, false, dnet); }
  }

  // ---- the multiplexed outputs: what leaves a position by AMUX … (O5, the carry's XOR or carry out, F7 / F8)
  // (inside a slice: a storage element's D, the carry's CI, DI and S, a wide multiplexer's inputs; a LUT's input
  // is outside, its inputs come from the interconnect)
  const usedOutside = (net, si) => ix.loads(net).some(l => where.get(l.cell) !== si || !/^(D|CI|DI<\d>|S<\d>|I[01])$/.test(l.pin) || isLut(cells[l.cell]));
  for (let si = 0; si < slices.length; si++) {
    const s = slices[si];
    if (s.carry !== null) {
      const c = cells[s.carry];
      POS.forEach((p, i) => {
        const o = c.pins[`O<${i}>`], co = c.pins[`CO<${i}>`];
        const xorOut = o > 1 && usedOutside(o, si);
        // (CO<3> goes up the column; out of the slice by DMUX when it has other loads)
        const cyOut = co > 1 && ix.loads(co).some(l => !(cells[l.cell].type === 'CARRY4' && l.pin === 'CI') && (where.get(l.cell) !== si || l.pin !== 'D'));
        // (the sum through a gate, AND2L, marked with the carry slices: the carry out by the multiplexed output)
        if (s.pos[p].ff === AND2L) { setMux(s, p, 'cy', warnings, c); return; }
        if (xorOut) setMux(s, p, 'xor', warnings, c);
        if (cyOut) setMux(s, p, 'cy', warnings, c);
      });
    }
    for (const [h, p] of [['A', 'A'], ['B', 'C']]) {
      const f = s.f7[h];
      if (typeof f === 'number' && usedOutside(cells[f].pins.O, si)) setMux(s, p, 'f7', warnings, cells[f]);
    }
    if (typeof s.f8 === 'number' && usedOutside(cells[s.f8].pins.O, si)) setMux(s, 'B', 'f8', warnings, cells[s.f8]);
    for (const p of POS) if (typeof s.pos[p].o5 === 'number' && usedOutside(cells[s.pos[p].o5].pins.O, si) && s.pos[p].mux !== 'o5') setMux(s, p, 'o5', warnings, cells[s.pos[p].o5]);
  }

  // ---- the rest: sites of their own
  for (let ci = 0; ci < cells.length; ci++) {
    if (where.has(ci)) continue;
    const t = cells[ci].type;
    if (!OWN_SITE.test(t)) throw new PackError(`the Spartan-6 packer has no place for the cell ${cells[ci].name} (${t})`);
    others[t] = (others[t] || 0) + 1;
  }
  const live = slices.filter(s => POS.some(p => s.pos[p].o6 !== null || s.pos[p].o5 !== null || s.pos[p].ff !== null || s.pos[p].ff5 !== null) || s.carry !== null);
  const kinds = { X: 0, L: 0, M: 0 };
  for (const s of live) kinds[s.kind]++;
  const count = (f) => live.reduce((n, s) => n + POS.filter(p => f(s.pos[p])).length, 0);
  const stats = {
    slices: live.length, ...kinds,
    luts: count(q => typeof q.o6 === 'number' && isLut(cells[q.o6])) + count(q => typeof q.o5 === 'number'),
    ffs: count(q => typeof q.ff === 'number') + count(q => q.ff5 !== null), and2l: count(q => q.ff === AND2L),
    carry4: carry.length, f7: cells.filter(c => c.type === 'MUXF7').length, f8: cells.filter(c => c.type === 'MUXF8').length,
    lutram: cells.filter(c => MEM[c.type] && !MEM[c.type].srl).length, srl: cells.filter(c => MEM[c.type]?.srl).length,
    others: Object.values(others).reduce((a, b) => a + b, 0),
  };
  const renum = new Map(slices.map((s, i) => [i, live.indexOf(s)]));
  return { slices: live, chains: chains.map(ch => ch.map(i => renum.get(i))), others, stats, warnings };
}

// a position's multiplexed output: one signal; a second one is the packer's error
function setMux(s, p, what, warnings, c) {
  if (s.pos[p].mux === null || s.pos[p].mux === what) { s.pos[p].mux = what; return; }
  warnings.push(`${c.name}: the output ${p}MUX of its slice carries ${s.pos[p].mux} already (${what} needs it too)`);
}

/** The rules of a slice (the model above): [errors]. nl: the netlist the slice was packed from. */
export function checkSlice(s, nl) {
  const err = [], cells = nl.cells;
  const need = KIND_RANK[s.carry !== null || s.f7.A !== null || s.f7.B !== null || s.f8 !== null ? 'L' : 'X'];
  if (s.mem && s.kind !== 'M') err.push('a RAM or shift register in a slice that is not a SLICEM');
  if (KIND_RANK[s.kind] < need) err.push(`a carry chain or a wide multiplexer in a SLICE${s.kind}`);
  const ctrls = new Set(), mems = new Set();
  let ff5 = false, latch = false;
  for (const p of POS) {
    const q = s.pos[p];
    for (const k of ['ff', 'ff5']) {
      if (q[k] === null) continue;
      if (q[k] === AND2L) {
        if (k !== 'ff' || s.carry === null || q.mux !== 'cy') err.push(`${p}${k === 'ff' ? 'FF' : '5FF'}: a gate (AND2L) but not the carry's sum beside its carry out`);
        ctrls.add(AND2L);
        continue;
      }
      const c = cells[q[k]], kind = ffKind(c.type);
      if (!kind) { err.push(`${p}${k === 'ff' ? 'FF' : '5FF'}: ${c.type} is not a storage element`); continue; }
      ctrls.add(ctrlKey(c));
      if (k === 'ff5') {
        ff5 = true;
        if (kind.latch) err.push(`${p}5FF: a latch (${c.name})`);
        // (its D is O5's: the O5 LUT's output or its route-through of the D net, #1143)
        const d = c.pins.D ?? 0;
        if (!(typeof q.o5 === 'number' && cells[q.o5].pins.O === d) && q.o5 !== `thru:${d}`) err.push(`${p}5FF: its D (${c.name}) is not the position's O5`);
      }
      if (kind.latch) latch = true;
    }
    if (typeof q.o6 === 'number' && MEM[cells[q.o6].type]) mems.add(memKey(cells[q.o6]));
    if (typeof q.o5 === 'number') {
      const a = typeof q.o6 === 'number' && isLut(cells[q.o6]) ? lutInputs(cells[q.o6]) : [];
      const b = lutInputs(cells[q.o5]);
      if (b.length > 5 || new Set([...a, ...b]).size > 5) err.push(`${p}: O6 and O5 share more than 5 inputs`);
    } else if (typeof q.o5 === 'string' && typeof q.o6 === 'number' && isLut(cells[q.o6])) {
      if (new Set([...lutInputs(cells[q.o6]), +q.o5.slice(5)]).size > 5) err.push(`${p}: O6 and the route-through of O5 share more than 5 inputs`);
    }
  }
  if (ctrls.size > 1) err.push(`storage elements of ${ctrls.size} control sets`);
  if (ff5 && latch) err.push('latches with a 5FF used');
  if (mems.size > 1) err.push(`RAMs or shift registers of ${mems.size} clocks, write enables or write addresses`);
  if (mems.size && ctrls.size && [...ctrls][0].split(':')[0] !== [...mems][0].split(':')[1]) err.push('storage elements of another clock than the RAMs\' or shift registers\'');
  if (s.carry !== null && cells[s.carry].type !== 'CARRY4') err.push('the carry is not a CARRY4');
  return err;
}
