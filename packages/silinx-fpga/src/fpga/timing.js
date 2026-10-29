// Silinx - timing of a placed and routed Spartan-3E design (browser + Node): a delay model of the
// wires and the logic of the XC3S250E speed grade -4, and a static timing analysis (STA) over it.
//
// The delay model is our own: fitted to what Xilinx ISE's timing analyzer (trce) and delay report
// (reportgen -delay) say about designs placed and routed by Silinx (research/s3e-route/timing-fit.mjs,
// method and errors in research/s3e-route/README.md, "Timing"). No Xilinx data file is read or copied:
// only the fitted numbers below.
//
// - Wires: every routing node of the device graph (core/fpga/device.js) gets a class from the names
//   of its wires (OMUX, double, hex, long line, input multiplexer, clock, site pin…); the delay of a
//   connection (driver pin -> load pin) is the sum of the delays of the nodes it goes through after
//   the driver's pin, each node's delay growing with the number of branches the net takes off it.
// - Logic: the delay of each path through a slice (an input pin to an output pin: a LUT, the F5 / F6
//   multiplexers, the carry chain), the clock-to-out of the flip-flops and the setup time of each way
//   into them, from the slice's configuration (its cfg string), for SLICEL and SLICEM.
//
//   const sta = analyzeTiming(design, device)       // design: parseXdl() of a routed (or placed) XDL
//   sta.period                                      // the minimum clock period (ns), the worst clock
//   sta.clocks                                      // [{ clock (net name), period, path: [{ inst, pin, kind, delay, arrival }] }]
//   sta.conns                                       // every connection: { net, from, to, delay, slack, crit }
//
// The router (core/fpga/route.js) uses nodeDelays() for its timing-driven cost and timingGraph() to
// recompute the criticalities of the connections as the routing changes.
import { clockSources } from './timing-checks.js';
import { instArcs } from './timing-arcs.js';
export { instArcs } from './timing-arcs.js';
export {
  checkCross, checkOffsets, checkPeriods, checkSwitching, clockPort, clockRequirement, clockSources, parseOffsets,
  switchingLine, timingReport,
} from './timing-checks.js';

// ------------------------------------------------------------------ the model (ns, XC3S250E -4)
/** Classes of routing nodes. */
export const WIRE = { PIN: 0, OUT: 1, OMUX: 2, DOUBLE: 3, HEX: 4, LONG: 5, IMUX: 6, GCLK: 7, IO: 8, OTHER: 9, HARD_IN: 10, HARD_OUT: 11 };
export const WIRE_NAMES = ['pin', 'out', 'omux', 'double', 'hex', 'long', 'imux', 'gclk', 'io', 'other', 'hard_in', 'hard_out'];

// a multiplier's A / B -> P[j], trce's (#457)
const MULT_P = [3.657, 3.657, 3.657, 3.657, 3.657, 3.657, 4.086, 4.344, 4.447, 4.525, 4.602, 4.654, 4.705, 4.757, 4.808, 4.834, 4.860,
  ...new Array(19).fill(4.873)];

/**
 * The fitted model (research/s3e-route/timing-fit.mjs on 10 486 connections of seven placements of
 * blinky and lab11 routed by Silinx, with and without timing, ISE 14.7 reportgen -delay as the
 * reference: rms error 0.099 ns per connection, 95% within 0.19 ns). wire[c]: delay of a node of
 * class c on the path (indexed by WIRE); branch[c]: added per extra branch the net takes off that node (its load); source: the same at the driver's pin; base:
 * the fixed part of every routed connection. dist: the estimate of an unrouted connection from the
 * Manhattan distance d in tiles: base + perTile x min(d, knee) + far x (d - knee) beyond the knee (long
 * lines). slice / pad: the logic, from trce's reports of the same designs (the delay of each kind of
 * path through a slice, SLICEL and SLICEM; the values not seen in a report are marked "est.":
 * derived from those that are).
 */
export const SPEED_4 = {
  base: -0.103,
  source: 0.049,
  // (hard_in / hard_out: the block-RAM interconnect wires into and out of a block RAM or multiplier, BRAM_DIA_B…,
  // BRAM_DOA…, BRAM_MOUT…: fitted on their own, #457: 1 108 and 853 connections of the designs of the bram /
  // mult arcs below, rms error 0.167 and 0.095 ns; out of a block, ISE's delay is that of the wires after it)
  wire: [0, 0, 0.345, 0.269, 0.350, 0.445, 0.208, 0.414, 0.162, 0.3, 0.240, 0],
  branch: [0, 0, 0.027, 0.013, 0.018, 0, 0.213, 0.033, 0, 0, 0, 0],
  // added at a LUT's input pin 1..4 (F1 / G1 … F4 / G4): ISE's delay differs by the pin (#1359: fitted on the residuals
  // of 31 748 connections of 9 designs, reportgen -delay; the same in every design, inputs 3 and 4 the fastest; the
  // common offset set on trce's periods of 114 routings: mean −0.37 % → +0.09 %)
  lutPin: [0.06, 0, -0.06, -0.05],
  dist: { base: 0.55, perTile: 0.1, knee: 12, far: 0.03 },
  // logic: [SLICEL, SLICEM]
  slice: {
    Tilo: [0.704, 0.759],      // F1-4 -> X, G1-4 -> Y (LUT)
    Tif5: [0.875, 1.033],      // F1-4 / G1-4 -> F5 (LUT and F5 multiplexer)
    Tif5x: [1.025, 1.152],     // F1-4 / G1-4 -> X through the F5 multiplexer
    Tbxf5: [0.589, 0.687],     // BX (select) -> F5
    Tbxx: [0.739, 0.806],      // BX (select) -> X through F5 (est.)
    Tinafx: [0.463, 0.364],    // FXINA / FXINB -> FX (F6..F8 multiplexer)
    Tif6y: [0.521, 0.409],     // FXINA / FXINB -> Y
    Tbyfx: [0.589, 0.687],     // BY (select) -> FX (est.)
    Tbyy: [0.850, 0.850],      // BY (select) -> Y
    Topcyf: [0.953, 0.953],    // F1-4 -> COUT
    Topcyg: [0.888, 0.888],    // G1-4 -> COUT
    TopcyfDI: [1.162, 1.162],  // F1 / F2 -> COUT when it is also the carry's data input (CY0F) (trce: 1.162 the worst)
    TopcygDI: [1.131, 1.131],  // G1 / G2 -> COUT when it is also the carry's data input (CY0G)
    Tbycy: [0.945, 0.945],     // BY (CY0G) -> COUT
    Tbxcy: [1.095, 1.106],     // BX (CYINIT) -> COUT
    Tbyp: [0.118, 0.130],      // CIN -> COUT
    Tcinx: [0.462, 0.497],     // CIN -> X (XOR)
    Tciny: [0.869, 0.883],     // CIN -> Y (through the F stage and the G XOR)
    Topx: [0.85, 0.9],         // F1-4 -> X (XOR) (est.)
    Topy: [1.641, 1.641],      // F1-4 -> Y (carry of the F stage, G XOR)
    Togy: [0.9, 0.95],         // G1-4 -> Y (XOR) (est.)
    Tbxxor: [1.0, 1.0],        // BX (CYINIT) -> X / Y through the XOR (est.)
    Tbxy: [1.574, 1.574],      // BX (CY0F, the F stage's carry data input) -> Y (the G XOR)
    TckoX: [0.591, 0.592],     // CLK -> XQ
    TckoY: [0.587, 0.652],     // CLK -> YQ
    Tdxck: [0.133, 0.133],     // setup of the flip-flop from the X / Y path (added to the path to X / Y)
    Tdick: [0.308, 0.308],     // BX -> flip-flop X (DXMUX = 0)
    Tdyck: [0.361, 0.382],     // BY -> flip-flop Y (DYMUX = 0)
    Tceck: [0.555, 0.555],     // CE (est.)
    Tsrck: [0.910, 0.910],     // SR
  },
  // Tiopi pad -> I, Tioop O1 -> pad: fitted with the clock below (#26); the IOB registers' (#96): estimates until
  // trce's reports of designs with them are measured
  pad: { Tiopi: 1.253, Tioop: 3.257, Tiockiq: 0.6, Tioock: 0.5, Tiotck: 0.5 },
  // the pads and the global clocks (#26): fitted to trce's data sheet (setup / hold of the inputs, clock to pad, pad
  // to pad) of lab11 placed and routed by Silinx and by ISE (research/s3e-route/README.md, "Pad paths"): a global
  // clock reaches every flip-flop at once (trce's clock skew 0.000 ns), Tgclk after its pad, minScale x that at
  // the earliest; trce's shortest paths are minScale x the model's; hold: a flip-flop's data hold time
  clock: {
    Tgclk: 3.045, minScale: 0.751, hold: -1.018,
    // a DCM's clocks (#601), each on a global buffer: from the arrival at its CLKIN to the flip-flops' (trce's clock path:
    // the input, Tdcmino, the buffer and the global line), fitted as Tgclk above with the model's data paths to trce's
    // data sheet of Silinx's routing of six DCM designs (research/s3e-route/dcm-timing.mjs, dcm-timing-compare.mjs:
    // 27 setup, 27 hold, 27 clock to pad). [latest (clock to pad), earliest (setup), hold] ns: pad, CLKIN from a pad
    // (deskewed, DESKEW_ADJUST 7, SYSTEM_SYNCHRONOUS); global, CLKIN from a global line (a cascade: after the first
    // DCM's clock); tap, each tap of DESKEW_ADJUST below 7 later (0: SOURCE_SYNCHRONOUS), from trce's Tdcmino. Between
    // two outputs trce counts no skew (within ±0.02 ns) and no uncertainty (0 on the Spartan-3E).
    dcm: { pad: [-1.097, -2.150, -0.735], global: [0.02, 0.015, 0.02], tap: [0.176, 0.26, 0.176] },
  },
  // the SLICEM's RAMs and shift registers: trce's values (research/s3e-route/timing-fit.mjs --arcs, #443: the srl
  // and dram fixtures, feat_srl, feat_srl_var, hard_prim; the same on either clock edge)
  mem: {
    Treg: 3.762,      // CLK -> X / Y of a shift register (the stage at the address after the shift)
    Tshcko: 1.956,    // CLK -> X / Y of a RAM (the word written, at the read address)
    Tshckof5: 2.349,  // CLK -> X of a RAM32X1S through the F5 multiplexer
    TdsX: 0.414,      // BX (data in) setup
    TdsY: 0.442,      // BY (data in) setup, into G
    TdsAlt: 0.461,    // BY setup into F too (DIF_MUX = ALTDIF: a dual-port RAM's, a RAM32X1S's)
    Tbxs: 0.619,      // BX (a RAM32X1S's write address A4, SLICEWE0) setup
    Tas: 0.522,       // F1-4 / G1-4 (address) setup of a write
    Tws: 0.392,       // SR (write / shift enable) setup
  },
  // block RAMs and multipliers: trce's values (research/s3e-route/timing-fit.mjs --arcs, #457: hard_prim, feat_bram,
  // feat_const_bram, feat_mult, feat_const_mult, feat_constmult, stopwatch and two designs of multipliers with input
  // registers); a block RAM's are the same at every width and write mode, a multiplier's through it grow with the
  // product bit (P0..P5 the same, P17..P35 the same)
  bram: {
    Tbcko: 2.812,     // CLKA / CLKB -> DO / DOP
    Tback: 0.377,     // ADDR setup
    Tbdck: 0.227,     // DI / DIP setup
    Tbeck: 0.770,     // EN setup
    Tbwck: 1.253,     // WE setup
    Tbrck: 0.705,     // SSR setup
  },
  mult: {
    Tmult: MULT_P,                                                     // A / B -> P[j] (no register on the way)
    Tmsckp: MULT_P.map((d, j) => +(d + (j < 6 ? 0.26 : 0.089)).toFixed(3)),   // CLK -> P[j] from the input registers (AREG / BREG)
    TmsckpP: 1.100,   // CLK -> P from the product register (PREG)
    TmsdckP: 3.980,   // A / B setup into the product register (PREG, the input not registered)
    TmsdckA: 0.223,   // A setup into AREG
    TmsdckB: 0.384,   // B setup into BREG
    Tmscck: 0.735,    // CEA / CEB / CEP setup
    Tmsrck: 0.736,    // RSTA / RSTB / RSTP setup
  },
};

// ------------------------------------------------------------------ wire classes
const RE_LONG = /(^|_)L[HV]\d+$/, RE_HEX = /(^|_)[NSEW]6(BEG|A|B|MID|C|D|END)(_[NSEW])?\d+$/, RE_DOUBLE = /(^|_)[NSEW]2(BEG|MID|END)(_[NSEW])?\d+$/;
const RE_IMUX = /(^|_)([FG][1-4]_B|B[XY]|CE_B|SR|CLK)\d+$/;
const RE_HARD_IN = /^BRAM_(DI[AB]_B|DIP[AB]_B|ADDR[AB]_B|MULTIN[AB]_B)\d+$/, RE_HARD_OUT = /^BRAM_(DO[AB]|DOP[AB]|MOUT)\d+$/;

/** The class of a node from the names of its wires and whether it is a site pin (WIRE.*). */
export function classOfWires(names, isPin = false, isOutPin = false) {
  if (isOutPin) return WIRE.OUT;
  if (isPin) return WIRE.PIN;
  let c = WIRE.OTHER;
  for (const n of names) {
    if (/TESTWIRE/.test(n)) continue;
    if (RE_LONG.test(n)) return WIRE.LONG;
    if (RE_HEX.test(n)) c = WIRE.HEX;
    else if (RE_DOUBLE.test(n) && c !== WIRE.HEX) c = WIRE.DOUBLE;
    else if (/OMUX/.test(n) && c === WIRE.OTHER) c = WIRE.OMUX;
    else if (/GCLK/.test(n) && c === WIRE.OTHER) c = WIRE.GCLK;
    else if (RE_IMUX.test(n) && c === WIRE.OTHER) c = WIRE.IMUX;
    else if (/^IOIS_/.test(n) && c === WIRE.OTHER) c = WIRE.IO;
    else if (RE_HARD_IN.test(n) && c === WIRE.OTHER) c = WIRE.HARD_IN;
    else if (RE_HARD_OUT.test(n) && c === WIRE.OTHER) c = WIRE.HARD_OUT;
  }
  return c;
}

/** The class of every node of the device (cached on it): Uint8Array. */
export function nodeClasses(device) {
  if (device._wireClass) return device._wireClass;
  const N = device.nodeCount;
  const pin = new Uint8Array(N);    // 1 input pin, 2 output pin
  for (let k = 0; k < device.tileCount; k++) {
    const tp = device.templates[device.tileTemplate[k]];
    for (const s of tp.sites) for (const p of s.pins.values()) {
      const n = device.nodeOf[device.tileWireBase[k] + p.wire];
      pin[n] = p.dir === 'o' ? 2 : pin[n] || 1;
    }
  }
  const cls = new Uint8Array(N);
  for (let n = 0; n < N; n++) {
    const names = [];
    for (let j = device.nodeStart[n]; j < device.nodeStart[n + 1]; j++) {
      const w = device.nodeWires[j], k = device.wireTile[w];
      names.push(device.names[device.templates[device.tileTemplate[k]].wires[w - device.tileWireBase[k]]]);
    }
    cls[n] = classOfWires(names, pin[n] === 1, pin[n] === 2);
  }
  return (device._wireClass = cls);
}

/** The LUT input of every node that is a slice's F1-F4 / G1-G4 pin: 1..4, 0 for any other node (cached on the
 *  device): Uint8Array. */
export function lutPinIndex(device) {
  if (device._lutPin) return device._lutPin;
  const idx = new Uint8Array(device.nodeCount);
  for (let k = 0; k < device.tileCount; k++) {
    const tp = device.templates[device.tileTemplate[k]];
    for (const s of tp.sites) {
      if (!/^SLICE/.test(s.type)) continue;
      for (const [name, p] of s.pins) if (p.dir !== 'o' && /^[FG][1-4]$/.test(name)) idx[device.nodeOf[device.tileWireBase[k] + p.wire]] = +name[1];
    }
  }
  return (device._lutPin = idx);
}

/** The delay of each node of the device for a model (ns): Float32Array (cached per model). */
export function nodeDelays(device, model = SPEED_4) {
  device._nodeDelay ||= new Map();
  if (device._nodeDelay.has(model)) return device._nodeDelay.get(model);
  const cls = nodeClasses(device);
  const lut = lutPinIndex(device), lp = model.lutPin || [0, 0, 0, 0];
  const d = new Float32Array(cls.length);
  for (let n = 0; n < cls.length; n++) d[n] = model.wire[cls[n]] + (lut[n] ? lp[lut[n] - 1] : 0);
  device._nodeDelay.set(model, d);
  return d;
}

// ------------------------------------------------------------------ routed nets
/**
 * The routing tree of a routed net: from its source nodes through its PIPs. Returns
 * { parent: Map node -> parent node (-1 for a source), children: Map node -> count } or null when a
 * PIP is not in the device.
 */
export function netTree(pips, sources, device) {
  const adj = new Map();
  const edge = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
  for (const p of pips) {
    const k = device.tile(p.tile);
    const i = k === undefined ? -1 : device.findPip(k, p.from, p.to);
    if (i < 0) return null;
    const [a, b] = device.pipNodes(k, i);
    edge(a, b);
    if (device.pipIsBidi(k, i)) edge(b, a);
  }
  const parent = new Map(), children = new Map();
  const q = [];
  for (const s of sources) if (!parent.has(s)) { parent.set(s, -1); q.push(s); }
  while (q.length) {
    const a = q.shift();
    for (const b of adj.get(a) || []) if (!parent.has(b)) { parent.set(b, a); children.set(a, (children.get(a) || 0) + 1); q.push(b); }
  }
  return { parent, children };
}

/** The nodes from the source to `sink` in a tree (source first), or null when not reached. */
export function treePath(tree, sink) {
  if (!tree.parent.has(sink)) return null;
  const path = [];
  for (let n = sink; n !== -1; n = tree.parent.get(n)) path.push(n);
  return path.reverse();
}

/** The delay of a routed connection: the nodes of its path (source first) in a tree. A dedicated
 *  connection (no general routing wire on it: carry chain, F5 / FX -> FXIN) takes no time. */
export function pathDelay(path, tree, device, model = SPEED_4) {
  const cls = nodeClasses(device);
  let d = model.base + model.source * Math.max(0, (tree.children.get(path[0]) || 0) - 1), routed = false;
  for (let j = 1; j < path.length; j++) {
    const n = path[j], c = cls[n];
    if (c > WIRE.OUT) routed = true;
    d += model.wire[c] + model.branch[c] * Math.max(0, (tree.children.get(n) || 0) - 1);
  }
  const lut = model.lutPin && lutPinIndex(device)[path[path.length - 1]];
  return routed ? d + (lut ? model.lutPin[lut - 1] : 0) : 0;
}

/** The estimated delay of an unrouted connection between two nodes (Manhattan distance in tiles). */
export function distanceDelay(a, b, device, model = SPEED_4) {
  const d = Math.abs(device.nodeR0[a] - device.nodeR0[b]) + Math.abs(device.nodeC0[a] - device.nodeC0[b]);
  const { base, perTile, knee, far } = model.dist;
  return base + perTile * Math.min(d, knee) + far * Math.max(0, d - knee);
}

/** The kinds of connection the delay table tells apart (#104): from a combinational output (X, Y,
 *  and any other driver pin) or from a flip-flop's (XQ, YQ). A flip-flop's output reaches every input
 *  through an output multiplexer (OMUX), its own CLB's too, where X / Y have the CLB's fast connects
 *  and drive doubles straight from the pin. */
export const DELAY_KIND = { COMB: 0, REG: 1 };
export const delayKind = fromPin => (fromPin === 'XQ' || fromPin === 'YQ' ? DELAY_KIND.REG : DELAY_KIND.COMB);

/**
 * The delay of the fastest route from a slice's outputs to the slices' inputs at each offset, by the
 * model and the device's own wires (for the placer: what a connection over a distance costs once
 * routed, the direct connections to the neighbours and the reach of hexes and long lines included).
 * From each of a few CLBs spread over the device, a search by delay (Dijkstra, no congestion) from
 * the X and Y pins of its slices, and another from their XQ and YQ pins (DELAY_KIND), to the LUT and
 * BX / BY pins of every slice; the delay at an offset (columns, rows: tiles) is the mean over the
 * target's pins of the fastest arrival, averaged over the source CLBs. allowPip(tileName, from, to):
 * only these PIPs (as the router). Returns { at(dc, dr, kind = COMB) -> ns, dc0, dr0, w, h, d:
 * Float32Array (the two kinds' tables one after the other, w x h each) } (cached on the device per
 * allowPip and model).
 */
export function delayTable(device, { allowPip = null, model = SPEED_4, sources = null } = {}) {
  device._delayTable ||= new Map();
  const key = allowPip || 'all';
  const cached = device._delayTable.get(key);
  if (cached && cached.model === model && !sources) return cached.table;
  const E = device.routingEdges();
  const N = device.nodeCount;
  const ndel = nodeDelays(device, model);
  const ok = new Uint8Array(E.edgeTo.length);   // 0 undecided, 1 allowed, 2 not
  const edgeOk = e => {
    if (!ok[e]) {
      if (E.edgeFlags[e] & 2) ok[e] = 2;     // route-through (core/fpga/device.js PIP_ROUTETHRU)
      else if (!allowPip) ok[e] = 1;
      else { const [a, b] = device.pipWires(E.edgeTile[e], E.edgePip[e]); ok[e] = allowPip(device.tileNames[E.edgeTile[e]], a, b) ? 1 : 2; }
    }
    return ok[e] === 1;
  };
  // the CLBs: tile of each slice
  const clbs = new Map();     // tile index -> [slice names]
  for (const s of [...device.sites('SLICEL'), ...device.sites('SLICEM')]) { if (!clbs.has(s.tile)) clbs.set(s.tile, []); clbs.get(s.tile).push(s.name); }
  const tiles = [...clbs.keys()];
  const rows = tiles.map(k => device.tileRow[k]), cols = tiles.map(k => device.tileCol[k]);
  const r0 = Math.min(...rows), r1 = Math.max(...rows), c0 = Math.min(...cols), c1 = Math.max(...cols);
  const h = 2 * (r1 - r0) + 1, w = 2 * (c1 - c0) + 1, dc0 = c1 - c0, dr0 = r1 - r0;
  const WH = w * h;
  const sum = new Float64Array(2 * WH), cnt = new Float64Array(2 * WH);
  // source CLBs: the one nearest the centre and four around it, halfway to the corners
  const nearest = (r, c) => tiles.reduce((b, k) => (Math.abs(device.tileRow[k] - r) + Math.abs(device.tileCol[k] - c) < Math.abs(device.tileRow[b] - r) + Math.abs(device.tileCol[b] - c) ? k : b), tiles[0]);
  const mr = (r0 + r1) / 2, mc = (c0 + c1) / 2, qr = (r1 - r0) / 4, qc = (c1 - c0) / 4;
  const srcTiles = sources || [...new Set([[mr, mc], [mr - qr, mc - qc], [mr - qr, mc + qc], [mr + qr, mc - qc], [mr + qr, mc + qc]].map(([r, c]) => nearest(Math.round(r), Math.round(c))))];
  const g = new Float64Array(N);
  const heapK = [], heapV = [];
  const push = (k, v) => {
    let i = heapK.length; heapK.push(k); heapV.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (heapK[p] <= k) break; heapK[i] = heapK[p]; heapV[i] = heapV[p]; i = p; }
    heapK[i] = k; heapV[i] = v;
  };
  const pop = () => {
    const top = heapV[0], k = heapK.pop(), v = heapV.pop(), n = heapK.length;
    if (!n) return top;
    let i = 0;
    for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && heapK[c + 1] < heapK[c]) c++; if (heapK[c] >= k) break; heapK[i] = heapK[c]; heapV[i] = heapV[c]; i = c; }
    heapK[i] = k; heapV[i] = v;
    return top;
  };
  const OUT_PINS = [['X', 'Y'], ['XQ', 'YQ']], IN_PINS = ['F1', 'F2', 'F3', 'F4', 'G1', 'G2', 'G3', 'G4', 'BX', 'BY'];
  for (const st of srcTiles) for (const kind of [DELAY_KIND.COMB, DELAY_KIND.REG]) {
    g.fill(Infinity);
    heapK.length = 0; heapV.length = 0;
    for (const s of clbs.get(st)) for (const p of OUT_PINS[kind]) { const n = device.sitePinNode(s, p); if (n >= 0) { g[n] = 0; push(0, n); } }
    while (heapK.length) {
      const d = heapK[0], n = pop();
      if (d > g[n]) continue;
      for (let e = E.edgeStart[n]; e < E.edgeStart[n + 1]; e++) {
        const m = E.edgeTo[e], dm = d + ndel[m];
        if (dm < g[m] && edgeOk(e)) { g[m] = dm; push(dm, m); }
      }
    }
    for (const [k, names] of clbs) {
      let s = 0, c = 0;
      for (const sn of names) for (const p of IN_PINS) { const n = device.sitePinNode(sn, p); if (n >= 0 && g[n] < Infinity) { s += g[n]; c++; } }
      if (!c) continue;
      const i = kind * WH + (device.tileRow[k] - device.tileRow[st] + dr0) * w + (device.tileCol[k] - device.tileCol[st] + dc0);
      sum[i] += s / c + model.base; cnt[i]++;
    }
  }
  // a device whose slices have no flip-flop outputs (a test's): their table is the X / Y outputs'
  if (!cnt.subarray(WH).some(Boolean)) { sum.copyWithin(WH, 0, WH); cnt.copyWithin(WH, 0, WH); }
  const d = new Float32Array(2 * WH);
  for (let i = 0; i < d.length; i++) if (cnt[i]) d[i] = sum[i] / cnt[i];
  // offsets no source CLB has a CLB at (rows of clock tiles, block-RAM columns, beyond the
  // device): from their neighbours, outwards
  for (const o of [0, WH]) {
    for (let filled = true; filled;) {
      filled = false;
      const next = cnt.slice(o, o + WH);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = o + y * w + x;
        if (cnt[i]) continue;
        let s = 0, c = 0;
        for (const [u, v] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) if (u >= 0 && v >= 0 && u < w && v < h && cnt[o + v * w + u]) { s += d[o + v * w + u]; c++; }
        if (c) { d[i] = s / c; next[i - o] = 1; filled = true; }
      }
      cnt.set(next, o);
    }
  }
  // rows count down the device: dr is in tile rows, as the placer's y counts up (dr = -dy)
  const table = {
    dc0, dr0, w, h, d,
    at(dc, dr, kind = DELAY_KIND.COMB) {
      const x = Math.max(0, Math.min(w - 1, Math.round(dc) + dc0)), y = Math.max(0, Math.min(h - 1, Math.round(dr) + dr0));
      return d[kind * WH + y * w + x];
    },
  };
  if (!sources) device._delayTable.set(key, { model, table });
  return table;
}

// ------------------------------------------------------------------ static timing analysis
const isConstNet = n => /^(vcc|gnd|power|ground|vdd)$/i.test(n.type || '');
// an instance clocked on the falling edge: its clock inverted (a slice's CLKINV, a block RAM's CLKAINV / CLKBINV, a
// multiplier's CLKINV = *_B; a latch with an active-high gate, CLK_B, closes on the falling edge too)
const fallingEdge = inst => (inst.cfg.some(c => /^(CLK[AB]?|ICLK[12]|OTCLK[12])INV$/.test(c.attr) && /_B$/.test(c.value)) ? 1 : 0);
// the clock pins of the sites (an IOB's registers': ICLK1, OTCLK1, #96; ICLK2, OTCLK2 on the second flip-flops, #749)
export const CLOCK_PIN = /^(CLK[AB]?|ICLK[12]|OTCLK[12])$/;
// an IOB register's pin (IQk after its clock, Ok / Tk before it) -> its clock pin: an IOB's registers may have two
// clocks, or both edges of one (the DDR registers, #96: ICLK2INV::ICLK2_B on C0's net)
const ioClockPin = pin => { const m = /^(IQ|O|T)([12])$/.exec(pin); return m ? `${m[1] === 'IQ' ? 'ICLK' : 'OTCLK'}${m[2]}` : null; };
// the edge of the clock at an instance's clock pin (an IOB's: its own inverter; the others: the instance's)
const edgeAt = (inst, clockPin) => {
  if (!/^(ICLK|OTCLK)[12]$/.test(clockPin || '')) return fallingEdge(inst);
  const c = inst.cfg.find(x => x.attr === `${clockPin}INV`);
  return c && /_B$/.test(c.value) ? 1 : 0;
};

/**
 * The timing graph of a design (parseXdl's structure, placed; routed or not): the pins of the
 * instances, the connections of the nets (driver pin -> load pin; not the clocks, not the
 * constants) and the arcs through the instances. Returns { conns: [{ net, fromPin: { inst, pin },
 * toPin }], connIndex: Map 'net\0inst\0pin' -> index, pins, analyze(connDelay) }.
 * analyze(connDelay: delay of each connection, ns) -> { period, clocks: [{ clock, period, path }],
 * slack: Float64Array, crit: Float64Array } covers the paths from a flip-flop to a flip-flop on the
 * same clock net (what trce's "minimum period" of each clock covers); the criticality of a
 * connection is 1 - slack / period, the slack taken against the worst clock's period. A path between
 * the clock's two edges (a rising-edge flip-flop into a falling-edge one, CLKINV = CLK_B, or back)
 * has half a period: it limits the period to twice its delay, as trce counts it (#442; the clock's
 * `half`: its critical path is one).
 */
export function timingGraph(design, model = SPEED_4) {
  const pinId = new Map(), pinName = [];
  const pid = (inst, pin) => { const k = `${inst}\u0000${pin}`; let i = pinId.get(k); if (i === undefined) { i = pinName.length; pinId.set(k, i); pinName.push({ inst, pin }); } return i; };
  const instByName = new Map(design.insts.map(i => [i.name, i]));
  // the clock of each instance: the net on its CLK pin
  const clockOf = new Map();
  // (a block RAM's CLKA / CLKB: its clock too)
  const clockAt = new Map();   // 'inst\0clock pin' -> its clock net
  for (const n of design.nets) for (const p of n.inpins) if (CLOCK_PIN.test(p.pin)) { clockOf.set(p.inst, n.name); clockAt.set(`${p.inst}\u0000${p.pin}`, n.name); }
  // edges: from pin, to pin, delay, connection (-1: an arc through an instance)
  const eFrom = [], eTo = [], eDelay = [], eConn = [];
  const conns = [], connIndex = new Map();
  for (const n of design.nets) {
    if (!n.outpins.length || isConstNet(n)) continue;
    const src = n.outpins[0];
    if (/^BUFG/.test(instByName.get(src.inst)?.type || '')) continue;
    for (const p of n.inpins) {
      if (CLOCK_PIN.test(p.pin)) continue;
      const c = conns.length;
      conns.push({ net: n.name, fromPin: src, toPin: p });
      connIndex.set(`${n.name}\u0000${p.inst}\u0000${p.pin}`, c);
      eFrom.push(pid(src.inst, src.pin)); eTo.push(pid(p.inst, p.pin)); eDelay.push(0); eConn.push(c);
    }
  }
  const starts = [], ends = [];   // [pin, ns, clock, edge (0 rising, 1 falling)]
  const padIns = [], padOuts = [];   // [pin, ns]: an input pad's I (its delay from the pad), an output pad's O1 (to the pad)
  for (const inst of design.insts) {
    const a = instArcs(inst, model);
    const clk = clockOf.get(inst.name) || null;
    for (const [i, o, d] of a.comb) { eFrom.push(pid(inst.name, i)); eTo.push(pid(inst.name, o)); eDelay.push(d); eConn.push(-1); }
    for (const [i, d] of a.input) if (pinId.has(`${inst.name}\u0000${i}`)) padIns.push([pid(inst.name, i), d]);
    for (const [o, d] of a.output) if (pinId.has(`${inst.name}\u0000${o}`)) padOuts.push([pid(inst.name, o), d]);
    if (!clk) continue;
    const edge = fallingEdge(inst);
    // (an IOB's register pins: their own clock pin's net and edge)
    const at = p => { const cp = ioClockPin(p); return cp ? [clockAt.get(`${inst.name}\u0000${cp}`) || clk, edgeAt(inst, cp)] : [clk, edge]; };
    for (const [o, d] of a.clkToOut) starts.push([pid(inst.name, o), d, ...at(o)]);
    for (const [i, d] of a.setup) ends.push([pid(inst.name, i), d, ...at(i)]);
  }
  const P = pinName.length, E = eFrom.length;
  // edges by from-pin, and a topological order (Kahn; pins on a combinational loop are left out)
  const outStart = new Int32Array(P + 1), indeg = new Int32Array(P);
  for (let e = 0; e < E; e++) { outStart[eFrom[e] + 1]++; indeg[eTo[e]]++; }
  for (let p = 0; p < P; p++) outStart[p + 1] += outStart[p];
  const fill = outStart.slice(0, P), outEdge = new Int32Array(E);
  for (let e = 0; e < E; e++) outEdge[fill[eFrom[e]]++] = e;
  const order = [];
  for (let p = 0; p < P; p++) if (!indeg[p]) order.push(p);
  for (let j = 0; j < order.length; j++) for (let x = outStart[order[j]]; x < outStart[order[j] + 1]; x++) { const q = eTo[outEdge[x]]; if (--indeg[q] === 0) order.push(q); }
  const clocks = [...new Set(starts.map(s => s[2]))].sort();

  function analyze(connDelay) {
    const delay = Float64Array.from(eDelay);
    for (let e = 0; e < E; e++) if (eConn[e] >= 0) delay[e] = connDelay[eConn[e]];
    const req = new Float64Array(P), prevE = new Int32Array(P);
    const crit = new Float64Array(conns.length), slack = new Float64Array(conns.length).fill(Infinity);
    const perClock = [], passes = [], cross = [];
    // the critical path, back from its end (an end: [pin, setup, clock, edge]) in a pass's arrivals
    const traceBack = (arr, wEnd) => {
      const path = [{ ...pinName[wEnd[0]], kind: 'setup', delay: wEnd[1], arrival: arr[wEnd[0]] + wEnd[1] }];
      for (let p = wEnd[0]; ;) {
        const e = prevE[p];
        path.unshift({ ...pinName[p], kind: e < 0 ? 'clock-to-out' : eConn[e] >= 0 ? 'net' : 'logic', delay: e < 0 ? arr[p] : delay[e], arrival: arr[p] });
        if (e < 0) break;
        p = eFrom[e];
      }
      return path;
    };
    for (const clk of clocks) {
      // one pass per launching edge; a path to the other edge counts twice (half a period)
      let best = null;
      for (const launch of [0, 1]) {
        if (!starts.some(s => s[2] === clk && s[3] === launch)) continue;
        const arr = new Float64Array(P).fill(-Infinity);
        prevE.fill(-1);
        for (const [p, d, c, ed] of starts) if (c === clk && ed === launch && d > arr[p]) arr[p] = d;
        for (const p of order) {
          if (arr[p] === -Infinity) continue;
          for (let x = outStart[p]; x < outStart[p + 1]; x++) { const e = outEdge[x], q = eTo[e], t = arr[p] + delay[e]; if (t > arr[q]) { arr[q] = t; prevE[q] = e; } }
        }
        passes.push({ clock: clk, launch, arr });
        // (#601: the slowest path into each other clock's flip-flops of each edge, timed against the two clocks' edges)
        const into = new Map();
        for (const end of ends) {
          if (end[2] === clk || arr[end[0]] === -Infinity) continue;
          const k = `${end[2]}\u0000${end[3]}`, t = arr[end[0]] + end[1];
          if (!into.has(k) || t > into.get(k).t) into.set(k, { t, end });
        }
        for (const { t, end } of into.values()) cross.push({ from: clk, launch, to: end[2], capture: end[3], delay: t, path: traceBack(arr, end) });
        let worst = -Infinity, wEnd = null;
        for (const end of ends) {
          if (end[2] !== clk || arr[end[0]] === -Infinity) continue;
          const t = (arr[end[0]] + end[1]) * (end[3] === launch ? 1 : 2);
          if (t > worst) { worst = t; wEnd = end; }
        }
        if (!wEnd || (best && best.period >= worst)) continue;
        best = { clock: clk, period: worst, path: traceBack(arr, wEnd), half: wEnd[3] !== launch };
      }
      if (best) perClock.push(best);
    }
    const period = perClock.reduce((a, c) => Math.max(a, c.period), 0);
    // required times against the worst period (half of it at the other edge)
    for (const c of passes) {
      req.fill(Infinity);
      for (const [p, d, k, ed] of ends) { const r = (ed === c.launch ? period : period / 2) - d; if (k === c.clock && r < req[p]) req[p] = r; }
      for (let j = order.length - 1; j >= 0; j--) {
        const p = order[j];
        for (let x = outStart[p]; x < outStart[p + 1]; x++) { const e = outEdge[x], t = req[eTo[e]] - delay[e]; if (t < req[p]) req[p] = t; }
      }
      for (let e = 0; e < E; e++) {
        const ci = eConn[e];
        if (ci < 0 || c.arr[eFrom[e]] === -Infinity || req[eTo[e]] === Infinity) continue;
        const s = req[eTo[e]] - c.arr[eFrom[e]] - delay[e];
        if (s < slack[ci]) slack[ci] = s;
      }
    }
    for (let ci = 0; ci < conns.length; ci++) crit[ci] = period > 0 && slack[ci] < Infinity ? Math.max(0, Math.min(1, 1 - slack[ci] / period)) : 0;
    return { period, clocks: perClock.map(c => ({ clock: c.clock, period: c.period, path: c.path, half: c.half })), cross, crit, slack };
  }

  // The paths at the pads and the hold check (#26), apart from the period: clockArr (Map instance -> the arrival of
  // its clock at its clock pin from the clock's pad, ns: clockArrivals) gives each flip-flop its clock's time.
  // - inputs: [{ pad, clock, setup, hold, path }]: an input pad to the setups of a clock's flip-flops, the data's
  //   arrival plus the setup minus the clock's earliest arrival there (clockArr.early, else minScale x it: trce's
  //   "pad to setup", what OFFSET IN BEFORE bounds), and the hold: the clock's arrival (clockArr.hold, else its
  //   latest) less the data's earliest (minScale x the shortest path) plus the hold time; an asynchronous set / reset
  //   is not a data input (trce leaves it out);
  // - outputs: [{ pad, clock, delay, path }]: the clock's pad through a flip-flop of that clock to an output pad
  //   (trce's "clock to pad", OFFSET OUT AFTER);
  // - padToPad: [{ from, to, delay, path }]: an input pad through logic only to an output pad;
  // - hold: [{ clock, slack, path }]: the shortest path from a flip-flop to a flip-flop of the same clock and edge,
  //   at its earliest (minScale x it), less the hold time (model.clock.hold); a global clock reaches both at once.
  // A flip-flop with no clock arrival (a clock made by logic) is left out of inputs and outputs.
  function pads(connDelay, clockArr = new Map()) {
    const delay = Float64Array.from(eDelay);
    for (let e = 0; e < E; e++) if (eConn[e] >= 0) delay[e] = connDelay[eConn[e]];
    const arr = new Float64Array(P), prevE = new Int32Array(P);
    const run = (seeds, min = false) => {
      arr.fill(min ? Infinity : -Infinity);
      prevE.fill(-1);
      for (const [p, t] of seeds) if (min ? t < arr[p] : t > arr[p]) arr[p] = t;
      for (const p of order) {
        if (!Number.isFinite(arr[p])) continue;
        for (let x = outStart[p]; x < outStart[p + 1]; x++) {
          const e = outEdge[x], q = eTo[e], t = arr[p] + delay[e];
          if (min ? t < arr[q] : t > arr[q]) { arr[q] = t; prevE[q] = e; }
        }
      }
    };
    const trace = (end, kind, d, start) => {
      const path = [{ ...pinName[end], kind, delay: d, arrival: arr[end] + d }];
      for (let p = end; ;) {
        const e = prevE[p];
        path.unshift({ ...pinName[p], kind: e < 0 ? start : eConn[e] >= 0 ? 'net' : 'logic', delay: e < 0 ? arr[p] : delay[e], arrival: arr[p] });
        if (e < 0) break;
        p = eFrom[e];
      }
      return path;
    };
    const out = { inputs: [], outputs: [], padToPad: [], hold: [] };
    const known = pin => clockArr.has(pinName[pin].inst);
    const { minScale: sc, hold: Th } = model.clock;
    const isAsync = q => pinName[q].pin === 'SR' && instByName.get(pinName[q].inst)?.cfg?.some(c => c.attr === 'SYNC_ATTR' && c.value === 'ASYNC');
    const dataEnds = ends.filter(([q]) => !isAsync(q));
    for (const [p, d] of padIns) {
      run([[p, d]], true);
      const early = Float64Array.from(arr);
      run([[p, d]]);
      const pad = pinName[p].inst;
      for (const clk of clocks) {
        let w = null, hold = -Infinity;
        for (const [e, su, c] of dataEnds) {
          if (c !== clk || !Number.isFinite(arr[e]) || !known(e)) continue;
          const ca = clockArr.get(pinName[e].inst), t = arr[e] + su - (clockArr.early?.get(pinName[e].inst) ?? sc * ca);
          if (!w || t > w.t) w = { t, e, su };
          hold = Math.max(hold, (clockArr.hold?.get(pinName[e].inst) ?? ca) - sc * early[e] + Th);
        }
        if (w) out.inputs.push({ pad, clock: clk, setup: w.t, hold, path: trace(w.e, 'setup', w.su, 'pad') });
      }
      for (const [o, d2] of padOuts) if (Number.isFinite(arr[o])) out.padToPad.push({ from: pad, to: pinName[o].inst, delay: arr[o] + d2, path: trace(o, 'pad', d2, 'pad') });
    }
    for (const clk of clocks) {
      run(starts.filter(([p, , c]) => c === clk && known(p)).map(([p, d]) => [p, clockArr.get(pinName[p].inst) + d]));
      for (const [o, d2] of padOuts) if (Number.isFinite(arr[o])) out.outputs.push({ pad: pinName[o].inst, clock: clk, delay: arr[o] + d2, path: trace(o, 'pad', d2, 'clock-to-out') });
      // hold: the shortest path, per launching edge, into the flip-flops of that edge
      let w = null;
      for (const launch of [0, 1]) {
        const seeds = starts.filter(([, , c, ed]) => c === clk && ed === launch);
        if (!seeds.length) continue;
        run(seeds.map(([p, d]) => [p, d]), true);
        for (const [e, , c, ed] of dataEnds) {
          if (c !== clk || ed !== launch || !Number.isFinite(arr[e])) continue;
          const slack = sc * arr[e] - Th;
          if (!w || slack < w.slack) w = { clock: clk, slack, path: trace(e, 'hold', -model.clock.hold, 'clock-to-out') };
        }
      }
      if (w) out.hold.push(w);
    }
    return out;
  }
  return { conns, connIndex, pins: pinName, analyze, pads };
}

/**
 * The arrival of each instance's clock at its clock pin (CLK, CLKA / CLKB, an IOB's ICLK1 / OTCLK1), from the clock's pad (ns): the input
 * pad's delay and the routed (or estimated) delays of the nets on the way; through a global buffer, model.clock.Tgclk
 * for every load (the global lines reach them all at once, #26). Through a DCM (#601): the arrival at its CLKIN plus
 * model.clock.dcm (deskewed: earlier than the pad's own global clock), and the output's phase (clockSources' first
 * edge, o x the port's PERIOD; clocks: parseUcf().clocks, no phase without one), as trce's clock arrival. A clock made
 * by logic has none (left out). Map instance name -> ns, the latest; its .early and .hold: Map instance name -> ns, the
 * earliest (setup) and the one of the inputs' hold (for a pad's clock minScale x the latest and the latest; a DCM's,
 * model.clock.dcm's).
 */
export function clockArrivals(design, device, model = SPEED_4, clocks = []) {
  const inst = new Map(design.insts.map(i => [i.name, i]));
  const pinNode = p => { const i = inst.get(p.inst); return i && i.placed ? device.sitePinNode(i.site, p.pin) : -1; };
  const netOfPin = new Map();   // 'inst\0pin' -> net (inputs)
  for (const n of design.nets) for (const p of n.inpins) netOfPin.set(`${p.inst}\u0000${p.pin}`, n);
  const { minScale: sc, Tgclk, dcm: D } = model.clock;
  const src = clockSources(design);
  const periodOf = new Map(clocks.map(k => [String(k.net).toLowerCase(), k.period]));
  const at = new Map();         // net name -> Map 'inst\0pin' -> [latest, earliest, hold] arrival at that load
  // a DCM's clocks, from the arrival at its CLKIN: [latest, earliest, hold]
  const dcmOut = (di, depth) => {
    const n = netOfPin.get(`${di.name}\u0000CLKIN`);
    const a = n && loadsOf(n, depth + 1)?.get(`${di.name}\u0000CLKIN`);
    if (!a) return null;
    const drv = inst.get(n.outpins[0]?.inst), fromPad = !!drv && /^(IOB|IBUF|DIFF[MS]I?)$/.test(drv.type);
    const taps = 7 - (parseInt(di.cfg?.find(c => c.attr === 'DESKEW_ADJUST')?.value ?? '7', 10) || 0);
    return a.map((x, k) => x + (fromPad ? D.pad : D.global)[k] + taps * D.tap[k]);
  };
  const loadsOf = (n, depth = 0) => {
    if (at.has(n.name)) return at.get(n.name);
    at.set(n.name, null);
    const drv = n.outpins[0], di = drv && inst.get(drv.inst);
    if (di && /^BUFG/.test(di.type) && depth < 8) {
      const pin = netOfPin.has(`${di.name}\u0000I0`) ? 'I0' : 'I', inNet = netOfPin.get(`${di.name}\u0000${pin}`);
      const from = inNet && inst.get(inNet.outpins[0]?.inst);
      // a global buffer's loads: all at once (trce: no clock skew on the global lines, #26); a pad's clock Tgclk after
      // the pad; a DCM's deskewed, then its phase, and a falling-edge flip-flop's edge half the output's period later
      // (trce times it from that edge, not from the pad's falling one)
      let g = null, half = 0;
      if (from && /^DCM/.test(from.type)) {
        const a = dcmOut(from, depth), s = src.get(n.name), T = s && periodOf.get(String(s.port).toLowerCase());
        if (a) g = T ? a.map(x => x + s.o * T) : a;
        if (T) half = s.f * T / 2;
      } else if (inNet && loadsOf(inNet, depth + 1)?.get(`${di.name}\u0000${pin}`)) g = [Tgclk, sc * Tgclk, Tgclk];
      if (!g) return null;
      const m = new Map(n.inpins.map(p => {
        const h = half && inst.has(p.inst) && edgeAt(inst.get(p.inst), p.pin) ? half : 0;
        return [`${p.inst}\u0000${p.pin}`, h ? g.map(x => x + h) : g];
      }));
      at.set(n.name, m);
      return m;
    }
    if (!di || !/^(IOB|IBUF|DIFF[MS]I?)$/.test(di.type)) return null;
    const s0 = pinNode(drv);
    const tree = n.pips.length && s0 >= 0 ? netTree(n.pips, [s0], device) : null;
    const m = new Map();
    for (const p of n.inpins) {
      const sink = pinNode(p);
      const path = tree && sink >= 0 ? treePath(tree, sink) : null;
      const t = model.pad.Tiopi + (path ? pathDelay(path, tree, device, model) : s0 >= 0 && sink >= 0 ? distanceDelay(s0, sink, device, model) : 0);
      m.set(`${p.inst}\u0000${p.pin}`, [t, sc * t, t]);
    }
    at.set(n.name, m);
    return m;
  };
  const out = new Map();
  out.early = new Map();
  out.hold = new Map();
  for (const n of design.nets) for (const p of n.inpins) {
    if (!CLOCK_PIN.test(p.pin)) continue;
    const a = loadsOf(n)?.get(`${p.inst}\u0000${p.pin}`);
    if (a && !out.has(p.inst)) { out.set(p.inst, a[0]); out.early.set(p.inst, a[1]); out.hold.set(p.inst, a[2]); }
  }
  return out;
}

/** The delay of every connection of a timing graph from the routing of the design (Float64Array);
 *  a connection not routed (no PIPs, or not reached by them) is estimated from the distance. */
export function routedDelays(design, device, tg, model = SPEED_4) {
  const instByName = new Map(design.insts.map(i => [i.name, i]));
  const pinNode = p => { const i = instByName.get(p.inst); return i && i.placed ? device.sitePinNode(i.site, p.pin) : -1; };
  const netByName = new Map(design.nets.map(n => [n.name, n]));
  const byNet = new Map();
  tg.conns.forEach((c, i) => { if (!byNet.has(c.net)) byNet.set(c.net, []); byNet.get(c.net).push(i); });
  const connDelay = new Float64Array(tg.conns.length);
  for (const [name, idx] of byNet) {
    const net = netByName.get(name);
    const src = pinNode(net.outpins[0]);
    const tree = net.pips.length && src >= 0 ? netTree(net.pips, [src], device) : null;
    for (const i of idx) {
      const sink = pinNode(tg.conns[i].toPin);
      const path = tree && sink >= 0 ? treePath(tree, sink) : null;
      connDelay[i] = path ? pathDelay(path, tree, device, model) : src >= 0 && sink >= 0 ? distanceDelay(src, sink, device, model) : 0;
    }
  }
  return connDelay;
}

/**
 * Static timing analysis of a placed (and routed) design: connection delays from the routing (the
 * nets' PIPs) or, for a net without them, from the distance. opts: { model, clocks (parseUcf().clocks: the phases of
 * a DCM's clocks at the pads, #601) }. Returns timingGraph's analysis plus
 * conns: [{ net, from: 'inst.pin', to, delay, slack, crit }] and pads (timingGraph's pads(): the paths at the
 * pads and the hold check, #26).
 */
export function analyzeTiming(design, device, opts = {}) {
  const model = opts.model || SPEED_4;
  const tg = timingGraph(design, model);
  const connDelay = routedDelays(design, device, tg, model);
  const r = tg.analyze(connDelay);
  r.conns = tg.conns.map((c, i) => ({ net: c.net, from: `${c.fromPin.inst}.${c.fromPin.pin}`, to: `${c.toPin.inst}.${c.toPin.pin}`, delay: connDelay[i], slack: r.slack[i], crit: r.crit[i] }));
  // the pads' paths and the hold check (#26), apart from the period
  // (opts.clocks: the UCF's PERIOD constraints, parseUcf().clocks: a DCM output's phase in its clock's arrival, #601)
  r.pads = tg.pads(connDelay, clockArrivals(design, device, model, opts.clocks || []));
  return r;
}
