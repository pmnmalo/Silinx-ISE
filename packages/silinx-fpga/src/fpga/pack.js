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
import { mountPrep } from './pack-prep.js';
import { mountSlices } from './pack-slices.js';
import { mountIobRegs } from './pack-iobregs.js';
import { mountCarry } from './pack-carry.js';
import { mountMuxes } from './pack-muxes.js';
import { mountMemories } from './pack-mems.js';
import { mountLuts } from './pack-luts.js';
import { mountIobSettings } from './pack-iobcfg.js';
import { mountBram } from './pack-bram.js';
import { mountDcmMult } from './pack-dcm-mult.js';
import { mountPads } from './pack-pads.js';
import { mountNets } from './pack-nets.js';
import { mountConfig } from './pack-cfg.js';

export class PackError extends Error {}

// ------------------------------------------------------------------ cells
export const LUT_K = { LUT1: 1, LUT2: 2, LUT3: 3, LUT4: 4 };
// flip-flops and latches: the pin of the set / reset, whether it sets, whether it is synchronous
const FF_KIND = {
  FDRE: { sr: 'R', high: false, sync: true }, FDSE: { sr: 'S', high: true, sync: true },
  FDCE: { sr: 'CLR', high: false, sync: false }, FDPE: { sr: 'PRE', high: true, sync: false },
  FD: { sr: null }, FDE: { sr: null }, FDR: { sr: 'R', high: false, sync: true }, FDS: { sr: 'S', high: true, sync: true },
  FDC: { sr: 'CLR', high: false, sync: false }, FDP: { sr: 'PRE', high: true, sync: false },
  LDCE: { sr: 'CLR', high: false, sync: false, latch: true }, LDPE: { sr: 'PRE', high: true, sync: false, latch: true },
  LD: { sr: null, latch: true }, LDE: { sr: null, latch: true },
};
export const ffKind = type => {
  const m = /^(\w+?)(_1)?$/.exec(type);
  const k = m && FF_KIND[m[1]];
  return k ? { ...k, neg: !!m[2] } : null;
};
export const MUXF = { MUXF5: 5, MUXF6: 6, MUXF7: 7, MUXF8: 8 };
// cells in the LUTs of a SLICEM (the left column of a CLB): distributed RAMs and shift registers
export const SLICEM_MEM = {
  RAM16X1S: 'ram', RAM16X1D: 'ramd', RAM32X1S: 'ram32',
  SRL16: 'srl', SRL16E: 'srl', SRL16_1: 'srl', SRL16E_1: 'srl', SRLC16: 'srl', SRLC16E: 'srl', SRLC16_1: 'srl', SRLC16E_1: 'srl',
};
// block RAMs (single port: port A) and multipliers
export const BRAM_TYPE = /^RAMB16_S(1|2|4|9|18|36)(_S(1|2|4|9|18|36))?$/;
export const MULT_TYPE = /^MULT18X18(S|SIO)?$/;
export const DCM_TYPE = /^DCM(_SP)?$/;
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
export const clean = s => String(s).replace(/^\\/, '').replace(/[\s"\\:]/g, '_');
export const escCfg = clean;

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
export const CRIT_PAIR = 0.8, CRIT_BONUS = 8, CRIT_SLICES = 0.02;
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
    if (/^BUFG(MUX(_1)?)?$/.test(t) || t === 'DCM' || t === 'DCM_SP') return -Infinity;
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
  // ---------------------------------------------------------------- the netlist, prepared (pack-prep.js)
  const { carryPass, cells, ci, cons, driverCell, instLocs, isLut, liveCells, loadsOf, nets, parsedUcf, relabel } = mountPrep({
    nl, ucf
  });

  // ---------------------------------------------------------------- the placed elements (pack-slices.js)
  const { ctrlOk, extra, ffs, insts, lutFor, lutOf, newSlice, otherLoads, placeFf, placeLut, setBypass, setSink, sink, stats, tapOf, uniqueName, uniqueNet, where } = mountSlices({
    cells, ci, driverCell, isLut, loadsOf, nets
  });

  // ---------------------------------------------------------------- registers in the IOBs (#96) (pack-iobregs.js)
  const { absorbFf, ffsOn, iobDdr, iobFf, strParam } = mountIobRegs({
    iobRegs, nl, cells, ci, ctrlOk, driverCell, ffs, liveCells, loadsOf, nets, parsedUcf, placeFf, warnings, where
  });

  // ---------------------------------------------------------------- carry chains (pack-carry.js)
  const { macros } = mountCarry({
    carryOut, absorbFf, cells, ci, driverCell, insts, isLut, liveCells, loadsOf, lutFor, nets, newSlice, otherLoads,
    placeLut, setBypass, setSink, stats, tapOf, where
  });

  // ---------------------------------------------------------------- wide multiplexers (pack-muxes.js)
  mountMuxes({
    absorbFf, cells, ci, driverCell, loadsOf, lutFor, macros, newSlice, otherLoads, relabel, setBypass, setSink, stats,
    where
  });

  // ---------------------------------------------------------------- distributed RAMs and shift registers (pack-mems.js)
  mountMemories({
    cells, ci, extra, ffsOn, insts, liveCells, macros, nets, newSlice, placeFf, placeLut, setBypass, setSink, sink,
    stats, where
  });

  // ---------------------------------------------------------------- the rest: LUTs and flip-flops (pack-luts.js)
  mountLuts({
    timing, cells, ci, ctrlOk, ffs, ffsOn, insts, isLut, loadsOf, lutOf, nets, newSlice, otherLoads, placeFf, placeLut,
    where
  });

  // ---------------------------------------------------------------- the sites of the pads' registers, block RAMs, DCMs and
  // multipliers, which the pads and clock buffers below place
  const multBelow = new Map();   // the multiplier cascade (#2): cell -> the multiplier whose BCOUT is its BCIN
  // the settings of an IOB's registers and DDR registers (#96); a site of its own whose pins are the cell's (pack-iobcfg.js)
  const { hardSite, iobDdrSinks, iobInputDdr, iobInputReg, iobOutputDdr, iobOutputRegs, iobRegSinks } = mountIobSettings({
    part, cells, ci, extra, insts, nets, setSink, strParam, where
  });

  // block RAMs (pack-bram.js)
  const { packBram } = mountBram({
    ci, hardSite, nets
  });

  // DCMs and multipliers (pack-dcm-mult.js)
  const { packDcm, packMult } = mountDcmMult({
    cells, ci, extra, hardSite, instLocs, multBelow, nets
  });

  // ---------------------------------------------------------------- pads and clock buffers (pack-pads.js)
  const { multChains } = mountPads({
    nl, cells, ci, cons, extra, insts, iobDdr, iobDdrSinks, iobFf, iobInputDdr, iobInputReg, iobOutputDdr,
    iobOutputRegs, iobRegSinks, liveCells, loadsOf, multBelow, nets, packBram, packDcm, packMult, setSink, stats, where
  });

  // ---------------------------------------------------------------- site pins of every connection (pack-nets.js)
  const { outNets } = mountNets({
    cells, extra, insts, macros, nets, setSink, sink, tapOf, uniqueNet, warnings, where
  });

  // ---------------------------------------------------------------- configuration strings (pack-cfg.js)
  mountConfig({
    insts, uniqueName
  });

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
    multChains,
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
