// Silinx - packer: the cells of a Spartan-3E netlist (core/fpga/netlist.js) grouped into the sites
// of the chip (browser + Node).
//
// A Spartan-3E slice has two 4-input LUTs (F, G), two flip-flops (FFX fed from the F side, FFY from
// the G side), the F5MUX (F or G, selected by BX), one wide multiplexer FiMUX (F6, F7 or F8 depending
// on the slice, inputs FXINA / FXINB from neighbouring slices, selected by BY) and two stages of the
// carry chain (CYMUXF / XORF on the F side, CYMUXG / XORG on the G side; COUT of slice Y feeds CIN of
// slice Y+1 in the same column). Both flip-flops share the clock, the clock enable, the set/reset and
// its synchronous / asynchronous mode. Every site output goes through a multiplexer with a few
// fixed choices: X = F, F5 or the XORF sum (FXMUX), Y = G, the FiMUX or the XORG sum (GYMUX); the
// flip-flops take their D from that multiplexer or from BX / BY (DXMUX / DYMUX).
//
// pack(netlist, { ucf, part, carryOut, timing }) -> {
//   name, part, cfg (the design's cfg string: the ports' bus information, raw XDL text),
//   insts:  [{ name, type: 'SLICEL' | 'SLICEM' | 'IBUF' | 'IOB' | 'BUFGMUX' | 'RAMB16' | 'MULT18X18SIO' | 'DCM',
//              kind: 'slice' | 'iob' | 'bufg' | 'bram' | 'mult' | 'dcm', cfg: [{ attr, name, value }],
//              loc: pad | site (a DCM: INST LOC) | null, wide (bram: a 36-bit port), regs (an IOB's registers:
//              'I' / 'O' / 'T', #96) }],
//   nets:   [{ name, type: 'wire' | 'gnd' | 'vcc', outpins: [{ inst, pin }], inpins: [{ inst, pin }] }]   (inst = index)
//   cellSites: [{ inst, bel } | null]   where each netlist cell went (FFX / FFY, F / G, CYMUXF…; inst -1: left out)
//   macros: [{ kind: 'carry' | 'F6' | 'F7' | 'F8', members: [{ inst, dx, dy }] }]   slices that must keep these
//           relative positions (slice coordinates: SLICE_X(x+dx)Y(y+dy))
//   stats:  { slices, luts, ffs, carry, muxes, iobs, bufgs, copies, passthru, carryPass (carry stages left out:
//             their select the constant 1), unusedInputs, slicem, brams, mults, dcms,
//             timing (the slices filled by timing, #528: kept, not too many) },
//           warnings: [] }
// Besides the slices: distributed RAMs and shift registers in SLICEMs, block RAMs, multipliers and the
// DCM on sites of their own (the sections below say how, as ISE's map writes them).
// The cfg strings are those ISE writes for the same settings (xdl -ncd2xdl), without the settings
// that are off, which is what xdl -xdl2ncd expects of a design.
import { paramBits, paramInt } from './netlist.js';
import { initToEquation } from './lut.js';
import { parseUcf } from '../ucf.js';

export class PackError extends Error {}

// ------------------------------------------------------------------ cells
const LUT_K = { LUT1: 1, LUT2: 2, LUT3: 3, LUT4: 4 };
// flip-flops and latches: the pin of the set / reset, whether it sets, whether it is synchronous
const FF_KIND = {
  FDRE: { sr: 'R', high: false, sync: true }, FDSE: { sr: 'S', high: true, sync: true },
  FDCE: { sr: 'CLR', high: false, sync: false }, FDPE: { sr: 'PRE', high: true, sync: false },
  FD: { sr: null }, FDE: { sr: null }, FDR: { sr: 'R', high: false, sync: true }, FDS: { sr: 'S', high: true, sync: true },
  FDC: { sr: 'CLR', high: false, sync: false }, FDP: { sr: 'PRE', high: true, sync: false },
  LDCE: { sr: 'CLR', high: false, sync: false, latch: true }, LDPE: { sr: 'PRE', high: true, sync: false, latch: true },
  LD: { sr: null, latch: true }, LDE: { sr: null, latch: true },
};
const ffKind = type => {
  const m = /^(\w+?)(_1)?$/.exec(type);
  const k = m && FF_KIND[m[1]];
  return k ? { ...k, neg: !!m[2] } : null;
};
const MUXF = { MUXF5: 5, MUXF6: 6, MUXF7: 7, MUXF8: 8 };
// cells in the LUTs of a SLICEM (the left column of a CLB): distributed RAMs and shift registers
const SLICEM_MEM = {
  RAM16X1S: 'ram', RAM16X1D: 'ramd', RAM32X1S: 'ram32',
  SRL16: 'srl', SRL16E: 'srl', SRL16_1: 'srl', SRL16E_1: 'srl', SRLC16: 'srl', SRLC16E: 'srl', SRLC16_1: 'srl', SRLC16E_1: 'srl',
};
// block RAMs (single port: port A) and multipliers
const BRAM_TYPE = /^RAMB16_S(1|2|4|9|18|36)(_S(1|2|4|9|18|36))?$/;
const MULT_TYPE = /^MULT18X18(S|SIO)?$/;
const DCM_TYPE = /^DCM(_SP)?$/;
// a block-RAM port of each width: its PORTx_ATTR, data bits, parity bits, address bits
export const BRAM_WIDTH = {
  1: { attr: '16384X1', data: 1, par: 0, addr: 14 }, 2: { attr: '8192X2', data: 2, par: 0, addr: 13 },
  4: { attr: '4096X4', data: 4, par: 0, addr: 12 }, 9: { attr: '2048X9', data: 8, par: 1, addr: 11 },
  18: { attr: '1024X18', data: 16, par: 2, addr: 10 }, 36: { attr: '512X36', data: 32, par: 4, addr: 9 },
};

// Wide multiplexers in a CLB (slices S0 = (0,0), S1 = (0,1), S2 = (1,0), S3 = (1,1) from the CLB's
// bottom-left slice): which FiMUX each slice has, and where its inputs come from (I1 on FXINA,
// I0 on FXINB). F6 combines the F5 of its own slice and the slice above; F7 the F6 of the two
// slices at the bottom; F8 the F7 of its own CLB and of the CLB above. (As ISE places lab11's
// MUXF6 / F7 / F8: research/s3e-place/wide-mux.mjs. MUXF5: LUT F is I1, selected by BX = 1.)
export const WIDE_MUX = {
  6: [{ at: [0, 0], a: [0, 0], b: [0, 1] }, { at: [1, 0], a: [1, 0], b: [1, 1] }],
  7: [{ at: [0, 1], a: [0, 0], b: [1, 0] }],
  8: [{ at: [1, 1], a: [0, 1], b: [0, 3] }],
};

// names: Yosys's names may hold ':', '\\', blanks or quotes, which XDL would need escaped inside cfg
// strings; they are replaced, so every name is a plain word
const clean = s => String(s).replace(/^\\/, '').replace(/[\s"\\:]/g, '_');
const escCfg = clean;

/** The top's ports as parseUcf takes them: a bus with the range of its bits (named name<i>). */
export function ucfPortsOf(nl) {
  return (nl.ports || []).map(p => {
    const idx = (p.bits || []).map(b => /<(-?\d+)>$/.exec(b.name)).filter(Boolean).map(m => +m[1]);
    return idx.length ? { name: p.name, msb: Math.max(...idx), lsb: Math.min(...idx) } : { name: p.name };
  });
}

// ------------------------------------------------------------------ criticality before placement
// The criticality (0..1) of every connection of the netlist, from its cells only, by the model of
// core/synth-open.js criticalDelay (the same critical path): the Spartan-3E -4's logic delays and a
// fixed delay for every connection between cells, but those inside a slice (the carry chain, a LUT
// into its carry stage, the levels of a wide multiplexer, a LUT into its flip-flop). crit = 1 -
// slack / (the critical path's delay), as the placer's (place.js analyzeTiming). Paths from
// flip-flop to flip-flop (block RAMs, multipliers, shift registers and distributed RAMs as their
// sources and ends too); a design without them: from its inputs to its outputs. cells / nets: the
// netlist's (core/fpga/netlist.js), with their index (idx), cells marked `lowered` left out.
// Returns { dmax, crit: Map `${cell}:${pin}` (an input pin) -> criticality }.
const CRIT_NET = 0.45;
// The packer (#528): a connection this critical (CRIT_PAIR) puts its two units in one slice, first
// among the slice's candidates (CRIT_BONUS * criticality, over 1 per net the slice shares with each);
// at most CRIT_SLICES more slices (and one) than packed without timing, or that packing is kept.
const CRIT_PAIR = 0.8, CRIT_BONUS = 8, CRIT_SLICES = 0.02;
export function connectionCriticality(cells, nets) {
  const isLutT = t => LUT_K[t] !== undefined || t === 'INV' || t === 'BUF';
  const registered = c => MULT_TYPE.test(c.type) && /1$/.test(String(c.params?.PREG ?? ''));
  const live = cells.filter(c => !c.lowered);
  const inputs = c => Object.entries(c.pins).filter(([p, n]) => c.dirs?.[p] !== 'output' && !(nets[n]?.driver?.cell === c.idx && nets[n].driver.pin === p));
  // (a connection always inside a slice: no routing delay)
  const inside = (c, p, d) => (c.type === 'MUXF5' && /^I[01]$/.test(p) && isLutT(d.type)) || (/^MUXF[678]$/.test(c.type) && /^I[01]$/.test(p) && /^MUXF/.test(d.type))
    || (/^(MUXCY|XORCY)$/.test(c.type) && p === 'CI' && d.type === 'MUXCY') || (c.type === 'MUXCY' && p === 'S' && isLutT(d.type))
    || (c.type === 'XORCY' && p === 'LI' && isLutT(d.type)) || (!!ffKind(c.type) && p === 'D' && (isLutT(d.type) || /^(MUXF5|MUXF6|XORCY)$/.test(d.type)));
  const netDelay = (c, p, n) => { const d = nets[n].driver && cells[nets[n].driver.cell]; return d && inside(c, p, d) ? 0 : CRIT_NET; };
  // the delay through a combinational cell from input pin p (null: no path)
  const through = (c, p) => {
    const t = c.type;
    if (isLutT(t)) return 0.70;
    if (t === 'MUXF5') return p === 'S' ? 0.74 : 0.32;
    if (/^MUXF[678]$/.test(t)) return p === 'S' ? 0.85 : 0.45;
    if (t === 'MUXCY') return p === 'CI' ? 0.12 : p === 'S' ? 0.25 : 0.95;
    if (t === 'XORCY') return p === 'CI' ? 0.46 : 0.15;
    if (MULT_TYPE.test(t)) return registered(c) ? null : /^[AB](<\d+>)?$/.test(p) ? 4.9 : null;
    if (/^RAM\d+X/.test(t)) return /^(A\d*|DPRA\d*)$/.test(p) ? 0.75 : null;
    return null;
  };
  // the setup of an end pin (null: not an end)
  let withIO = false;
  const setup = (c, p) => {
    const t = c.type;
    if (ffKind(t)) return p === 'D' ? 0.13 : p === 'CE' ? 0.55 : /^(R|S|CLR|PRE|G|GE)$/.test(p) ? 0.91 : null;
    if (/^SRL/.test(t)) return /^(D|CE)$/.test(p) ? 0.46 : null;
    if (/^RAMB16/.test(t)) return /^(CLK|SSR)/.test(p) ? null : 0.4;
    if (registered(c)) return /^[AB](<\d+>)?$/.test(p) ? 5.2 : null;
    if (/^RAM\d+X/.test(t)) return /^(D|WE|A\d*)$/.test(p) ? 0.46 : null;
    if (t === 'OBUF') return withIO ? 0 : null;
    return null;
  };
  const start = c => {
    const t = c.type;
    if (ffKind(t)) return 0.59;
    if (/^SRL/.test(t)) return 2.0;
    if (/^RAMB16/.test(t)) return 2.39;
    if (registered(c)) return 1.0;
    if (/^IBUF/.test(t)) return withIO ? 0 : -Infinity;
    if (t === 'BUFG' || t === 'DCM' || t === 'DCM_SP') return -Infinity;
    return null;
  };
  // arrival on a net (its driver's output); memoised, a loop counts as no path
  let arr, busy;
  const arrNet = n => {
    if (arr.has(n)) return arr.get(n);
    const dr = nets[n]?.driver;
    if (!dr) return -Infinity;
    const c = cells[dr.cell];
    let t = start(c);
    if (t === null) {
      if (busy.has(n)) return -Infinity;
      busy.add(n);
      t = -Infinity;
      for (const [p, m] of inputs(c)) { const d = through(c, p); if (d !== null) t = Math.max(t, arrNet(m) + netDelay(c, p, m) + d); }
      busy.delete(n);
    }
    arr.set(n, t);
    return t;
  };
  const worst = () => {
    arr = new Map(); busy = new Set();
    let w = 0;
    for (const c of live) for (const [p, n] of inputs(c)) { const s = setup(c, p); if (s !== null) w = Math.max(w, arrNet(n) + netDelay(c, p, n) + s); }
    return w;
  };
  let dmax = worst();
  if (!(dmax > 0)) { withIO = true; dmax = worst(); }
  const crit = new Map();
  if (!(dmax > 0)) return { dmax: 0, crit };
  // required time on a net: the earliest of its loads' (an end: dmax - setup; a combinational cell:
  // its output's less the delay through it)
  const req = new Map();
  const reqNet = n => {
    if (req.has(n)) return req.get(n);
    req.set(n, Infinity);   // (loops)
    let r = Infinity;
    for (const l of nets[n].loads) {
      const c = cells[l.cell];
      if (c.lowered) continue;
      r = Math.min(r, reqPin(c, l.pin) - netDelay(c, l.pin, n));
    }
    req.set(n, r);
    return r;
  };
  const reqPin = (c, p) => {
    const s = setup(c, p);
    if (s !== null) return dmax - s;
    const d = through(c, p);
    if (d === null || start(c) !== null) return Infinity;
    let r = Infinity;
    for (const [q, m] of Object.entries(c.pins)) if (c.dirs?.[q] === 'output' || nets[m]?.driver?.cell === c.idx && nets[m].driver.pin === q) r = Math.min(r, reqNet(m));
    return r - d;
  };
  for (const c of live) for (const [p, n] of inputs(c)) {
    const a = arrNet(n);
    if (!Number.isFinite(a)) continue;
    const slack = reqPin(c, p) - netDelay(c, p, n) - a;
    if (Number.isFinite(slack)) crit.set(`${c.idx}:${p}`, Math.max(0, Math.min(1, 1 - slack / dmax)));
  }
  return { dmax, crit };
}

/** Pack a netlist. ucf: UCF text or parseUcf() result (LOC, IOSTANDARD, DRIVE, SLEW, PULL).
 *  carryOut: how the carry out of a chain's last stage leaves the slice when logic reads it:
 *  'pin' (default, as ISE does: the XB / YB pin of the carry multiplexer; every XB / YB -> OMUX switch
 *  is in the bit database of the four devices, and CIN -> XB is 0.13 ns where an XOR stage's CIN -> Y
 *  takes 0.88, #591) or 'xor' (one more stage, XOR with a LUT giving 0, so it leaves through X / Y
 *  like a sum; what the open flows did before the XB / YB switches were measured).
 *  timing (true): the units of critical connections in one slice (#528), unless that costs more
 *  slices than CRIT_SLICES allows; false: by shared nets only. */
export function pack(nl, opts = {}) {
  const p = packWith(nl, opts, opts.timing !== false);
  if (opts.timing === false) return p;
  const plain = packWith(nl, opts, false);
  const kept = p.stats.slices <= plain.stats.slices + Math.max(1, Math.floor(CRIT_SLICES * plain.stats.slices)) ? p : plain;
  kept.stats.timing = kept === p;
  return kept;
}
function packWith(nl, { ucf = null, part = 'xc3s250ecp132-4', carryOut = 'pin', iobRegs = 'off' } = {}, timing = true) {
  const warnings = [];
  // (given the top's ports, a name such as x[1] is a bus bit only when x is a bus: #63, #84)
  const parsedUcf = typeof ucf === 'string' ? parseUcf(ucf, { ports: ucfPortsOf(nl) }) : ucf;
  const cons = typeof ucf === 'string' ? parsedUcf.assignments : ucf?.assignments || ucf || {};
  // INST "name" LOC = "DCM_X1Y0": the site of a DCM (#47; the placer chooses one otherwise)
  const instLocs = new Map();
  for (const st of parsedUcf?.other || []) {
    const m = /^INST\s+"?([^"\s]+)"?\s+LOC\s*=\s*"?([^"\s;]+)"?\s*$/i.exec(String(st).trim());
    if (m) instLocs.set(m[1], m[2].toUpperCase());
  }
  // own copies: the packer renames pins (INV -> LUT1, MUXF -> LUT3) and must not change its input
  const nets = nl.nets.map(n => ({ ...n, loads: n.loads.map(l => ({ ...l })) }));
  const cells = nl.cells.map((c, idx) => ({ ...c, pins: { ...c.pins }, idx }));
  const loadsOf = n => nets[n].loads;

  // An inverter whose loads are all clock pins of flip-flops and latches (C, G) is their slices' CLKINV, as XST
  // maps it: the synthesis's extractinv (-ise) writes IS_C_INVERTED / IS_G_INVERTED as one INV per cell, which as a
  // LUT puts logic on the clock (ISE's DRC: "Gated clock", one per inverter; vtr-ch-intrinsics' latches, #80). The
  // pins take the inverter's input with their inversion toggled, and the inverter is left out.
  // So do the clock enable and set / reset pins (#527): the slice's CEINV / SRINV, as XST maps an
  // active-low reset; extractinv writes one INV per flip-flop, which made a LUT of each. An inverter
  // that also drives logic keeps those loads.
  const ctrlPin = l => {
    const k = ffKind(cells[l.cell].type);
    return !!k && [k.latch ? 'G' : 'C', k.latch ? 'GE' : 'CE', k.sr].includes(l.pin);
  };
  for (const c of cells) {
    if (c.type !== 'INV') continue;
    const out = c.pins.O, src = c.pins.I;
    if (nets[out].port || nets[src].const !== undefined) continue;
    const moved = nets[out].loads.filter(ctrlPin);
    if (!moved.length) continue;
    for (const l of moved) {
      const f = cells[l.cell], inv = `IS_${l.pin}_INVERTED`;
      f.pins[l.pin] = src;
      f.params = { ...f.params, [inv]: paramInt(f.params?.[inv]) ^ 1 };
      nets[src].loads.push(l);
    }
    nets[out].loads = nets[out].loads.filter(l => !moved.includes(l));
    if (nets[out].loads.length) continue;
    nets[src].loads = nets[src].loads.filter(l => l.cell !== c.idx);
    nets[out].driver = null;
    c.lowered = true;
  }
  // INV / BUF are 1-input LUTs
  for (const c of cells) {
    if (c.lowered) continue;
    if (c.type === 'INV') { c.type = 'LUT1'; c.params = { INIT: '01' }; c.pins = { I0: c.pins.I, O: c.pins.O }; relabel(c, { I: 'I0' }); }
    else if (c.type === 'BUF') { c.type = 'LUT1'; c.params = { INIT: '10' }; c.pins = { I0: c.pins.I, O: c.pins.O }; relabel(c, { I: 'I0' }); }
  }
  let carryPass = 0;
  // A carry stage whose select is the constant 1 passes its carry in (O = CI) and no sum reads it:
  // it is left out, its loads read the carry in (#591: blinky's comparator ended in three such
  // stages, a constant's bits, each a stage of delay and the last one's carry out through the slow
  // XORG instead of an XORF)
  for (const c of cells) {
    if (c.lowered || c.type !== 'MUXCY' || nets[c.pins.S].const !== 1) continue;
    const ciNet = c.pins.CI, out = c.pins.O;
    if (nets[ciNet].const !== undefined || nets[out].port) continue;
    if (nets[ciNet].loads.some(l => cells[l.cell].type === 'XORCY' && l.pin === 'CI')) continue;
    for (const n of new Set([ciNet, c.pins.S, c.pins.DI])) nets[n].loads = nets[n].loads.filter(l => l.cell !== c.idx);
    for (const l of nets[out].loads) { cells[l.cell].pins[l.pin] = ciNet; nets[ciNet].loads.push(l); }
    nets[out].loads = [];
    nets[out].driver = null;
    c.lowered = true;
    carryPass++;
  }
  function relabel(c, map) {
    for (const n of Object.values(c.pins)) for (const l of nets[n].loads) if (l.cell === c.idx && map[l.pin]) l.pin = map[l.pin];
  }
  const ci = c => c.idx;
  const isLut = c => LUT_K[c.type] !== undefined;
  const driverCell = n => (nets[n].driver ? cells[nets[n].driver.cell] : null);
  // A RAM64X1S is two RAM32X1S (addresses 0-31 and 32-63, each written when WE and A5 select it)
  // and a 3-input LUT choosing the read word by A5, as ISE's map builds it on the Spartan-3E
  for (const c of cells.filter(x => x.type === 'RAM64X1S')) lowerRam64(c);
  function lowerRam64(c) {
    const addNet = name => { const k = nets.length; nets.push({ id: k, name: uniqueNetName(name), driver: null, port: null, loads: [] }); return k; };
    const addCell = (name, type, params, pins, outs) => {
      const cell = { name, type, params, attrs: {}, pins, dirs: {}, idx: cells.length };
      cells.push(cell);
      for (const [p, n] of Object.entries(pins)) {
        if (outs.includes(p)) { cell.dirs[p] = 'output'; nets[n].driver = { cell: cell.idx, pin: p }; } else { cell.dirs[p] = 'input'; nets[n].loads.push({ cell: cell.idx, pin: p }); }
      }
      return cell;
    };
    const p = c.pins;
    // the RAM64X1S's own pins leave its nets
    for (const n of new Set(Object.values(p))) nets[n].loads = nets[n].loads.filter(l => l.cell !== c.idx);
    const init = paramBits(c.params.INIT) || [];
    const half = h => init.slice(32 * h, 32 * h + 32).concat(new Array(32).fill(0)).slice(0, 32).reverse().join('');
    const weLo = addNet(`${c.name}_we0`), weHi = addNet(`${c.name}_we1`), oLo = addNet(`${c.name}_o0`), oHi = addNet(`${c.name}_o1`);
    // LUT INIT strings, most significant bit first (I0 = bit 0 of the index)
    addCell(`${c.name}_we0`, 'LUT2', { INIT: '0010' }, { I0: p.WE, I1: p.A5, O: weLo }, ['O']);
    addCell(`${c.name}_we1`, 'LUT2', { INIT: '1000' }, { I0: p.WE, I1: p.A5, O: weHi }, ['O']);
    for (const [h, we, o] of [[0, weLo, oLo], [1, weHi, oHi]]) {
      addCell(`${c.name}_${h ? 'hi' : 'lo'}`, 'RAM32X1S', { INIT: half(h), IS_WCLK_INVERTED: c.params.IS_WCLK_INVERTED ?? 0 },
        { A0: p.A0, A1: p.A1, A2: p.A2, A3: p.A3, A4: p.A4, D: p.D, WCLK: p.WCLK, WE: we, O: o }, ['O']);
    }
    nets[p.O].driver = null;
    addCell(`${c.name}_mux`, 'LUT3', { INIT: '11001010' }, { I0: oLo, I1: oHi, I2: p.A5, O: p.O }, ['O']);
    c.lowered = true;
  }
  function uniqueNetName(base) { let n = base, k = 1; const names = new Set(nets.map(x => x.name)); while (names.has(n)) n = `${base}_${k++}`; return n; }
  const liveCells = () => cells.filter(c => !c.lowered);
  const supported = c => isLut(c) || ffKind(c.type) || MUXF[c.type] || /^(MUXCY|XORCY|IBUF|IBUFG|OBUF|OBUFT|BUFG)$/.test(c.type) || SLICEM_MEM[c.type]
    || BRAM_TYPE.test(c.type) || MULT_TYPE.test(c.type) || DCM_TYPE.test(c.type);
  for (const c of liveCells()) {
    if (c.type === 'BUFGMUX') throw new PackError(`pack: BUFGMUX ${c.name}: the Silinx toolchain cannot switch clocks with a BUFGMUX yet (its I1 / S inputs are measured on one of the 8 buffers only)`);
  }
  const unsupported = liveCells().filter(c => !supported(c));
  if (unsupported.length) throw new PackError(`pack: cells not supported yet: ${[...new Set(unsupported.map(c => c.type))].join(', ')}`);

  // ---------------------------------------------------------------- the placed elements
  // Every netlist cell lands in one place. Its input pins are either internal to the site
  // (sink[cell][pin] = 'int') or a site pin { inst, pin, kind }; its output gets site pins when
  // something outside needs it (src[cell] = { gen: { inst, pin }, f5: …, fx: …, cy: … }).
  const insts = [];
  const sink = new Map();          // `${cell}:${pin}` -> 'int' | { inst, pin, kind }
  const extra = [];                // inputs of LUTs added by the packer (copies, route-throughs): { net, inst, pin }
  const where = new Map();         // cell -> { inst, bel }
  const tapOf = new Map();         // MUXCY cell -> { inst, bel } of the XOR that brings its carry out (carryOut 'xor')
  const setSink = (c, pin, v) => sink.set(`${c}:${pin}`, v);
  const stats = { copies: 0, passthru: 0 };
  let ucount = 0;
  const unique = names => base => { let n = clean(base); if (names.has(n)) { let k = 1; while (names.has(`${n}_${k}`)) k++; n = `${n}_${k}`; } names.add(n); return n; };
  const uniqueName = unique(new Set());       // instances
  const uniqueNet = unique(new Set());        // nets

  // A slice under construction.
  const newSlice = () => {
    const s = { kind: 'slice', type: 'SLICEL', lut: { F: null, G: null }, ff: { X: null, Y: null }, f5: null, fi: null,
      carry: null, out: { X: null, Y: null }, b: { X: null, Y: null }, ctrl: null, idx: insts.length };
    insts.push(s);
    return s;
  };
  // a LUT for a slot: { name, k, init (msb first), inputs: [net], pins: [site pin of each input], cell (index or -1), out: net }
  const lutOf = c => ({ name: c.name, k: LUT_K[c.type], init: lutInit(c), inputs: Array.from({ length: LUT_K[c.type] }, (_, j) => c.pins[`I${j}`]), pins: [1, 2, 3, 4].slice(0, LUT_K[c.type]), cell: ci(c), out: c.pins.O });
  function lutInit(c) {
    const k = LUT_K[c.type], bits = paramBits(c.params.INIT) || [];
    let s = '';
    for (let i = (1 << k) - 1; i >= 0; i--) s += bits[i] ? '1' : '0';
    return s;
  }
  // a LUT that passes its input through (route-through), or a constant
  const passLut = (net, name) => {
    stats.passthru++;
    if (nets[net].const !== undefined) return { name, k: 0, init: String(nets[net].const), inputs: [], pins: [], cell: -1, out: null };
    return { name, k: 1, init: '10', inputs: [net], pins: [1], cell: -1, out: null };
  };
  // the netlist loads of a net that are not the given (cell, pin) pairs
  const otherLoads = (net, except) => loadsOf(net).filter(l => !except.some(([c, p]) => l.cell === c && l.pin === p));

  // Put a LUT for `net` into slot side of slice s, for internal use by (cell, pin) pairs `users`.
  // The driving LUT cell moves in when nothing else needs it (or `outFree`: its output can leave
  // through X / Y); otherwise a copy goes in; a net not driven by a LUT gets a route-through.
  function lutFor(s, side, net, users, outFree) {
    const d = driverCell(net);
    let lut;
    if (d && isLut(d) && !where.has(ci(d)) && (outFree || !otherLoads(net, users).length)) {
      lut = lutOf(d);
      placeLut(s, side, lut, ci(d));
    } else if (d && isLut(d)) {
      lut = { ...lutOf(d), name: `${d.name}_copy${++ucount}`, cell: -1 };
      stats.copies++;
      placeLut(s, side, lut, -1);
    } else {
      lut = passLut(net, `${nets[net].name}_thru${++ucount}`);
      placeLut(s, side, lut, -1);
    }
    for (const [c, p] of users) setSink(c, p, 'int');
    return lut;
  }
  function placeLut(s, side, lut, cell) {
    if (s.lut[side]) throw new PackError(`pack: LUT ${side} of a slice used twice`);
    s.lut[side] = lut;
    if (cell >= 0) where.set(cell, { inst: s.idx, bel: side });
  }

  // ---------------------------------------------------------------- control sets of flip-flops
  function ffInfo(c) {
    const k = ffKind(c.type);
    const p = c.params || {};
    const inv = n => paramInt(p[n]) === 1;
    const clkPin = k.latch ? 'G' : 'C', cePin = k.latch ? 'GE' : 'CE';
    const ce = c.pins[cePin], sr = k.sr ? c.pins[k.sr] : undefined;
    const ceNet = ce === undefined || (nets[ce].const === 1 && !inv(`IS_${cePin}_INVERTED`)) ? null : ce;
    const srNet = sr === undefined || (nets[sr].const === 0 && !inv(`IS_${k.sr}_INVERTED`)) ? null : sr;
    const initBits = paramBits(p.INIT);
    const init = initBits ? initBits[0] : (k.high ? 1 : 0);
    // a latch's gate is its clock pin. A flip-flop captures on the rising edge after CLKINV; the
    // slice latch is transparent while CLKINV's output is LOW (netgen models CLKINV::CLK on a
    // #LATCH with an inverter: measured with designs/latches.v), so a latch with an active-high
    // gate takes CLKINV::CLK_B, as ISE writes it
    const clkInv = (k.neg ? 1 : 0) ^ (inv(`IS_${clkPin}_INVERTED`) ? 1 : 0) ^ (k.latch ? 1 : 0);
    return {
      cell: ci(c), name: c.name, kind: k, d: c.pins.D, q: c.pins.Q, init, clkPin, cePin, srPin: k.sr,
      ctrl: { clk: c.pins[clkPin], clkInv, ce: ceNet, ceInv: ceNet !== null && inv(`IS_${cePin}_INVERTED`) ? 1 : 0, sr: srNet,
        srInv: srNet !== null && inv(`IS_${k.sr}_INVERTED`) ? 1 : 0, sync: srNet !== null ? !!k.sync : null, latch: !!k.latch },
    };
  }
  const ctrlKey = t => `${t.clk}|${t.clkInv}|${t.ce}|${t.ceInv}|${t.sr}|${t.srInv}|${t.sync}|${t.latch}`;
  const ctrlOk = (s, f) => !s.ctrl || ctrlKey(s.ctrl) === ctrlKey(f.ctrl);
  // Put flip-flop f on side X / Y of slice s; its D comes from the side's output multiplexer
  // (dsrc: 'mux', D is internal) or from BX / BY ('bypass').
  function placeFf(s, side, f, dsrc) {
    if (s.ff[side]) throw new PackError('pack: flip-flop slot used twice');
    s.ff[side] = { ...f, dsrc };
    s.ctrl = f.ctrl;
    where.set(f.cell, { inst: s.idx, bel: `FF${side}` });
    const t = f.ctrl;
    setSink(f.cell, f.clkPin, { inst: s.idx, pin: 'CLK', kind: 'gen' });
    if (t.ce !== null) setSink(f.cell, f.cePin, { inst: s.idx, pin: 'CE', kind: 'gen' }); else if (f.cePin in cells[f.cell].pins) setSink(f.cell, f.cePin, 'int');
    if (f.srPin) setSink(f.cell, f.srPin, t.sr !== null ? { inst: s.idx, pin: 'SR', kind: 'gen' } : 'int');
    if (dsrc === 'mux') setSink(f.cell, 'D', 'int');
    else { setBypass(s, side, f.d); setSink(f.cell, 'D', { inst: s.idx, pin: side === 'X' ? 'BX' : 'BY', kind: 'gen' }); }
  }
  function setBypass(s, side, net) {
    if (s.b[side] !== null && s.b[side] !== net) throw new PackError(`pack: B${side} of a slice used twice`);
    s.b[side] = net;
  }
  const ffs = new Map();   // cell index -> ffInfo, for the flip-flops not placed yet
  for (const c of cells) if (ffKind(c.type)) ffs.set(ci(c), ffInfo(c));

  // ---------------------------------------------------------------- registers in the IOBs (#96)
  // A flip-flop goes into the IOB of its pad when asked: the UCF's IOB = TRUE on its instance or on
  // the port's net (IOB = FALSE keeps it out), the HDL's IOB attribute, or iobRegs (map's -pr: 'i'
  // the input registers, 'o' the output and output-enable ones, 'b' both; 'off', the default, as
  // ISE's flow runs map, -pr off). An input register: a flip-flop whose D is the pad's input (the
  // input may drive other logic too); an output register: one whose Q drives only the output buffer;
  // an output-enable register: one whose Q drives only a tristate buffer's T, with the output
  // register's clock and set / reset when the IOB has both (the IOB's OTCLK1 and SR are shared).
  const iobAsked = [];   // [NET / INST, name pattern (UCF's * and ?), true / false]: the last that matches
  for (const st of parsedUcf?.other || []) {
    const m = /^(NET|INST)\s+"?([^"\s]+)"?\s+IOB\s*=\s*"?(TRUE|FALSE|FORCE)"?\s*$/i.exec(String(st).trim());
    if (m) iobAsked.push([m[1].toUpperCase(), new RegExp(`^${m[2].replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`), !/^FALSE$/i.test(m[3])]);
  }
  const asked = (kind, name) => { let v; for (const [k, re, x] of iobAsked) if (k === kind && name !== null && re.test(name)) v = x; return v; };
  const portName = n => { for (const p of nl.ports) for (const b of p.bits) if (b.net === n) return b.name; return null; };
  // (an IOB register's clock comes from a global buffer, as ISE clocks the IOBs: the router reaches an I/O
  // tile's clock pin from the global lines only, #671)
  const onGlobal = n => driverCell(n)?.type === 'BUFG';
  const wantsIob = (f, port, role) => {
    const want = (() => {
      const a = asked('INST', f.name) ?? asked('NET', port);
      if (a !== undefined) return a;
      const h = cells[f.cell].attrs?.IOB ?? cells[f.cell].attrs?.iob;
      if (h !== undefined) return /^(TRUE|FORCE|1)$/i.test(String(h).replace(/"/g, ''));
      return iobRegs === 'b' || iobRegs === (role === 'I' ? 'i' : 'o');
    })();
    if (want && !onGlobal(f.ctrl.clk)) { warnings.push(`flip-flop ${f.name} kept out of the IOB of ${port}: its clock ${nets[f.ctrl.clk].name} is not on a global clock buffer`); return false; }
    return want;
  };
  const iobFf = new Map();   // pad buffer cell -> { I | O | T: ffInfo }
  const soleFf = n => { const d = driverCell(n); const f = d && ffs.get(ci(d)); return f && f.q === n && loadsOf(n).length === 1 ? f : null; };
  const sameOt = (a, b) => !a || !b || (a.ctrl.clk === b.ctrl.clk && a.ctrl.clkInv === b.ctrl.clkInv && a.ctrl.sr === b.ctrl.sr && a.ctrl.srInv === b.ctrl.srInv && a.ctrl.sync === b.ctrl.sync);
  for (const c of cells) {
    if (c.lowered) continue;
    const r = {};
    if (c.type === 'IBUF') {
      const port = portName(c.pins.I);
      const f = loadsOf(c.pins.O).filter(l => l.pin === 'D' && ffs.has(l.cell)).map(l => ffs.get(l.cell)).find(x => !x.kind.latch && wantsIob(x, port, 'I'));
      if (f) r.I = f;
    } else if (c.type === 'OBUF' || c.type === 'OBUFT') {
      const port = portName(c.pins.O);
      const o = soleFf(c.pins.I), t = c.type === 'OBUFT' ? soleFf(c.pins.T) : null;
      if (o && !o.kind.latch && wantsIob(o, port, 'O')) r.O = o;
      if (t && !t.kind.latch && wantsIob(t, port, 'T') && sameOt(r.O, t)) r.T = t;
    }
    if (!Object.keys(r).length) continue;
    iobFf.set(ci(c), r);
    for (const f of Object.values(r)) ffs.delete(f.cell);
  }
  // the flip-flops whose D is net n
  const ffsOn = n => loadsOf(n).filter(l => l.pin === 'D' && ffs.has(l.cell) && !where.has(l.cell)).map(l => ffs.get(l.cell));
  // try to put a flip-flop fed by the output multiplexer of side `side` into that side's slot
  function absorbFf(s, side, net) {
    if (s.ff[side]) return;
    const f = ffsOn(net).find(x => ctrlOk(s, x));
    if (f) placeFf(s, side, f, 'mux');
  }

  // ---------------------------------------------------------------- carry chains
  const macros = [];
  const muxcy = liveCells().filter(c => c.type === 'MUXCY');
  const xorcy = cells.filter(c => c.type === 'XORCY');
  const muxcyOn = new Map();   // CI net -> MUXCY cells reading it
  for (const m of muxcy) { const n = m.pins.CI; if (!muxcyOn.has(n)) muxcyOn.set(n, []); muxcyOn.get(n).push(m); }
  const xorOn = new Map();     // CI net -> XORCY
  for (const x of xorcy) { const n = x.pins.CI; if (!xorOn.has(n)) xorOn.set(n, []); xorOn.get(n).push(x); }
  const nextOf = new Map();    // MUXCY -> the MUXCY that continues its chain
  for (const m of muxcy) {
    const d = driverCell(m.pins.CI);
    if (d && d.type === 'MUXCY' && !nextOf.has(d)) nextOf.set(d, m);
  }
  const isNext = new Set(nextOf.values());
  const usedXor = new Set();
  const takeXor = (ciNet, sNet) => {
    const x = (xorOn.get(ciNet) || []).find(c => !usedXor.has(c) && (sNet === undefined || c.pins.LI === sNet));
    if (x) usedXor.add(x);
    return x || null;
  };
  const chains = [];
  for (const m of muxcy) {
    if (isNext.has(m)) continue;
    const stages = [];
    for (let c = m; c; c = nextOf.get(c)) stages.push({ mux: c, ci: c.pins.CI, s: c.pins.S, di: c.pins.DI, xor: takeXor(c.pins.CI, c.pins.S) });
    const last = stages.at(-1).mux;
    const x = takeXor(last.pins.O);
    if (x) stages.push({ mux: null, ci: last.pins.O, s: x.pins.LI, di: null, xor: x });
    else if (carryOut === 'xor' && loadsOf(last.pins.O).length) stages.push({ tap: last, ci: last.pins.O });
    chains.push(stages);
  }
  for (const x of xorcy) if (!usedXor.has(x)) { usedXor.add(x); chains.push([{ mux: null, ci: x.pins.CI, s: x.pins.LI, di: null, xor: x }]); }
  stats.carry = chains.length;

  // Does the first stage need BX for its DI (then BX cannot also bring the carry in)? DI can come
  // from pin 1 of the stage's LUT when the LUT reads it already or has a free input.
  const lutInputs = n => {
    const d = driverCell(n);
    if (d && isLut(d)) return Array.from({ length: LUT_K[d.type] }, (_, j) => d.pins[`I${j}`]);
    return nets[n].const !== undefined ? [] : [n];
  };
  const diNeedsB = st => st.mux && nets[st.di].const === undefined && !lutInputs(st.s).includes(st.di) && lutInputs(st.s).length >= 4;
  for (const stages of chains) if (diNeedsB(stages[0]) && stages[0].ci !== stages[0].di) {
    // a first stage of its own on the F side brings the carry in: LUT F = 0 so CYMUXF passes CY0F,
    // the constant or the carry-in net on F1 (the real first stage then takes the G side)
    stages.unshift({ dummy: true, ci: stages[0].ci });
  }

  for (const stages of chains) {
    const members = [];
    let s = null;
    stages.forEach((st, i) => {
      const side = i % 2 ? 'G' : 'F', X = side === 'F' ? 'X' : 'Y';
      if (side === 'F') { s = newSlice(); s.carry = { F: null, G: null, init: null, cout: false }; members.push({ inst: s.idx, dx: 0, dy: members.length }); }
      if (st.dummy) {
        const k = nets[st.ci].const;
        const name = `${stages[1].mux.name}_cin`;
        placeLut(s, 'F', k !== undefined ? { name, k: 0, init: '0', inputs: [], pins: [], cell: -1, out: null } : { name, k: 1, init: '00', inputs: [st.ci], pins: [1], cell: -1, out: null }, -1);
        stats.passthru++;
        s.carry.F = { mux: { name: `${name}_cy` }, xor: null, cy0: k !== undefined ? String(k) : 'F1' };
        return;
      }
      if (st.tap) {
        // the carry out read by logic: CI XOR 0 (a LUT giving 0) is the carry, out through X / Y
        const name = `${st.tap.name}_out`;
        placeLut(s, side, { name, k: 0, init: '0', inputs: [], pins: [], cell: -1, out: null }, -1);
        stats.passthru++;
        s.carry[side] = { mux: null, xor: { name: `${name}_xor` }, cy0: null };
        if (side === 'F') { s.carry.init = 'CIN'; insts[s.idx - 1].carry.cout = true; }
        tapOf.set(ci(st.tap), { inst: s.idx, bel: `XOR${side}` });
        return;
      }
      const users = [];
      if (st.mux) users.push([ci(st.mux), 'S']);
      if (st.xor) users.push([ci(st.xor), 'LI']);
      const sumUsed = st.xor && loadsOf(st.xor.pins.O).length > 0;
      const lut = lutFor(s, side, st.s, users, !sumUsed);
      const c = { mux: st.mux, xor: st.xor, cy0: null };
      s.carry[side] = c;
      if (st.mux) where.set(ci(st.mux), { inst: s.idx, bel: `CYMUX${side}` });
      if (st.xor) where.set(ci(st.xor), { inst: s.idx, bel: `XOR${side}` });
      // carry in: from the chain (internal / CIN), or at the start of the chain through BX
      const ciUsers = [st.mux && [ci(st.mux), 'CI'], st.xor && [ci(st.xor), 'CI']].filter(Boolean);
      if (i === 0) {
        s.carry.init = 'BX';
        setBypass(s, 'X', st.ci);
        for (const [cc, p] of ciUsers) setSink(cc, p, { inst: s.idx, pin: 'BX', kind: 'gen' });
      } else {
        if (side === 'F') { s.carry.init = 'CIN'; insts[s.idx - 1].carry.cout = true; }
        for (const [cc, p] of ciUsers) setSink(cc, p, 'int');
      }
      // DI: a constant, a LUT input on pin 1 / 2, or BX / BY
      if (st.mux) {
        const di = st.di, pin1 = side === 'F' ? 'F1' : 'G1';
        if (nets[di].const !== undefined) c.cy0 = String(nets[di].const);
        else {
          let j = lut.inputs.indexOf(di);
          if (j < 0 && lut.k < 4) {
            // add DI as an input the LUT's function does not depend on
            lut.init = lut.init + lut.init; lut.inputs.push(di); lut.pins.push(lut.k + 1); lut.k++; j = lut.k - 1;
          }
          if (j >= 0) {
            // move that input to pin 1 (swap pins with whatever input is there)
            const o = lut.pins.indexOf(1);
            if (o >= 0) [lut.pins[o], lut.pins[j]] = [lut.pins[j], lut.pins[o]]; else lut.pins[j] = 1;
            c.cy0 = pin1;
            setSink(ci(st.mux), 'DI', 'int');
          } else {
            c.cy0 = side === 'F' ? 'BX' : 'BY';
            setBypass(s, X, di);
            setSink(ci(st.mux), 'DI', { inst: s.idx, pin: `B${X}`, kind: 'gen' });
          }
        }
        if (c.cy0 === '0' || c.cy0 === '1') setSink(ci(st.mux), 'DI', 'int');
      }
      // the sum leaves through X / Y (FXMUX = FXOR) and may feed the flip-flop of its side
      if (sumUsed) { s.out[X] = side === 'F' ? 'FXOR' : 'GXOR'; absorbFf(s, X, st.xor.pins.O); }
      else if (lut.cell >= 0 && otherLoads(lut.out, users).length) s.out[X] = side;   // the LUT's own output
    });
    macros.push({ kind: 'carry', members });
  }

  // ---------------------------------------------------------------- wide multiplexers
  // A multiplexer tree uses the dedicated F5 / FX connections only when each input of an F6 / F7 / F8
  // is the output of the level below and nothing else claims it; any other multiplexer becomes a
  // 3-input LUT (O = S ? I1 : I0).
  const muxes = cells.filter(c => MUXF[c.type]);
  stats.muxes = muxes.length;
  const claimed = new Set();
  const childOk = (m, pin) => {
    const d = driverCell(m.pins[pin]);
    return d && MUXF[d.type] === MUXF[m.type] - 1 && !claimed.has(d) && !d.lut3;
  };
  const tree = m => {   // claim the whole tree under m (or fail without claiming)
    const lvl = MUXF[m.type];
    if (lvl === 5) return [m];
    if (!childOk(m, 'I0') || !childOk(m, 'I1')) return null;
    const a = tree(driverCell(m.pins.I1)), b = a && tree(driverCell(m.pins.I0));
    return a && b ? [m, ...a, ...b] : null;
  };
  const roots = [];
  for (const lvl of [8, 7, 6, 5]) for (const m of muxes.filter(x => MUXF[x.type] === lvl && !claimed.has(x))) {
    const t = tree(m);
    if (!t) { m.lut3 = true; continue; }
    // a level-5 tree whose parent became a LUT is a root of its own
    for (const x of t) claimed.add(x);
    roots.push(m);
  }
  // multiplexers that became LUT3: inputs (I0, I1, S) -> LUT3 INIT for O = S ? I1 : I0 (I0 = bit 0)
  for (const m of muxes) if (m.lut3) {
    stats.muxLuts = (stats.muxLuts || 0) + 1;
    m.type = 'LUT3'; m.params = { INIT: '11001010' };
    m.pins = { I0: m.pins.I0, I1: m.pins.I1, I2: m.pins.S, O: m.pins.O };
    relabel(m, { S: 'I2' });
  }

  // place a tree: the F5 of `leaf` slices, the FiMUX at their fixed spots inside the CLB(s)
  for (const root of roots) {
    const lvl = MUXF[root.type];
    // slices of the macro by position: lvl 5 -> 1 slice, 6 -> 2, 7 -> 4 (a CLB), 8 -> 8 (two CLBs)
    const members = [];
    const at = new Map();
    const sliceAt = (dx, dy) => {
      const k = `${dx},${dy}`;
      if (!at.has(k)) { const s = newSlice(); at.set(k, s); members.push({ inst: s.idx, dx, dy }); }
      return at.get(k);
    };
    // where each multiplexer of the tree goes: (mux, dx, dy)
    const put = (m, dx, dy) => {
      const l = MUXF[m.type];
      const s = sliceAt(dx, dy);
      if (l === 5) { placeF5(s, m); return; }
      s.fi = m;
      where.set(ci(m), { inst: s.idx, bel: 'F6MUX' });
      setBypass(s, 'Y', m.pins.S);
      setSink(ci(m), 'S', { inst: s.idx, pin: 'BY', kind: 'gen' });
      const spec = WIDE_MUX[l].find(w => w.at[0] === ((dx % 2) + 2) % 2 && w.at[1] === ((dy % 2) + 2) % 2);
      const base = [dx - spec.at[0], dy - spec.at[1]];
      const ca = driverCell(m.pins.I1), cb = driverCell(m.pins.I0);
      const pa = [base[0] + spec.a[0], base[1] + spec.a[1]], pb = [base[0] + spec.b[0], base[1] + spec.b[1]];
      const kind = l === 6 ? 'f5' : 'fx';
      setSink(ci(m), 'I1', { inst: s.idx, pin: 'FXINA', kind });
      setSink(ci(m), 'I0', { inst: s.idx, pin: 'FXINB', kind });
      put(ca, pa[0], pa[1]);
      put(cb, pb[0], pb[1]);
    };
    // the root's own position: F6 at S0, F7 at S1, F8 at S3 (of the upper CLB: its F7 below)
    const r0 = lvl === 5 ? [0, 0] : WIDE_MUX[lvl][0].at;
    put(root, r0[0], r0[1]);
    // normalise the offsets (the lowest slice at dy = 0) and record the macro
    const minDy = Math.min(...members.map(x => x.dy));
    for (const x of members) x.dy -= minDy;
    // F6 pairs start on an even slice row, F7 / F8 on a CLB (even column and row)
    macros.push({ kind: lvl === 5 ? 'F5' : `F${lvl}`, members, align: lvl === 5 ? [1, 1] : lvl === 6 ? [1, 2] : [2, 2] });
    // the FiMUX output feeds GYMUX (Y) / the flip-flop on the Y side
    for (const [, s] of at) if (s.fi) {
      const o = s.fi.pins.O;
      const parent = loadsOf(o).filter(l => MUXF[cells[l.cell].type] && claimed.has(cells[l.cell]) && where.get(l.cell)?.bel === 'F6MUX');
      if (otherLoads(o, parent.map(l => [l.cell, l.pin])).length) s.out.Y = 'FX';
      if (!s.out.Y || s.out.Y === 'FX') { absorbFf(s, 'Y', o); if (s.ff.Y) s.out.Y = s.out.Y || 'FX'; }
    }
  }
  // a single-slice multiplexer of two LUTs: F = I1, G = I0, BX selects (BX = 1 -> F)
  function placeF5(s, m) {
    s.f5 = m;
    where.set(ci(m), { inst: s.idx, bel: 'F5MUX' });
    setBypass(s, 'X', m.pins.S);
    setSink(ci(m), 'S', { inst: s.idx, pin: 'BX', kind: 'gen' });
    lutFor(s, 'F', m.pins.I1, [[ci(m), 'I1']], false);
    lutFor(s, 'G', m.pins.I0, [[ci(m), 'I0']], !s.fi);
    if (s.lut.G.cell >= 0 && otherLoads(s.lut.G.out, [[ci(m), 'I0']]).length) s.out.Y = 'G';
    const o = m.pins.O;
    const parent = loadsOf(o).filter(l => MUXF[cells[l.cell].type] && claimed.has(cells[l.cell]));
    if (otherLoads(o, parent.map(l => [l.cell, l.pin])).length) s.out.X = 'F5';
    if (!s.out.X || s.out.X === 'F5') { absorbFf(s, 'X', o); if (s.ff.X) s.out.X = 'F5'; }
  }
  // ---------------------------------------------------------------- distributed RAMs and shift registers
  // In a SLICEM (as ISE's map packs them, research/s3e-bitstream stage D): the LUT is a #RAM, its
  // address on the LUT's pins 1-4 (A0-A3); the write clock on CLK (CLKINV), the write enable (RAM)
  // or shift enable (shift register) on SR through the write strobe generator WSGEN; the data in
  // through BX (DIF_MUX = BX: LUT F) or BY (DIG_MUX = BY: LUT G; DIF_MUX = ALTDIF: F takes BY's).
  //   RAM16X1S   F or G (two in a slice share the address, WE and clock)
  //   RAM16X1D   G = the write port and SPO (A), F = DPO (DPRA), F_ATTR / G_ATTR = DUAL_PORT
  //   RAM32X1S   G = addresses 0-15, F = 16-31, A4 on BX (F5 multiplexer and SLICEWE0), O = F5
  //   SRL16(E)   F or G, F_ATTR / G_ATTR = SHIFT_REG; two in a slice share the clock and CE; the
  //              flip-flop of a side may take the shift register's output (DXMUX = 1) when the
  //              shift is always enabled (SR = 1) and the flip-flop has no CE, no set / reset;
  //              a cascade (#24): G's last stage into F's data through SHIFTIN (DIF_MUX = SHIFTIN); a chain
  //              of SRLC16E through Q15 (#2) on the two SLICEMs of a CLB
  const memCells = liveCells().filter(c => SLICEM_MEM[c.type]);
  const memInit = (c, n) => { const b = paramBits(c.params.INIT) || []; let v = 0; for (let a = 0; a < n; a++) if (b[a]) v += 2 ** a; return v; };
  const memClk = c => {
    const kind = SLICEM_MEM[c.type];
    const pin = kind === 'srl' ? 'CLK' : 'WCLK';
    const inv = (/_1$/.test(c.type) ? 1 : 0) ^ paramInt(c.params[`IS_${pin}_INVERTED`]);
    return { pin, net: c.pins[pin], inv };
  };
  // the enable on SR: a RAM's WE, a shift register's CE (none: SR = 1)
  const memEn = c => (SLICEM_MEM[c.type] === 'srl' ? (c.pins.CE === undefined ? 1 : c.pins.CE) : c.pins.WE);
  const memKey = c => { const k = memClk(c); return `${SLICEM_MEM[c.type] === 'srl' ? 'srl' : 'ram'}|${k.net}|${k.inv}|${memEn(c)}`; };
  const addrNets = c => [0, 1, 2, 3].map(j => c.pins[`A${j}`]);
  function memSlice(c) {
    const s = newSlice();
    s.type = 'SLICEM';
    s.slicem = true;
    const k = memClk(c);
    s.mctrl = { clk: k.net, clkInv: k.inv, en: memEn(c), srl: SLICEM_MEM[c.type] === 'srl' };
    return s;
  }
  // the clock and the enable of a memory cell of slice s
  function memCtrl(s, c) {
    setSink(ci(c), memClk(c).pin, { inst: s.idx, pin: 'CLK', kind: 'gen' });
    const en = SLICEM_MEM[c.type] === 'srl' ? 'CE' : 'WE';
    if (c.pins[en] !== undefined) setSink(ci(c), en, { inst: s.idx, pin: 'SR', kind: 'gen' });
    else extra.push({ net: 1, inst: s.idx, pin: 'SR', kind: 'gen' });
  }
  // a memory LUT on side `side`: address pins, data in, contents
  function memLut(s, side, c, { addr = addrNets(c), addrPins = ['A0', 'A1', 'A2', 'A3'], init, mode, out }) {
    const two = SLICEM_MEM[c.type] === 'ramd' || SLICEM_MEM[c.type] === 'ram32';
    const lut = { name: two ? `${c.name}.SLICEM_${side}` : c.name, k: 4, init: null, inputs: addr, pins: [1, 2, 3, 4], cell: -1, out, mem: { init, mode } };
    placeLut(s, side, lut, -1);
    memCtrl(s, c);
    // (an address pin already on the other LUT's pins: the LUT inputs below connect this one too)
    addrPins.forEach((p, j) => { if (c.pins[p] !== undefined && !sink.has(`${ci(c)}:${p}`)) setSink(ci(c), p, { inst: s.idx, pin: `${side}${j + 1}`, kind: 'gen' }); });
    // the address pins of the LUT the cell does not give (an SRL16 always has 4): constant 0
    lut.inputs = lut.inputs.map(n => (n === undefined ? 0 : n));
    return lut;
  }
  const memData = (s, side, c, pin = 'D') => {
    const X = side === 'F' ? 'X' : 'Y';
    setBypass(s, X, c.pins[pin]);
    setSink(ci(c), pin, { inst: s.idx, pin: `B${X}`, kind: 'gen' });
    s.dmux = s.dmux || {};
    s.dmux[side] = side === 'F' ? 'BX' : 'BY';
  };
  // a shift register longer than 16 stages (core/synth-open.js SRL_MAP: an SRL16E of 16 stages, read at address 15,
  // into the rest) is cascaded in one SLICEM, as ISE's map does: G the first 16 stages, F the next, F's data G's last
  // stage through SHIFTIN (DIF_MUX), inside the slice instead of through general routing (#24). (A longer chain goes
  // on through general routing.)
  const cascadeOf = c => (SLICEM_MEM[c.type] === 'srl' && addrNets(c).every(n => nets[n]?.const === 1)
    ? memCells.find(x => x !== c && SLICEM_MEM[x.type] === 'srl' && x.pins.D === c.pins.Q && memKey(x) === memKey(c)) || null : null);
  // a RAM16X1S / shift register on side `side` of slice s, its data in through BX / BY, or (shiftIn) the stage before
  // it through SHIFTIN: F's G's last stage (DIF_MUX), G's the last stage of the slice above (DIG_MUX)
  const putMem = (s, side, cc, shiftIn = false) => {
    const kind = SLICEM_MEM[cc.type];
    memLut(s, side, cc, { init: memInit(cc, 16), mode: kind === 'srl' ? 'SHIFT_REG' : null, out: cc.pins[kind === 'srl' ? 'Q' : 'O'] });
    if (shiftIn) { setSink(ci(cc), 'D', 'int'); s.dmux = s.dmux || {}; s.dmux[side] = 'SHIFTIN'; }
    else memData(s, side, cc);
    if (kind !== 'srl') s[side === 'F' ? 'wf' : 'wg'] = true;
    where.set(ci(cc), { inst: s.idx, bel: side });
    // the shift register's output into the flip-flop of its side (always shifting: SR = 1)
    if (kind === 'srl' && s.mctrl.en === 1) {
      const X = side === 'F' ? 'X' : 'Y';
      const f = ffsOn(cc.pins.Q).find(x => x.ctrl.ce === null && x.ctrl.sr === null && !x.ctrl.latch && x.ctrl.clk === s.mctrl.clk && x.ctrl.clkInv === s.mctrl.clkInv);
      if (f && !s.ff[X]) { placeFf(s, X, f, 'mux'); s.out[X] = side; }
    }
  };
  // SRLC16E chains through Q15 (#2): each one's Q15 the D of the next (its only load; the same clock and enable), as
  // ISE's map packs them: up to four on the two SLICEMs of a CLB, G then F of the upper one (F's data G's Q15 through
  // SHIFTIN), its SHIFTOUT (F's Q15) into the lower one's SHIFTIN (DIG_MUX = SHIFTIN; the CLB's switch SHIFTOUT2 ->
  // SHIFTIN0), G then F of the lower one; measured with ISE (research/s3e-bitstream gen-cascade.mjs): no bits. (The
  // lower one's SHIFTOUT leaves the CLB only through XB, not measured: a longer chain, or Q15 into anything else, is
  // refused.)
  const q15Next = c => {
    const n = /^SRLC16E?(_1)?$/.test(c.type) ? c.pins.Q15 : undefined;
    const loads = n === undefined ? [] : nets[n]?.loads || [];
    if (!loads.length) return null;
    const x = loads.length === 1 && loads[0].pin === 'D' ? cells[loads[0].cell] : null;
    if (!x || !memCells.includes(x) || SLICEM_MEM[x.type] !== 'srl' || memKey(x) !== memKey(c)) {
      throw new PackError(`pack: ${c.type} ${c.name}: the cascade output Q15 into anything but the D of one shift register of the same clock and enable is not supported yet`);
    }
    return x;
  };
  const q15Prev = new Set(memCells.map(q15Next).filter(Boolean));
  const memUsed = new Set();
  for (const c of memCells) {
    if (q15Prev.has(c) || !q15Next(c)) continue;
    const chain = [c];
    for (let x = q15Next(c); x; x = q15Next(x)) chain.push(x);
    if (chain.length > 4) throw new PackError(`pack: ${c.type} ${c.name}: a chain of ${chain.length} shift registers through Q15 is not supported yet (at most 4, on the two SLICEMs of a CLB)`);
    for (const x of chain) memUsed.add(x);
    const up = memSlice(c);
    putMem(up, 'G', chain[0]);
    putMem(up, 'F', chain[1], true);
    if (chain.length < 3) continue;
    const lo = memSlice(chain[2]);
    putMem(lo, 'G', chain[2], true);
    if (chain[3]) putMem(lo, 'F', chain[3], true);
    up.shiftOut = true;
    macros.push({ kind: 'SRL', members: [{ inst: lo.idx, dx: 0, dy: 0 }, { inst: up.idx, dx: 0, dy: 1 }], align: [1, 2], net: chain[1].pins.Q15 });
  }
  // (a ring of them has no first one)
  const ring = memCells.find(c => q15Prev.has(c) && !memUsed.has(c));
  if (ring) throw new PackError(`pack: ${ring.type} ${ring.name}: a ring of shift registers through Q15 is not supported`);
  for (const c of memCells) {
    if (memUsed.has(c)) continue;
    // (the second of a cascade is placed with the first)
    if (memCells.some(h => h !== c && !memUsed.has(h) && cascadeOf(h) === c)) continue;
    memUsed.add(c);
    const kind = SLICEM_MEM[c.type];
    const s = memSlice(c);
    if (kind === 'ramd') {
      // G: the write port, read at A (SPO); F: read at DPRA (DPO), written at G's address (WF from WG)
      memLut(s, 'G', c, { init: memInit(c, 16), mode: 'DUAL_PORT', out: c.pins.SPO });
      memLut(s, 'F', c, { addr: [0, 1, 2, 3].map(j => c.pins[`DPRA${j}`]), addrPins: ['DPRA0', 'DPRA1', 'DPRA2', 'DPRA3'], init: memInit(c, 16), mode: 'DUAL_PORT', out: c.pins.DPO });
      memData(s, 'G', c);
      s.dmux.F = 'ALTDIF';
      s.wf = s.wg = true;
      where.set(ci(c), { inst: s.idx, bel: 'SITE', outs: { SPO: 'G', DPO: 'F' } });
      continue;
    }
    if (kind === 'ram32') {
      const init = memInit(c, 32);
      memLut(s, 'G', c, { init: init % 65536, out: null });
      memLut(s, 'F', c, { init: Math.floor(init / 65536), out: null });
      memData(s, 'G', c);
      s.dmux.F = 'ALTDIF';
      // A4: the F5 multiplexer's select (F = A4 high) and the write strobe's address bit (SLICEWE0)
      setBypass(s, 'X', c.pins.A4);
      setSink(ci(c), 'A4', { inst: s.idx, pin: 'BX', kind: 'gen' });
      s.f5 = { name: `${c.name}_F5` };
      s.wf = s.wg = true;
      s.we0 = true;
      where.set(ci(c), { inst: s.idx, bel: 'SITE', outs: { O: 'F5' } });
      continue;
    }
    // RAM16X1S / SRL16: G first; a second cell of the same kind and controls (and, for RAMs, the
    // same address) takes F
    putMem(s, 'G', c);
    const next = cascadeOf(c);
    if (next && !memUsed.has(next)) { memUsed.add(next); putMem(s, 'F', next, true); continue; }
    const sameAddr = x => kind === 'srl' || addrNets(x).every((n, j) => n === addrNets(c)[j]);
    const mate = memCells.find(x => !memUsed.has(x) && SLICEM_MEM[x.type] === kind && memKey(x) === memKey(c) && sameAddr(x));
    if (mate) { memUsed.add(mate); putMem(s, 'F', mate); }
  }
  stats.slicem = insts.filter(s => s.slicem).length;

  // ---------------------------------------------------------------- the rest: LUTs and flip-flops
  // Units: a LUT with the flip-flop it feeds (the flip-flop's D from the LUT inside the slice), a LUT
  // alone, a flip-flop alone (D through BX / BY). Slices are filled greedily: a seed unit, then
  // the compatible units that share the most nets with what is already in the slice.
  const units = [];
  const unitOf = new Map();
  for (const c of cells) {
    if (!isLut(c) || where.has(ci(c))) continue;
    const f = ffsOn(c.pins.O)[0];
    const u = { lut: ci(c), ff: f ? f.cell : -1 };
    if (f) unitOf.set(f.cell, u);
    unitOf.set(ci(c), u);
    units.push(u);
  }
  for (const [c] of ffs) if (!where.has(c) && !unitOf.has(c)) { const u = { lut: -1, ff: c }; unitOf.set(c, u); units.push(u); }
  // nets of a unit (for the affinity): inputs and outputs, without clocks and constants
  const unitNets = u => {
    const ns = new Set();
    for (const k of [u.lut, u.ff]) if (k >= 0) for (const [p, n] of Object.entries(cells[k].pins)) if (n > 1 && !/^(C|G)$/.test(p) && loadsOf(n).length < 64) ns.add(n);
    return ns;
  };
  const netUnits = new Map();
  units.forEach((u, k) => { u.k = k; u.nets = unitNets(u); for (const n of u.nets) { if (!netUnits.has(n)) netUnits.set(n, []); netUnits.get(n).push(k); } });
  // Timing (#528): the critical connections between units (criticality >= CRIT_PAIR, by
  // connectionCriticality) put the two units in one slice, as ISE's map puts consecutive LUTs of a
  // critical path (and a LUT with the flip-flop it feeds) together: u.links = [[unit index, crit]],
  // u.crit = the unit's most critical connection (to any cell)
  const { crit } = timing ? connectionCriticality(cells, nets) : { crit: new Map() };
  for (const u of units) { u.links = []; u.crit = 0; }
  for (const [key, c] of crit) {
    if (c < CRIT_PAIR) continue;
    const [cell, pin] = key.split(':'), load = unitOf.get(+cell), dr = nets[cells[+cell].pins[pin]].driver, src = dr && unitOf.get(dr.cell);
    if (load) load.crit = Math.max(load.crit, c);
    if (src) src.crit = Math.max(src.crit, c);
    if (load && src && load !== src) { load.links.push([src.k, c]); src.links.push([load.k, c]); }
  }
  const done = new Set();
  // can unit u go into slice s? returns the side(s) it would take, or null
  const fits = (s, u) => {
    // (a SLICEM with RAMs or shift registers: SR is their enable; nothing else goes in)
    if (s.mctrl) return null;
    const f = u.ff >= 0 ? ffs.get(u.ff) : null;
    if (f && !ctrlOk(s, f)) return null;
    if (u.lut >= 0 && f) { for (const side of ['F', 'G']) { const X = side === 'F' ? 'X' : 'Y'; if (!s.lut[side] && !s.ff[X]) return { lutSide: side, ffSide: X }; } return null; }
    if (u.lut >= 0) { for (const side of ['F', 'G']) if (!s.lut[side]) return { lutSide: side }; return null; }
    for (const X of ['X', 'Y']) if (!s.ff[X] && (s.b[X] === null || s.b[X] === f.d)) return { ffSide: X };
    return null;
  };
  const putUnit = (s, u, how) => {
    done.add(u.k);
    if (u.lut >= 0) {
      const lut = lutOf(cells[u.lut]);
      placeLut(s, how.lutSide, lut, u.lut);
      const X = how.lutSide === 'F' ? 'X' : 'Y';
      const fCell = u.ff >= 0 && how.ffSide ? u.ff : -1;
      if (otherLoads(lut.out, fCell >= 0 ? [[fCell, 'D']] : []).length) s.out[X] = how.lutSide;
      if (fCell >= 0) { s.out[X] = how.lutSide; placeFf(s, how.ffSide, ffs.get(fCell), 'mux'); }
    } else placeFf(s, how.ffSide, ffs.get(u.ff), 'bypass');
  };
  // A flip-flop alone (D through BX / BY) first tries the free flip-flop slots of the slices of the
  // carry chains and wide multiplexers (their BX / BY often free): one that holds logic of its nets,
  // else any. (Yosys's netlists have many: shift registers, registers loaded from other registers.)
  const macroSlices = insts.filter(s => s.kind === 'slice');
  const sliceOfNets = u => {
    const score = new Map();
    for (const n of u.nets) for (const c of [nets[n].driver?.cell, ...loadsOf(n).map(l => l.cell)]) {
      const w = c !== undefined && where.get(c);
      if (w && insts[w.inst].kind === 'slice') score.set(w.inst, (score.get(w.inst) || 0) + 1);
    }
    return [...score].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([k]) => insts[k]);
  };
  for (const u of units) {
    if (u.lut >= 0 || done.has(u.k)) continue;
    const s = sliceOfNets(u).find(x => fits(x, u)) || macroSlices.find(x => fits(x, u));
    if (s) putUnit(s, u, fits(s, u));
  }
  // seeds: the units on critical paths first (most critical first), then the others in netlist order
  // (keeps related logic together, deterministic); units with a flip-flop first
  const order = [...units].sort((a, b) => (b.crit >= CRIT_PAIR) - (a.crit >= CRIT_PAIR) || (a.crit >= CRIT_PAIR ? b.crit - a.crit : 0) || (b.ff >= 0) - (a.ff >= 0) || a.k - b.k);
  for (const seed of order) {
    if (done.has(seed.k)) continue;
    const s = newSlice();
    putUnit(s, seed, fits(s, seed));
    const inSlice = [seed];
    for (;;) {
      // candidates: units sharing a net with the slice, and (first) the units of a critical
      // connection with it. A LUT on a critical path goes only with one of its critical connections:
      // with unrelated logic, placement would pull it away from its path (a flip-flop alone, whose D
      // comes through BX / BY, may: flip-flop-bound designs would need more slices).
      const score = new Map(), link = new Map();
      const sliceNets = new Set();
      for (const u of inSlice) for (const n of u.nets) sliceNets.add(n);
      for (const n of sliceNets) for (const k of netUnits.get(n) || []) if (!done.has(k)) score.set(k, (score.get(k) || 0) + 1);
      for (const u of inSlice) for (const [k, c] of u.links) if (!done.has(k)) link.set(k, Math.max(link.get(k) || 0, c));
      for (const [k, c] of link) score.set(k, (score.get(k) || 0) + CRIT_BONUS * c);
      let best = null, bestScore = 0;
      for (const [k, sc] of score) {
        if (!(sc > bestScore || (sc === bestScore && best !== null && k < best.k))) continue;
        const u = units[k];
        if (u.lut >= 0 && u.crit >= CRIT_PAIR && !link.has(k)) continue;
        if (fits(s, u)) { best = u; bestScore = sc; }
      }
      if (!best) {
        // nothing related: fill with the next unit in order that fits (not one on a critical path)
        best = order.find(u => !done.has(u.k) && (u.lut < 0 || u.crit < CRIT_PAIR) && fits(s, u)) || null;
        if (!best || (s.lut.F && s.lut.G && s.ff.X && s.ff.Y)) break;
      }
      putUnit(s, best, fits(s, best));
      inSlice.push(best);
      if (s.lut.F && s.lut.G && s.ff.X && s.ff.Y) break;
    }
  }

  // ---------------------------------------------------------------- pads and clock buffers
  const portOfNet = new Map();
  for (const p of nl.ports) for (const b of p.bits) if (nets[b.net].const === undefined) portOfNet.set(b.net, { ...b, dir: p.dir });
  for (const c of cells) {
    if (/^(IBUF|IBUFG)$/.test(c.type)) {
      const port = portOfNet.get(c.pins.I);
      if (!port) throw new PackError(`pack: ${c.name}: input buffer not on a port`);
      // an input nothing reads gets no pad (as ISE's map trims it; ISE's DRC calls its buffer's
      // output a dangling pin)
      if (!loadsOf(c.pins.O).length) { where.set(ci(c), { inst: -1, bel: 'UNUSED' }); setSink(ci(c), 'I', 'int'); stats.unusedInputs = (stats.unusedInputs || 0) + 1; continue; }
      const a = cons[port.name] || {};
      const reg = iobFf.get(ci(c))?.I;
      // (the input straight to the fabric too: IMUX; an input register alone does not have it)
      const direct = !reg || loadsOf(c.pins.O).some(l => l.cell !== reg.cell);
      const cfg = [...(direct ? [['IDELMUX', '', '1'], ['IMUX', '', '1']] : []), ['IOATTRBOX', '', a.iostandard || 'LVCMOS25']];
      if (reg) cfg.push(...iobInputReg(reg, port.name));
      cfg.push(['INBUF', `${port.name}_IBUF`, ''], ['PAD', port.name, '']);
      if (a.pull) cfg.push(['PULL', '', { up: 'PULLUP', down: 'PULLDOWN', keeper: 'KEEPER' }[a.pull]]);
      const s = { kind: 'iob', type: 'IBUF', name: port.name, loc: a.loc || null, dir: 'in', fixedCfg: cfg, idx: insts.length, regs: reg ? ['I'] : [] };
      insts.push(s);
      where.set(ci(c), { inst: s.idx, bel: 'INBUF' });
      setSink(ci(c), 'I', 'int');
      if (reg) iobRegSinks(s, reg, 'I');
    } else if (c.type === 'OBUF' || c.type === 'OBUFT') {
      const port = portOfNet.get(c.pins.O);
      if (!port) throw new PackError(`pack: ${c.name}: output buffer not on a port`);
      const a = cons[port.name] || {};
      const r = iobFf.get(ci(c)) || {};
      // a tristate output: its enable on T1 (TMUX T1) or from the output-enable register (TFF1)
      const tri = c.type === 'OBUFT' && nets[c.pins.T].const !== 0;
      const cfg = [['DRIVEATTRBOX', '', String(a.drive || 12)], ['IOATTRBOX', '', a.iostandard || 'LVCMOS25'], ['O1INV', '', 'O1'], ['OMUX', '', r.O ? 'OFF1' : 'O1'],
        ['SLEW', '', (a.slew || 'slow').toUpperCase()]];
      if (tri) cfg.push(['T1INV', '', 'T1'], ['TMUX', '', r.T ? 'TFF1' : 'T1']);
      cfg.push(...iobOutputRegs(r));
      cfg.push(['OUTBUF', `${port.name}_OBUF`, ''], ['PAD', port.name, '']);
      if (a.pull) cfg.push(['PULL', '', { up: 'PULLUP', down: 'PULLDOWN', keeper: 'KEEPER' }[a.pull]]);
      const s = { kind: 'iob', type: 'IOB', name: port.name, loc: a.loc || null, dir: 'out', fixedCfg: cfg, idx: insts.length, regs: Object.keys(r) };
      insts.push(s);
      where.set(ci(c), { inst: s.idx, bel: 'OUTBUF' });
      if (r.O) { setSink(ci(c), 'I', 'int'); iobRegSinks(s, r.O, 'O'); } else setSink(ci(c), 'I', { inst: s.idx, pin: 'O1', kind: 'gen' });
      if (c.type === 'OBUFT') {
        if (!tri) setSink(ci(c), 'T', 'int');
        else if (r.T) { setSink(ci(c), 'T', 'int'); iobRegSinks(s, r.T, 'T'); } else setSink(ci(c), 'T', { inst: s.idx, pin: 'T1', kind: 'gen' });
      }
    } else if (c.type === 'BUFG') {
      const s = { kind: 'bufg', type: 'BUFGMUX', name: c.name, loc: null, fixedCfg: null, idx: insts.length, cell: ci(c) };
      insts.push(s);
      where.set(ci(c), { inst: s.idx, bel: 'BUFG' });
      setSink(ci(c), 'I', { inst: s.idx, pin: 'I0', kind: 'gen' });
      // the select input is tied high (SINV inverts it: I0 selected), as ISE's map does
      extra.push({ net: 1, inst: s.idx, pin: 'S', kind: 'gen' });
    } else if (BRAM_TYPE.test(c.type)) packBram(c);
    else if (MULT_TYPE.test(c.type)) packMult(c);
    else if (DCM_TYPE.test(c.type)) packDcm(c);
  }
  // The settings of an IOB's registers (#96), as ISE's map writes them (research/s3e-bitstream stage G, #44):
  // the register, its initial value, its set / reset (SR: SRHIGH sets, SRLOW resets; SYNC or ASYNC) and its
  // clock, enable and set / reset inverters; the parts not used are left out (the bit database has their
  // bits: iobRegPseudo). An input register's input delay: the one ISE's map chooses by itself (AUTO:
  // DLY2 on the XC3S100E, DLY3 on the others; the others are not in the database, #97).
  function iobRegCfg(f, g, ff, clk) {
    const t = f.ctrl, cfg = [[ff, escCfg(f.name), '#FF'], [`${ff}_INIT_ATTR`, '', f.init ? 'INIT1' : 'INIT0']];
    if (t.sr !== null) cfg.push([`${ff}_SR_ATTR`, '', f.kind.high ? 'SRHIGH' : 'SRLOW'], [`${g}FFATTRBOX`, '', t.sync ? 'SYNC' : 'ASYNC'], [`${g}SR_USED`, '', '0'], ['SRINV', '', t.srInv ? 'SR_B' : 'SR']);
    if (t.ce !== null) cfg.push([`${g}CEINV`, '', t.ceInv ? `${g}CE_B` : `${g}CE`]);
    if (clk) cfg.push([`${clk}INV`, '', t.clkInv ? `${clk}_B` : clk]);
    return cfg;
  }
  function iobInputReg(f, pad) {
    const dly = /^xc3s100e/i.test(part) ? 'DLY2' : 'DLY3';
    return [...iobRegCfg(f, 'I', 'IFF1', 'ICLK1'), ['IDDRIN_MUX', '', '2'], ['IFD_DELAY_VALUE', '', dly], ['IFFDELMUX', '', '0'], ['IFFDMUX', '', '1'],
      ['PRE_DELAY_MUX', '', '0'], ['IFD_DELAY', `${pad}.IFD_DELAY`, '']];
  }
  function iobOutputRegs(r) {
    const cfg = [];
    // (as ISE's map writes an output register: its data through O1_DDRMUX, and the enable's PCICE_MUX; xdl refuses
    // the register without O1_DDRMUX on some pads, P6 / P7 of the XC3S250E-CP132)
    if (r.O) cfg.push(...iobRegCfg(r.O, 'O', 'OFF1', 'OTCLK1'), ['O1_DDRMUX', '', '1'], ...(r.O.ctrl.ce !== null ? [['PCICE_MUX', '', 'OCE']] : []));
    if (r.T) cfg.push(...iobRegCfg(r.T, 'T', 'TFF1', r.O ? null : 'OTCLK1'));
    // (SRINV once: the IOB's set / reset is shared)
    return cfg.filter(([a], k) => a !== 'SRINV' || cfg.findIndex(([b]) => b === 'SRINV') === k);
  }
  // the pins of an IOB register: its clock, enable and set / reset on the site's (one clock and one set /
  // reset for the output and output-enable registers), D on O1 / T1 (an input register's: the pad, inside)
  function iobRegSinks(s, f, role) {
    const t = f.ctrl, pin = (p, v) => setSink(f.cell, p, v === null ? 'int' : { inst: s.idx, pin: v, kind: 'gen' });
    where.set(f.cell, { inst: s.idx, bel: `${role}FF1` });
    pin(f.clkPin, role === 'I' ? 'ICLK1' : 'OTCLK1');
    if (f.cePin in cells[f.cell].pins) pin(f.cePin, t.ce !== null ? `${role}CE` : null);
    if (f.srPin) pin(f.srPin, t.sr !== null ? 'SR' : null);
    pin('D', role === 'I' ? null : role === 'O' ? 'O1' : 'T1');
  }
  // a site of its own whose pins are the cell's: pin map cell pin -> site pin (inputs; or several
  // site pins on one net), outputs by name
  function hardSite(c, kind, type, pinMap) {
    const s = { kind, type, name: c.name, loc: null, fixedCfg: null, idx: insts.length, cell: ci(c), params: c.params, conn: new Set() };
    insts.push(s);
    const outs = {};
    for (const [p, n] of Object.entries(c.pins)) {
      const [sp, ...more] = [].concat(pinMap(p) ?? []);
      if (c.dirs[p.replace(/<\d+>$/, '')] === 'output') { if (sp) outs[p] = sp; continue; }
      // inputs the site does not have (a cascade input tied to 0…) are left out, and so are a
      // block RAM's data inputs Yosys leaves undriven (ISE's DRC calls the output bit of a data
      // input tied to a constant a dangling pin); parity inputs stay connected (DRC: all or none).
      // A DCM's DSSEN tied to a constant is left open, as ISE's map does (DSSENINV #OFF)
      const skip = !sp || (kind === 'bram' && /^DI[AB]?\d+$/.test(sp) && c.undriven?.includes(p)) || (kind === 'dcm' && sp === 'DSSEN' && nets[n].const !== undefined);
      if (skip) { setSink(ci(c), p, 'int'); continue; }
      // the other control pins tied to a constant are connected to it, not inverted, as ISE's map
      // does (block RAM EN / WE / SSR, multiplier CE / RST / CLK: 1 from the VCC site of the
      // block-RAM interconnect tile, 0 from a slice, #50; a DCM's RST / PSCLK / PSEN / PSINCDEC: 1
      // from the VCC site of the DCM's tile, #190)
      setSink(ci(c), p, { inst: s.idx, pin: sp, kind: 'gen' });
      s.conn.add(sp);
      for (const x of more) { extra.push({ net: n, inst: s.idx, pin: x, kind: 'gen' }); s.conn.add(x); }
    }
    where.set(ci(c), { inst: s.idx, bel: 'SITE', outs });
    return s;
  }
  // Block RAM: RAMB16_S<w> (port A) or RAMB16_S<wa>_S<wb>. A port of w bits uses the address pins
  // ADDR(14 - n) … ADDR13 (n address bits), data DI0…, parity DIP0… (as ISE's map writes it).
  function packBram(c) {
    const m = BRAM_TYPE.exec(c.type);
    const ports = m[3] ? { A: +m[1], B: +m[3] } : { A: +m[1] };
    const single = !m[3];
    parityToData(c, ports, single);
    const s = hardSite(c, 'bram', 'RAMB16', p => {
      const q = /^(DOP|DIP|DO|DI|ADDR|CLK|EN|SSR|WE)([AB])?(?:<(\d+)>)?$/.exec(p);
      if (!q) return null;
      const port = single ? 'A' : q[2];
      if (!port || ports[port] === undefined) return null;
      const w = BRAM_WIDTH[ports[port]], i = q[3] === undefined ? 0 : +q[3];
      if (q[1] === 'ADDR') return `ADDR${port}${14 - w.addr + i}`;
      if (/^(DO|DI|DOP|DIP)$/.test(q[1])) return `${q[1]}${port}${i}`;
      return `${q[1]}${port}`;
    });
    s.ports = ports;
    s.single = single;
  }
  // A word narrower than the port with a bit in a parity position (Yosys's 18-bit word is DI0-7,
  // DIP0, DI8-15, DIP1: a 14-bit memory writes DIP0 and leaves DI13-15 free): ISE's DRC warns when
  // a port's parity inputs carry a signal and its parity outputs are not read (PhysDesignRules:1060,
  // "The block is configured to use input parity pins. There are dangling output parity pins.").
  // Each such parity bit moves to a data bit no port writes or reads (pins, contents, initial and
  // reset values), as ISE's map lays out the same memory (DI0-13, parity inputs tied to 0): when a
  // port writes a signal into a parity bit it does not read. Ports of the same width only (a
  // parity bit is then the same bit of the memory on both).
  function parityToData(c, ports, single) {
    const widths = [...new Set(Object.values(ports))];
    if (widths.length !== 1 || !BRAM_WIDTH[widths[0]].par) return;
    const w = BRAM_WIDTH[widths[0]];
    const sides = single ? [''] : Object.keys(ports);
    c.params = { ...c.params };   // (the packer's copy of the cell shares them with the netlist)
    const pinName = (base, i, count) => (count > 1 ? `${base}<${i}>` : base);
    const unused = pin => !(pin in c.pins) || (() => { const n = nets[c.pins[pin]]; return n.const === undefined && !n.loads.length && !n.port; })();
    const undriven = pin => !(pin in c.pins) || !!c.undriven?.includes(pin);
    const swapPins = (a, b) => {
      const na = c.pins[a], nb = c.pins[b];
      // (both may be on one net, a constant: the ends are found first, then renamed)
      const ends = [];
      for (const [pin, n, to] of [[a, na, b], [b, nb, a]]) {
        if (n === undefined) continue;
        for (const l of nets[n].loads) if (l.cell === ci(c) && l.pin === pin) ends.push([l, to]);
        if (nets[n].driver?.cell === ci(c) && nets[n].driver.pin === pin) ends.push([nets[n].driver, to]);
      }
      for (const [e, to] of ends) e.pin = to;
      delete c.pins[a]; delete c.pins[b];
      if (nb !== undefined) c.pins[a] = nb;
      if (na !== undefined) c.pins[b] = na;
      if (c.undriven) c.undriven = c.undriven.map(p => (p === a ? b : p === b ? a : p));
    };
    // the memory's contents (INIT_00..3F: data bits, INITP_00..07: parity bits; LSB first)
    const get = k => c.params[k] ?? c.params[k.toLowerCase()] ?? c.params[k.replace(/_([0-9A-F]{2})$/, (_, h) => `_${h.toLowerCase()}`)];
    const words = (prefix, count) => {
      const out = [];
      for (let i = 0; i < count; i++) { const b = paramBits(get(`${prefix}_${i.toString(16).padStart(2, '0').toUpperCase()}`)) || []; for (let j = 0; j < 256; j++) out.push(b[j] || 0); }
      return out;
    };
    const putWords = (prefix, bits) => {
      for (let i = 0; i < bits.length / 256; i++) {
        const k = `${prefix}_${i.toString(16).padStart(2, '0').toUpperCase()}`;
        for (const v of [k, k.toLowerCase(), k.replace(/_([0-9A-F]{2})$/, (_, h) => `_${h.toLowerCase()}`)]) delete c.params[v];
        c.params[k] = bits.slice(i * 256, i * 256 + 256).reverse().join('');
      }
    };
    let data = null, par = null, stuck = false;
    const taken = new Set();
    for (let k = 0; k < w.par; k++) {
      // a port writes a signal into the parity bit and does not read it back (the DRC's case)
      const signal = pin => pin in c.pins && nets[c.pins[pin]].const === undefined;
      if (!sides.some(P => signal(pinName(`DIP${P}`, k, w.par)) && unused(pinName(`DOP${P}`, k, w.par)))) continue;
      let j = -1;
      for (let i = 0; i < w.data && j < 0; i++) if (!taken.has(i) && sides.every(P => undriven(pinName(`DI${P}`, i, w.data)) && unused(pinName(`DO${P}`, i, w.data)))) j = i;
      if (j < 0) { stuck = true; continue; }
      taken.add(j);
      for (const P of sides) {
        swapPins(pinName(`DI${P}`, j, w.data), pinName(`DIP${P}`, k, w.par));
        swapPins(pinName(`DO${P}`, j, w.data), pinName(`DOP${P}`, k, w.par));
        // the initial and reset values of the output latches: data bits, then parity bits
        for (const v of ['INIT', 'SRVAL']) {
          const key = single ? v : `${v}_${P}`;
          if (c.params[key] === undefined) continue;
          const b = paramBits(c.params[key]) || [];
          while (b.length < w.data + w.par) b.push(0);
          [b[j], b[w.data + k]] = [b[w.data + k], b[j]];
          c.params[key] = b.slice(0, w.data + w.par).reverse().join('');
        }
      }
      data ||= words('INIT', 64);
      par ||= words('INITP', 8);
      for (let a = 0; a < 16384 / w.data; a++) [data[a * w.data + j], par[a * w.par + k]] = [par[a * w.par + k], data[a * w.data + j]];
    }
    if (data) { putWords('INIT', data); putWords('INITP', par); }
    // No free data bit (a 2048 x 9 FIFO writing all 9 bits on port A and reading them on port B:
    // PhysDesignRules:1063, "configured to use an input parity pins. There is a dangling output
    // parity pin.", which ISE's own map of the same memory gives too, #550): when the memory uses
    // half the port's words at most (its address MSB tied to 0 on every port), each port becomes
    // twice as wide with half the words, the word on data bits only (parity bit k on data bit
    // data + k), the parity inputs tied to 0 and the parity outputs unused.
    const W = BRAM_WIDTH[2 * widths[0]];
    const msb = P => pinName(`ADDR${P}`, w.addr - 1, w.addr);
    if (!stuck || !W || !sides.every(P => !(msb(P) in c.pins) || nets[c.pins[msb(P)]].const === 0)) return;
    const rename = (from, to) => {
      if (!(from in c.pins)) return;
      const n = c.pins[from];
      for (const e of [...nets[n].loads, nets[n].driver]) if (e?.cell === ci(c) && e.pin === from) e.pin = to;
      delete c.pins[from];
      c.pins[to] = n;
      if (c.undriven) c.undriven = c.undriven.map(p => (p === from ? to : p));
    };
    for (const P of sides) {
      if (msb(P) in c.pins) {
        const n = c.pins[msb(P)];
        nets[n].loads = nets[n].loads.filter(l => !(l.cell === ci(c) && l.pin === msb(P)));
        delete c.pins[msb(P)];
      }
      for (let i = 0; i < w.data; i++) for (const b of ['DI', 'DO']) rename(pinName(`${b}${P}`, i, w.data), pinName(`${b}${P}`, i, W.data));
      for (let k = 0; k < w.par; k++) for (const b of ['DI', 'DO']) rename(pinName(`${b}P${P}`, k, w.par), pinName(`${b}${P}`, w.data + k, W.data));
      // the parity inputs tied to 0 (the DRC wants all of a port's or none: PhysDesignRules:1061)
      for (let k = 0; k < W.par; k++) {
        c.pins[pinName(`DIP${P}`, k, W.par)] = 0;
        nets[0].loads.push({ cell: ci(c), pin: pinName(`DIP${P}`, k, W.par) });
      }
      for (const v of ['INIT', 'SRVAL']) {
        const key = single ? v : `${v}_${P}`;
        if (c.params[key] === undefined) continue;
        const b = (paramBits(c.params[key]) || []).slice(0, w.data + w.par);
        while (b.length < W.data + W.par) b.push(0);
        c.params[key] = b.reverse().join('');
      }
    }
    // the contents: word a of the lower half, its data bits then its parity bits, on word a
    data = words('INIT', 64);
    par = words('INITP', 8);
    const wide = Array(16384).fill(0);
    for (let a = 0; a < 16384 / W.data; a++) {
      for (let i = 0; i < w.data; i++) wide[a * W.data + i] = data[a * w.data + i];
      for (let k = 0; k < w.par; k++) wide[a * W.data + w.data + k] = par[a * w.par + k];
    }
    putWords('INIT', wide);
    putWords('INITP', Array(2048).fill(0));
    for (const P of Object.keys(ports)) ports[P] = 2 * widths[0];
    c.type = c.type.replace(/S\d+/g, `S${2 * widths[0]}`);
  }
  // DCM (DCM_SP): its pins by name (STATUS<i> -> STATUSi); only the settings in the bit database
  // (research/s3e-bitstream/README.md, stages D and F: every DCM of the four devices) are accepted.
  // Its site: an INST LOC of the UCF, else the placer's choice (#47)
  function packDcm(c) {
    const p = c.params;
    const str = k => String(p[k] ?? '').trim().toUpperCase();
    const bad = why => { throw new PackError(`pack: ${c.type} ${c.name}: ${why}`); };
    // DESKEW_ADJUST: SYSTEM_SYNCHRONOUS is 7 and SOURCE_SYNCHRONOUS 0 in ISE's map (#46)
    const deskew = str('DESKEW_ADJUST') || 'SYSTEM_SYNCHRONOUS';
    if (!/^(SYSTEM_SYNCHRONOUS|SOURCE_SYNCHRONOUS|[0-9]|1[0-5])$/.test(deskew)) bad(`DESKEW_ADJUST = ${deskew} is not in the bit database yet`);
    const s = hardSite(c, 'dcm', 'DCM', pin => {
      const q = /^STATUS<(\d+)>$/.exec(pin);
      if (q) return `STATUS${q[1]}`;
      return /^(CLKIN|CLKFB|RST|DSSEN|PSCLK|PSEN|PSINCDEC|CLK0|CLK90|CLK180|CLK270|CLK2X|CLK2X180|CLKDV|CLKFX|CLKFX180|LOCKED|PSDONE)$/.test(pin) ? pin : null;
    });
    // a real as XDL writes it: 2.5 -> 2_5, 20 -> 20.0000000000000000 (the input period)
    const real = k => { const v = parseFloat(p[k]); return Number.isNaN(v) ? null : v; };
    const int = (k, d) => (p[k] === undefined ? d : paramInt(p[k], d));
    const dv = real('CLKDV_DIVIDE') ?? 2;
    s.dcm = {
      CLKDV_DIVIDE: String(dv).replace('.', '_'), CLKFX_DIVIDE: String(int('CLKFX_DIVIDE', 1)), CLKFX_MULTIPLY: String(int('CLKFX_MULTIPLY', 4)),
      CLKOUT_PHASE_SHIFT: str('CLKOUT_PHASE_SHIFT') || 'NONE', CLK_FEEDBACK: str('CLK_FEEDBACK') || '1X',
      DESKEW_ADJUST: { SYSTEM_SYNCHRONOUS: '7', SOURCE_SYNCHRONOUS: '0' }[deskew] ?? deskew, DFS_FREQUENCY_MODE: str('DFS_FREQUENCY_MODE') || 'LOW',
      DLL_FREQUENCY_MODE: str('DLL_FREQUENCY_MODE') || 'LOW', DUTY_CYCLE_CORRECTION: str('DUTY_CYCLE_CORRECTION') === 'FALSE' ? 'FALSE' : 'TRUE',
      PHASE_SHIFT: String(p.PHASE_SHIFT === undefined ? 0 : BigInt.asIntN(32, BigInt(paramInt(p.PHASE_SHIFT, 0)))),
      period: real('CLKIN_PERIOD'), startupWait: str('STARTUP_WAIT') === 'TRUE', divideBy2: str('CLKIN_DIVIDE_BY_2') === 'TRUE',
    };
    s.loc = instLocs.get(c.name) || null;
  }
  // Multiplier: MULT18X18 (no registers), MULT18X18S (registered product: C, CE, R) or MULT18X18SIO.
  // As ISE builds the first two (#50): MULT18X18S's CE on CEA, CEB and CEP, R on RSTA, RSTB and
  // RSTP; MULT18X18's enables and clock tied to 0, its resets to 1
  function packMult(c) {
    const s = hardSite(c, 'mult', 'MULT18X18SIO', p => {
      const q = /^(A|B|P|BCIN|BCOUT)<(\d+)>$/.exec(p);
      if (q) return q[1] === 'BCIN' || q[1] === 'BCOUT' ? null : `${q[1]}${q[2]}`;
      if (c.type === 'MULT18X18S') return { C: 'CLK', CE: ['CEA', 'CEB', 'CEP'], R: ['RSTA', 'RSTB', 'RSTP'] }[p] || null;
      return /^(CLK|CEA|CEB|CEP|RSTA|RSTB|RSTP)$/.test(p) ? p : null;
    });
    if (c.type === 'MULT18X18') {
      for (const pin of ['CEA', 'CEB', 'CEP', 'CLK', 'RSTA', 'RSTB', 'RSTP']) {
        extra.push({ net: /^RST/.test(pin) ? 1 : 0, inst: s.idx, pin, kind: 'gen' });
        s.conn.add(pin);
      }
    }
    s.mult = c.type;
    for (const p of ['BCIN', 'BCOUT']) for (const k of Object.keys(c.pins)) if (k.startsWith(`${p}<`) && p === 'BCIN' && nets[c.pins[k]].const === undefined) throw new PackError(`pack: ${c.type} ${c.name}: the multiplier cascade (BCIN) is not supported yet`);
  }
  for (const c of cells) if (!c.lowered && !where.has(ci(c))) throw new PackError(`pack: ${c.type} ${c.name} was not packed`);

  // ---------------------------------------------------------------- site pins of every connection
  // the inputs of the LUTs in slices, by pin
  for (const s of insts) if (s.kind === 'slice') for (const side of ['F', 'G']) {
    const lut = s.lut[side];
    if (!lut) continue;
    lut.inputs.forEach((n, j) => {
      const pin = `${side}${lut.pins[j]}`;
      if (lut.cell >= 0 && j < LUT_K[cells[lut.cell].type]) setSink(lut.cell, `I${j}`, { inst: s.idx, pin, kind: 'gen' });
      else extra.push({ net: n, inst: s.idx, pin, kind: 'gen' });
    });
  }
  // the source pin of a cell's output for a connection of this kind
  const srcPin = (cell, kind, cellPin) => {
    const w = (kind === 'gen' && tapOf.get(cell)) || where.get(cell);
    const s = insts[w.inst];
    if (kind === 'f5') { s.f5out = true; return { inst: w.inst, pin: 'F5' }; }
    if (kind === 'fx') { s.fxout = true; return { inst: w.inst, pin: 'FX' }; }
    const sel = (X, v) => {
      if (s.out[X] && s.out[X] !== v) throw new PackError(`pack: output ${X} of a slice needed for two signals (${s.out[X]}, ${v})`);
      s.out[X] = v;
      s.used = s.used || {};
      s.used[X] = true;
      return { inst: w.inst, pin: X };
    };
    if (w.bel === 'SITE') {
      const o = w.outs[cellPin];
      if (!o) throw new PackError(`pack: ${cells[cell].type} ${cells[cell].name}: no site pin for ${cellPin}`);
      // a SLICEM memory's output through X / Y (F, G or the F5 multiplexer)
      if (s.kind === 'slice') return o === 'G' ? sel('Y', 'G') : sel('X', o);
      return { inst: w.inst, pin: o };
    }
    switch (w.bel) {
      case 'F': return sel('X', 'F');
      case 'G': return sel('Y', 'G');
      case 'FFX': return { inst: w.inst, pin: 'XQ' };
      case 'FFY': return { inst: w.inst, pin: 'YQ' };
      case 'F5MUX': return sel('X', 'F5');
      case 'F6MUX': return sel('Y', 'FX');
      case 'XORF': return sel('X', 'FXOR');
      case 'XORG': return sel('Y', 'GXOR');
      case 'CYMUXF': s.xb = true; return { inst: w.inst, pin: 'XB' };
      case 'CYMUXG': s.yb = true; return { inst: w.inst, pin: 'YB' };
      case 'INBUF': return { inst: w.inst, pin: 'I' };
      case 'IFF1': return { inst: w.inst, pin: 'IQ1' };
      case 'BUFG': return { inst: w.inst, pin: 'O' };
      default: throw new PackError(`pack: no output pin for ${w.bel}`);
    }
  };
  const outNets = [];
  const netByKey = new Map();
  const constNet = v => {
    const k = `const${v}`;
    if (!netByKey.has(k)) { const n = { name: v ? 'GLOBAL_LOGIC1' : 'GLOBAL_LOGIC0', type: v ? 'vcc' : 'gnd', outpins: [], inpins: [] }; netByKey.set(k, n); outNets.push(n); }
    return netByKey.get(k);
  };
  const xdlNet = (n, from, kind) => {
    const k = `${n}|${kind}|${from.inst}`;
    if (!netByKey.has(k)) {
      const base = nets[n].name;
      const nn = { name: uniqueNet(kind === 'gen' ? base : `${base}_${kind.toUpperCase()}`), type: 'wire', outpins: [from], inpins: [] };
      netByKey.set(k, nn); outNets.push(nn);
    }
    return netByKey.get(k);
  };
  const connect = (n, to) => {
    if (nets[n].const !== undefined) { constNet(nets[n].const).inpins.push({ inst: to.inst, pin: to.pin }); return; }
    const d = nets[n].driver;
    if (!d) { warnings.push(`net ${nets[n].name} has no driver: ${insts[to.inst].name || to.inst}.${to.pin} tied to 0`); constNet(0).inpins.push({ inst: to.inst, pin: to.pin }); return; }
    if (to.kind === 'cy') { xdlNet(n, { inst: to.from, pin: 'COUT' }, 'cy').inpins.push({ inst: to.inst, pin: 'CIN' }); return; }
    xdlNet(n, srcPin(d.cell, to.kind, d.pin), to.kind).inpins.push({ inst: to.inst, pin: to.pin });
  };
  const seenPin = new Set();
  for (const [n, net] of nets.entries()) {
    for (const l of net.loads) {
      const v = sink.get(`${l.cell}:${l.pin}`);
      if (v === undefined) throw new PackError(`pack: ${cells[l.cell].type} ${cells[l.cell].name} pin ${l.pin}: not connected by the packer`);
      if (v === 'int') continue;
      const key = `${v.inst}:${v.pin}`;
      if (seenPin.has(key)) continue;   // several cell pins on one site pin (a shared BX, CLK…)
      seenPin.add(key);
      connect(n, v);
    }
  }
  for (const e of extra) { const key = `${e.inst}:${e.pin}`; if (!seenPin.has(key)) { seenPin.add(key); connect(e.net, e); } }
  // carry chains between slices: COUT of one slice -> CIN of the next
  for (const mac of macros) if (mac.kind === 'carry') for (let k = 1; k < mac.members.length; k++) {
    const a = insts[mac.members[k - 1].inst], b = insts[mac.members[k].inst];
    if (b.carry.init !== 'CIN') continue;
    const name = uniqueNet(`${a.carry.G?.mux?.name || a.carry.F?.mux?.name || 'carry'}_COUT`);
    outNets.push({ name, type: 'wire', outpins: [{ inst: a.idx, pin: 'COUT' }], inpins: [{ inst: b.idx, pin: 'CIN' }] });
  }
  // shift-register chains between the SLICEMs of a CLB: SHIFTOUT of the upper one -> SHIFTIN of the lower one
  for (const mac of macros) if (mac.kind === 'SRL') {
    outNets.push({ name: uniqueNet(nets[mac.net].name), type: 'wire', outpins: [{ inst: mac.members[1].inst, pin: 'SHIFTOUT' }], inpins: [{ inst: mac.members[0].inst, pin: 'SHIFTIN' }] });
  }
  // ---------------------------------------------------------------- configuration strings
  for (const s of insts) if (s.kind === 'iob') s.name = uniqueName(s.name);   // pads keep their port's name
  // names of the slices: the first flip-flop or LUT inside
  for (const s of insts) if (s.kind === 'slice') {
    const base = s.ff.X?.name || s.ff.Y?.name || s.lut.F?.name || s.lut.G?.name || `slice${s.idx}`;
    s.name = uniqueName(base);
  }
  for (const s of insts) {
    if (s.kind === 'iob') { s.cfg = s.fixedCfg.map(([attr, name, value]) => ({ attr, name: name ? escCfg(name) : '', value })); continue; }
    if (s.kind === 'bufg') {
      s.name = uniqueName(s.name);
      const n = escCfg(s.name);
      s.cfg = [['DISABLE_ATTR', '', 'LOW'], ['I0_USED', '', '0'], ['SINV', '', 'S_B'], ['GCLKMUX', `${n}.GCLKMUX`, ''], ['GCLK_BUFFER', n, '']].map(([attr, name, value]) => ({ attr, name, value }));
      continue;
    }
    if (s.kind === 'bram') { s.name = uniqueName(s.name); bramCfg(s); continue; }
    if (s.kind === 'mult') { s.name = uniqueName(s.name); multCfg(s); continue; }
    if (s.kind === 'dcm') { s.name = uniqueName(s.name); dcmCfg(s); continue; }
    sliceCfg(s);
  }
  // a parameter (binary string, most significant bit first, x read as 0) as hexadecimal of `bits` bits
  function paramHex(v, bits) {
    const b = paramBits(v) || [];
    let n = 0n;
    for (let i = Math.min(b.length, bits) - 1; i >= 0; i--) n = (n << 1n) | BigInt(b[i]);
    return n.toString(16).toUpperCase().padStart(Math.ceil(bits / 4), '0');
  }
  function bramCfg(s) {
    const cfg = [];
    const add = (attr, name, value) => cfg.push({ attr, name, value });
    const p = s.params, n = escCfg(s.name);
    const prm = (name, port) => (s.single ? p[name] : p[`${name}_${port}`]);
    for (const port of Object.keys(s.ports)) {
      for (const pin of ['CLK', 'EN', 'SSR', 'WE']) add(`${pin}${port}INV`, '', `${pin}${port}`);
      add(`PORT${port}_ATTR`, '', BRAM_WIDTH[s.ports[port]].attr);
      add(`WRITEMODE${port}`, '', String(prm('WRITE_MODE', port) || 'WRITE_FIRST').trim());
    }
    add('RAMB16', `${n}.RAMB16`, '');
    for (const port of Object.keys(s.ports)) add(`RAMB16${port}`, `${n}.${port}`, '');
    const get = k => p[k] ?? p[k.toLowerCase()] ?? p[k.replace(/_([0-9A-F]{2})$/, (m, h) => `_${h.toLowerCase()}`)];
    for (let i = 0; i < 8; i++) { const k = `INITP_${i.toString(16).padStart(2, '0').toUpperCase()}`; add(`INITP_0${i}`, '', paramHex(get(k), 256)); }
    for (let i = 0; i < 64; i++) { const h = i.toString(16).padStart(2, '0'); add(`INIT_${h}`, '', paramHex(get(`INIT_${h.toUpperCase()}`), 256)); }
    for (const port of Object.keys(s.ports)) {
      const w = BRAM_WIDTH[s.ports[port]], bits = w.data + w.par;
      add(`INIT_${port}`, '', paramHex(prm('INIT', port), bits));
      add(`SRVAL_${port}`, '', paramHex(prm('SRVAL', port), bits));
    }
    s.cfg = cfg;
  }
  // as ISE's map writes a DCM_SP (the FACTORY_JF and LL_HEX settings set no bits)
  function dcmCfg(s) {
    const d = s.dcm;
    const cfg = [['CLKDV_DIVIDE', '', d.CLKDV_DIVIDE], ...(d.divideBy2 ? [['CLKIN_DIVIDE_BY_2', '', 'CLKIN_DIVIDE_BY_2']] : []), ['CLKOUT_PHASE_SHIFT', '', d.CLKOUT_PHASE_SHIFT], ['CLK_FEEDBACK', '', d.CLK_FEEDBACK],
      ['DESKEW_ADJUST', '', d.DESKEW_ADJUST], ['DFS_FREQUENCY_MODE', '', d.DFS_FREQUENCY_MODE], ['DLL_FREQUENCY_MODE', '', d.DLL_FREQUENCY_MODE],
      ['DUTY_CYCLE_CORRECTION', '', d.DUTY_CYCLE_CORRECTION], ['FACTORY_JF1', '', '0XC0'], ['FACTORY_JF2', '', '0X80']];
    // the startup sequence waits for the lock (also the COR register: bitgen.js)
    if (d.startupWait) cfg.push(['STARTUP_WAIT', '', 'STARTUP_WAIT']);
    for (const pin of ['PSCLK', 'PSEN', 'PSINCDEC', 'RST']) cfg.push([`${pin}INV`, '', pin]);
    cfg.push(['DCM', escCfg(s.name), ''], ['CLKFX_DIVIDE', '', d.CLKFX_DIVIDE], ['CLKFX_MULTIPLY', '', d.CLKFX_MULTIPLY]);
    for (const h of ['COM', 'DFS', 'DLLC', 'DLLS', 'MISC']) cfg.push([`LL_HEX_${h}`, '', '']);
    cfg.push(['PHASE_SHIFT', '', d.PHASE_SHIFT]);
    if (d.period !== null) cfg.push(['X_CLKIN_PERIOD', '', d.period.toFixed(16)]);
    s.cfg = cfg.map(([attr, name, value]) => ({ attr, name, value }));
  }
  function multCfg(s) {
    const p = s.params;
    const reg = k => (s.mult === 'MULT18X18SIO' ? String(paramInt(p[k], 1)) : s.mult === 'MULT18X18S' && k === 'PREG' ? '1' : '0');
    const cfg = [['AREG', '', reg('AREG')], ['BREG', '', reg('BREG')], ['B_INPUT', '', String(p.B_INPUT || 'DIRECT').trim()]];
    // (the inverter settings of the connected pins)
    const inv = pin => (s.conn.has(pin) ? [[`${pin}INV`, '', pin]] : []);
    for (const pin of ['CEA', 'CEB', 'CEP', 'CLK']) cfg.push(...inv(pin));
    cfg.push(['PREG', '', reg('PREG')], ['PREG_CLKINVERSION', '', '0']);
    for (const pin of ['RSTA', 'RSTB', 'RSTP']) cfg.push(...inv(pin));
    cfg.push(['MULT18X18SIO', escCfg(s.name), '']);
    s.cfg = cfg.map(([attr, name, value]) => ({ attr, name, value }));
  }
  function sliceCfg(s) {
    const cfg = [];
    const add = (attr, name, value) => cfg.push({ attr, name, value });
    const nm = x => escCfg(x);
    for (const side of ['F', 'G']) {
      const lut = s.lut[side];
      if (lut?.mem) {
        // a RAM / shift register: its contents in hexadecimal (bit a = address a)
        add(side, nm(lut.name), `#RAM:D=0x${lut.mem.init.toString(16).toUpperCase().padStart(4, '0')}`);
        if (lut.mem.mode) add(`${side}_ATTR`, '', lut.mem.mode);
      } else if (lut) add(side, nm(lut.name), `#LUT:${initToEquation(lut.init, lut.k, lut.pins)}`);
    }
    for (const X of ['X', 'Y']) {
      const f = s.ff[X];
      if (!f) continue;
      add(`FF${X}`, nm(f.name), f.ctrl.latch ? '#LATCH' : '#FF');
      add(`FF${X}_INIT_ATTR`, '', f.init ? 'INIT1' : 'INIT0');
      // (beside a shift register, whose shift enable has SR, ISE's map writes SRLOW)
      add(`FF${X}_SR_ATTR`, '', f.kind.sr && f.kind.high ? 'SRHIGH' : f.kind.sr ? 'SRLOW' : (f.init && !s.mctrl ? 'SRHIGH' : 'SRLOW'));
      add(`D${X}MUX`, '', f.dsrc === 'mux' ? '1' : '0');
    }
    if (s.mctrl) {
      // a SLICEM's RAMs / shift registers: write clock, enable on SR, data in, write strobe
      const m = s.mctrl;
      if (!s.ctrl) add('CLKINV', '', m.clkInv ? 'CLK_B' : 'CLK');
      add('SRINV', '', 'SR');
      if (s.dmux?.F) add('DIF_MUX', '', s.dmux.F);
      if (s.dmux?.G) add('DIG_MUX', '', s.dmux.G);
      if (s.shiftOut) add('SHIFTOUTUSED', '', '0');
      const first = s.lut.F || s.lut.G;
      add('WSGEN', `${nm(first.name)}.${m.srl ? 'CE' : 'WE'}`, '');
      if (s.we0) add('SLICEWE0USED', '', '0');
      for (const [on, w] of [[s.wf, 'WF'], [s.wg, 'WG']]) if (on) for (let j = 1; j <= 4; j++) add(`${w}${j}USED`, '', '0');
    }
    if (s.ctrl) {
      add('CLKINV', '', s.ctrl.clkInv ? 'CLK_B' : 'CLK');
      if (s.ctrl.ce !== null) add('CEINV', '', s.ctrl.ceInv ? 'CE_B' : 'CE');
      if (s.ctrl.sr !== null && !s.mctrl) add('SRINV', '', s.ctrl.srInv ? 'SR_B' : 'SR');
      add('SYNC_ATTR', '', s.ctrl.sync ? 'SYNC' : 'ASYNC');
    }
    if (s.b.X !== null) add('BXINV', '', 'BX');
    if (s.b.Y !== null) add('BYINV', '', 'BY');
    // output multiplexers: needed by the X / Y pins or by the flip-flops
    if (s.out.X && (s.used?.X || s.ff.X?.dsrc === 'mux')) add('FXMUX', '', s.out.X);
    if (s.out.Y && (s.used?.Y || s.ff.Y?.dsrc === 'mux')) add('GYMUX', '', s.out.Y);
    if (s.used?.X) add('XUSED', '', '0');
    if (s.used?.Y) add('YUSED', '', '0');
    if (s.f5) { add('F5MUX', nm(s.f5.name), ''); if (s.f5out) add('F5USED', '', '0'); }
    if (s.fi) { add('F6MUX', nm(s.fi.name), ''); if (s.fxout) add('FXUSED', '', '0'); }
    if (s.carry) {
      const c = s.carry;
      if (c.init) add('CYINIT', '', c.init);
      for (const side of ['F', 'G']) {
        const st = c[side];
        if (!st) continue;
        if (st.mux) {
          add(`CYMUX${side}`, nm(st.mux.name), '');
          add(`CYSEL${side}`, '', side);
          add(`CY0${side}`, '', st.cy0);
          if (st.cy0 === '0') add(`GND${side}`, nm(`${s.name}.GND${side}`), '');
          if (st.cy0 === '1') add(side === 'F' ? 'C1VDD' : 'C2VDD', nm(`${s.name}.C${side === 'F' ? 1 : 2}VDD`), '');
        }
        if (st.xor) add(`XOR${side}`, nm(st.xor.name), '');
      }
      if (s.xb) add('XBUSED', '', '0');
      if (s.yb) add('YBUSED', '', '0');
      if (c.cout) add('COUTUSED', '', '0');
    }
    s.cfg = cfg;
  }
  const slices = insts.filter(s => s.kind === 'slice');
  // the ports of the design, as ISE's map records them in the design's cfg (netgen names the ports
  // of its simulation model from them): one BUS_INFO per bus, one PIN_INFO per bus bit (the
  // index counted from the first bit declared; ':' inside a field escaped)
  const designCfg = [];
  for (const p of nl.ports) {
    if (p.bits.length < 2 && !/<\d+>$/.test(p.bits[0]?.name || '')) continue;
    const idx = p.bits.map(b => +/<(-?\d+)>$/.exec(b.name)[1]);
    const msb = idx.at(-1), lsb = idx[0];
    const dir = p.dir === 'in' ? 'INPUT' : p.dir === 'out' ? 'OUTPUT' : 'BIDIR';
    const bus = `${clean(p.name)}<${msb}:${lsb}>`;
    designCfg.push(`_DESIGN_PROP::BUS_INFO:${p.bits.length}:${dir}:${bus}`);
    p.bits.forEach((b, i) => {
      const n = clean(b.name);
      designCfg.push(`_DESIGN_PROP::PIN_INFO:${n}:/${clean(nl.name)}/PACKED/${clean(nl.name)}/${n}/${n}/PAD:${dir}:${p.bits.length - 1 - i}:${bus.replace(':', '\\:')}`);
    });
  }
  const out = {
    name: nl.name, part, cfg: designCfg.join('\n       '),
    insts: insts.map(s => ({ name: s.name, type: s.type, cfg: s.cfg, loc: s.loc || null, kind: s.kind, dir: s.dir, ...(s.regs?.length ? { regs: s.regs } : {}), ...(s.kind === 'bram' ? { wide: Object.values(s.ports).includes(36) } : {}) })),
    nets: outNets.filter(n => n.inpins.length),
    macros,
    // where each cell of the netlist went: { inst, bel } (FFX / FFY, F / G, CYMUXF…; inst -1: left out)
    cellSites: nl.cells.map((c, i) => (where.has(i) ? { inst: where.get(i).inst, bel: where.get(i).bel } : null)),
    stats: {
      slices: slices.length, luts: slices.reduce((a, s) => a + !!s.lut.F + !!s.lut.G, 0), ffs: slices.reduce((a, s) => a + !!s.ff.X + !!s.ff.Y, 0),
      carry: stats.carry, muxes: stats.muxes, iobs: insts.filter(s => s.kind === 'iob').length, bufgs: insts.filter(s => s.kind === 'bufg').length,
      copies: stats.copies, passthru: stats.passthru, carryPass, muxLuts: stats.muxLuts || 0,
      unusedInputs: stats.unusedInputs || 0, slicem: stats.slicem, brams: insts.filter(s => s.kind === 'bram').length, mults: insts.filter(s => s.kind === 'mult').length,
      dcms: insts.filter(s => s.kind === 'dcm').length,
    },
    warnings,
  };
  return out;
}
