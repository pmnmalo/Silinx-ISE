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
  clock: { Tgclk: 3.045, minScale: 0.751, hold: -1.018 },
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

/** The delay of each node of the device for a model (ns): Float32Array (cached per model). */
export function nodeDelays(device, model = SPEED_4) {
  device._nodeDelay ||= new Map();
  if (device._nodeDelay.has(model)) return device._nodeDelay.get(model);
  const cls = nodeClasses(device);
  const d = new Float32Array(cls.length);
  for (let n = 0; n < cls.length; n++) d[n] = model.wire[cls[n]];
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
  return routed ? d : 0;
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

// ------------------------------------------------------------------ logic
const F_PINS = ['F1', 'F2', 'F3', 'F4'], G_PINS = ['G1', 'G2', 'G3', 'G4'];

/**
 * The timing arcs of a placed instance (parseXdl's inst) from its type and configuration:
 * { comb: [[input pin, output pin, ns]], setup: [[input pin, ns]] (into a flip-flop or latch, before
 * the clock edge), clkToOut: [[output pin, ns]], clock: true if it has a flip-flop }. Pads: an input
 * pad's I pin starts paths (`input`), an output pad's O1 pin ends them (`output`, its delay to the pad).
 */
export function instArcs(inst, model = SPEED_4) {
  const comb = [], setup = [], clkToOut = [];
  const out = { comb, setup, clkToOut, input: [], output: [], clock: false };
  if (/^(IOB|IBUF|DIFF[MS]I?)$/.test(inst.type)) {
    out.input.push(['I', model.pad.Tiopi]);
    // an output pad's path from O1 (not through its output register, whose O1 is the register's data)
    if (!inst.cfg.some(c => c.attr === 'OFF1' && c.value === '#FF')) out.output.push(['O1', model.pad.Tioop]);
    // its registers (#96): the input register's output IQ1 after the clock, the output and output-enable
    // registers' data O1 / T1 before it
    const has = a => inst.cfg.some(c => c.attr === a && c.value === '#FF');
    if (has('IFF1')) clkToOut.push(['IQ1', model.pad.Tiockiq]);
    if (has('OFF1')) setup.push(['O1', model.pad.Tioock]);
    if (has('TFF1')) setup.push(['T1', model.pad.Tiotck]);
    out.clock = has('IFF1') || has('OFF1') || has('TFF1');
    return out;
  }
  if (inst.type === 'RAMB16') return bramArcs(inst, model, out);
  if (inst.type === 'MULT18X18SIO') return multArcs(inst, model, out);
  if (!/^SLICE[LM]$/.test(inst.type)) return out;
  const m = new Map(inst.cfg.map(c => [c.attr, c.value]));
  // SLICEM or SLICEL by the site (a slice may be written SLICEL on a SLICEM site): the left column of a CLB
  const sx = /^SLICE_X(\d+)Y/.exec(inst.site || '');
  const k = sx ? (+sx[1] % 2 === 0 ? 1 : 0) : inst.type === 'SLICEM' ? 1 : 0;
  const T = name => model.slice[name][k];
  const arc = (ins, o, d) => { for (const i of ins) comb.push([i, o, d]); };
  const cin = m.get('CYINIT') === 'BX' ? 'BX' : 'CIN';
  // the pins each LUT reads: an input its equation does not use is not on a path through it (the
  // packer wires the carry's data input CY0F / CY0G to a LUT pin the LUT itself may not read; an
  // arc through the LUT from it would make false loops, and the analysis leaves the pins after a
  // loop out)
  const reads = (l, pins) => {
    const e = /^#LUT:D=(.*)$/.exec(m.get(l) || '');
    return e ? pins.filter((p, j) => new RegExp(`A${j + 1}(?!\\d)`).test(e[1])) : pins;
  };
  const fIn = reads('F', F_PINS), gIn = reads('G', G_PINS);
  // into X / Y (kept to add the flip-flop's setup)
  const toX = [], toY = [];
  const fx = m.get('FXMUX'), gy = m.get('GYMUX');
  if (fx === 'F' || fx === undefined) for (const p of fIn) toX.push([p, T('Tilo')]);
  if (fx === 'F5') { for (const p of [...fIn, ...gIn]) toX.push([p, T('Tif5x')]); toX.push(['BX', T('Tbxx')]); }
  if (fx === 'FXOR') { for (const p of fIn) toX.push([p, T('Topx')]); toX.push([cin, cin === 'BX' ? T('Tbxxor') : T('Tcinx')]); }
  if (gy === 'G' || gy === undefined) for (const p of gIn) toY.push([p, T('Tilo')]);
  if (gy === 'FX') toY.push(['FXINA', T('Tif6y')], ['FXINB', T('Tif6y')], ['BY', T('Tbyy')]);
  if (gy === 'GXOR') {
    for (const p of gIn) toY.push([p, T('Togy')]);
    // the F stage's carry (its LUT, or its data input) into the G XOR
    for (const p of F_PINS) if (fIn.includes(p) || m.get('CY0F') === p) toY.push([p, T('Topy')]);
    toY.push([cin, cin === 'BX' ? T('Tbxxor') : T('Tciny')]);
    // BX as the F stage's carry data input reaches the G XOR through the F stage's carry
    if (m.get('CY0F') === 'BX' && cin !== 'BX') toY.push(['BX', T('Tbxy')]);
  }
  for (const [p, d] of toX) comb.push([p, 'X', d]);
  for (const [p, d] of toY) comb.push([p, 'Y', d]);
  arc([...fIn, ...gIn], 'F5', T('Tif5')); comb.push(['BX', 'F5', T('Tbxf5')]);
  arc(['FXINA', 'FXINB'], 'FX', T('Tinafx')); comb.push(['BY', 'FX', T('Tbyfx')]);
  // the carry chain: the LUT selects (S), CY0F / CY0G the data input (DI: a LUT pin, BX / BY or a constant)
  const cy = cin === 'BX' ? T('Tbxcy') : T('Tbyp');
  const cyF = F_PINS.filter(p => fIn.includes(p) || m.get('CY0F') === p).map(p => [p, m.get('CY0F') === p ? T('TopcyfDI') : T('Topcyf')]);
  if (m.get('CY0F') === 'BX') cyF.push(['BX', T('Tbxcy')]);
  const cyG = G_PINS.filter(p => gIn.includes(p) || m.get('CY0G') === p).map(p => [p, m.get('CY0G') === p ? T('TopcygDI') : T('Topcyg')]);
  if (m.get('CY0G') === 'BY') cyG.push(['BY', T('Tbycy')]);
  for (const [p, d] of [...cyF, ...cyG]) comb.push([p, 'COUT', d], [p, 'YB', d]);
  // XB: the F stage's carry, half of CIN -> COUT short of COUT (as the post-place & route model splits the chain,
  // core/sim-model.js sliceModel; #591: the open flows' carry out, trce's value of it still to be read)
  const half = T('Tbyp') / 2;
  for (const [p, d] of cyF) comb.push([p, 'XB', d - half]);
  comb.push([cin, 'COUT', cy], [cin, 'XB', cy - half], [cin, 'YB', cy]);
  // the flip-flops (or latches): D from X / Y (DXMUX / DYMUX = 1) or from BX / BY
  const ff = (name, D, toD, byp, q, tco) => {
    if (!m.has(name)) return;
    out.clock = true;
    if (m.get(D) === '0') setup.push([byp, T(byp === 'BY' ? 'Tdyck' : 'Tdick')]);
    else for (const [p, d] of toD) setup.push([p, d + T('Tdxck')]);
    clkToOut.push([q, T(tco)]);
  };
  ff('FFX', 'DXMUX', toX, 'BX', 'XQ', 'TckoX');
  ff('FFY', 'DYMUX', toY, 'BY', 'YQ', 'TckoY');
  // RAMs and shift registers (SLICEM, LUT #RAM): written on CLK (data BX / BY, enable SR, write
  // address on the LUT pins); a shift register's output changes after the clock edge
  const M = model.mem;
  const memSides = ['F', 'G'].filter(l => /^#RAM/.test(m.get(l) || ''));
  if (memSides.length) {
    out.clock = true;
    setup.push(['SR', M.Tws]);
    // the data in: BY into G (DIG_MUX), and into F too with ALTDIF; BX into F; BX as a RAM32X1S's A4
    if (m.get('DIF_MUX') === 'ALTDIF') setup.push(['BY', M.TdsAlt]);
    else if (m.has('DIG_MUX')) setup.push(['BY', M.TdsY]);
    if (m.has('SLICEWE0USED')) setup.push(['BX', M.Tbxs]);
    else if (m.get('DIF_MUX') === 'BX') setup.push(['BX', M.TdsX]);
    for (const l of memSides) {
      const o = l === 'F' ? 'X' : 'Y', shift = m.get(`${l}_ATTR`) === 'SHIFT_REG';
      // (a RAM's output changes after a write too: the word written, when it is the one read)
      if (shift) clkToOut.push([o, M.Treg]);
      else {
        for (const p of l === 'F' ? F_PINS : G_PINS) setup.push([p, M.Tas]);
        clkToOut.push([o, o === 'X' && m.get('FXMUX') === 'F5' ? M.Tshckof5 : M.Tshcko]);
      }
    }
  }
  if (out.clock && !memSides.length) setup.push(['CE', T('Tceck')], ['SR', T('Tsrck')]);
  else if (m.has('FFX') || m.has('FFY')) setup.push(['CE', T('Tceck')]);
  return out;
}

/** A block RAM: synchronous, the output latches change after the clock edge (CLKA / CLKB). */
function bramArcs(inst, model, out) {
  const B = model.bram;
  const ports = ['A', 'B'].filter(x => inst.cfg.some(c => c.attr === `PORT${x}_ATTR`));
  out.clock = ports.length > 0;
  for (const x of ports) {
    for (let k = 0; k < 32; k++) out.clkToOut.push([`DO${x}${k}`, B.Tbcko]);
    for (let k = 0; k < 4; k++) out.clkToOut.push([`DOP${x}${k}`, B.Tbcko]);
    for (let k = 0; k < 14; k++) out.setup.push([`ADDR${x}${k}`, B.Tback]);
    for (let k = 0; k < 32; k++) out.setup.push([`DI${x}${k}`, B.Tbdck]);
    for (let k = 0; k < 4; k++) out.setup.push([`DIP${x}${k}`, B.Tbdck]);
    out.setup.push([`EN${x}`, B.Tbeck], [`WE${x}`, B.Tbwck], [`SSR${x}`, B.Tbrck]);
  }
  return out;
}

/** A multiplier: combinational A, B -> P, or through its registers (AREG, BREG, PREG). */
function multArcs(inst, model, out) {
  const M = model.mult, m = new Map(inst.cfg.map(c => [c.attr, c.value]));
  const areg = m.get('AREG') === '1', breg = m.get('BREG') === '1', preg = m.get('PREG') === '1';
  const ins = [...(areg ? [] : Array.from({ length: 18 }, (_, k) => `A${k}`)), ...(breg ? [] : Array.from({ length: 18 }, (_, k) => `B${k}`))];
  out.clock = areg || breg || preg;
  for (let j = 0; j < 36; j++) {
    const p = `P${j}`;
    if (preg) out.clkToOut.push([p, M.TmsckpP]);
    else {
      for (const i of ins) out.comb.push([i, p, M.Tmult[j]]);
      if (areg || breg) out.clkToOut.push([p, M.Tmsckp[j]]);
    }
  }
  // the inputs into their registers, or (not registered) through the multiplier into the product register
  for (const [reg, x, t] of [[areg, 'A', M.TmsdckA], [breg, 'B', M.TmsdckB]]) {
    if (reg || preg) for (let k = 0; k < 18; k++) out.setup.push([`${x}${k}`, reg ? t : M.TmsdckP]);
  }
  if (out.clock) for (const x of ['A', 'B', 'P']) out.setup.push([`CE${x}`, M.Tmscck], [`RST${x}`, M.Tmsrck]);
  return out;
}

// ------------------------------------------------------------------ static timing analysis
const isConstNet = n => /^(vcc|gnd|power|ground|vdd)$/i.test(n.type || '');
// an instance clocked on the falling edge: its clock inverted (a slice's CLKINV, a block RAM's CLKAINV / CLKBINV, a
// multiplier's CLKINV = *_B; a latch with an active-high gate, CLK_B, closes on the falling edge too)
const fallingEdge = inst => (inst.cfg.some(c => /^(CLK[AB]?|ICLK1|OTCLK1)INV$/.test(c.attr) && /_B$/.test(c.value)) ? 1 : 0);
// the clock pins of the sites (an IOB's registers': ICLK1, OTCLK1, #96)
const CLOCK_PIN = /^(CLK[AB]?|ICLK1|OTCLK1)$/;

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
  for (const n of design.nets) for (const p of n.inpins) if (CLOCK_PIN.test(p.pin)) clockOf.set(p.inst, n.name);
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
    for (const [o, d] of a.clkToOut) starts.push([pid(inst.name, o), d, clk, edge]);
    for (const [i, d] of a.setup) ends.push([pid(inst.name, i), d, clk, edge]);
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
    const perClock = [], passes = [];
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
        let worst = -Infinity, wEnd = null;
        for (const end of ends) {
          if (end[2] !== clk || arr[end[0]] === -Infinity) continue;
          const t = (arr[end[0]] + end[1]) * (end[3] === launch ? 1 : 2);
          if (t > worst) { worst = t; wEnd = end; }
        }
        if (!wEnd || (best && best.period >= worst)) continue;
        // the critical path, back from its end
        const path = [{ ...pinName[wEnd[0]], kind: 'setup', delay: wEnd[1], arrival: arr[wEnd[0]] + wEnd[1] }];
        for (let p = wEnd[0]; ;) {
          const e = prevE[p];
          path.unshift({ ...pinName[p], kind: e < 0 ? 'clock-to-out' : eConn[e] >= 0 ? 'net' : 'logic', delay: e < 0 ? arr[p] : delay[e], arrival: arr[p] });
          if (e < 0) break;
          p = eFrom[e];
        }
        best = { clock: clk, period: worst, path, half: wEnd[3] !== launch };
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
    return { period, clocks: perClock.map(c => ({ clock: c.clock, period: c.period, path: c.path, half: c.half })), crit, slack };
  }

  // The paths at the pads and the hold check (#26), apart from the period: clockArr (Map instance -> the arrival of
  // its clock at its clock pin from the clock's pad, ns: clockArrivals) gives each flip-flop its clock's time.
  // - inputs: [{ pad, clock, setup, hold, path }]: an input pad to the setups of a clock's flip-flops, the data's
  //   arrival plus the setup minus the clock's earliest arrival there (minScale x it: trce's "pad to setup", what
  //   OFFSET IN BEFORE bounds), and the hold: the clock's arrival less the data's earliest (minScale x the
  //   shortest path) plus the hold time; an asynchronous set / reset is not a data input (trce leaves it out);
  // - outputs: [{ pad, clock, delay, path }]: the clock's pad through a flip-flop of that clock to an output pad
  //   (trce's "clock to pad", OFFSET OUT AFTER);
  // - padToPad: [{ from, to, delay, path }]: an input pad through logic only to an output pad;
  // - hold: [{ clock, slack, path }]: the shortest path from a flip-flop to a flip-flop of the same clock and edge,
  //   at its earliest (minScale x it), less the hold time (model.clock.hold); a global clock reaches both at once.
  // A flip-flop with no clock arrival (a clock through a DCM, or made by logic) is left out of inputs and outputs.
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
          const ca = clockArr.get(pinName[e].inst), t = arr[e] + su - sc * ca;
          if (!w || t > w.t) w = { t, e, su };
          hold = Math.max(hold, ca - sc * early[e] + Th);
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
 * for every load (the global lines reach them all at once, #26). A clock through a DCM or made by logic has none
 * (left out). Map instance name -> ns.
 */
export function clockArrivals(design, device, model = SPEED_4) {
  const inst = new Map(design.insts.map(i => [i.name, i]));
  const pinNode = p => { const i = inst.get(p.inst); return i && i.placed ? device.sitePinNode(i.site, p.pin) : -1; };
  const netOfPin = new Map();   // 'inst\0pin' -> net (inputs)
  for (const n of design.nets) for (const p of n.inpins) netOfPin.set(`${p.inst}\u0000${p.pin}`, n);
  const at = new Map();         // net name -> Map 'inst\0pin' -> arrival at that load
  const loadsOf = (n, depth = 0) => {
    if (at.has(n.name)) return at.get(n.name);
    at.set(n.name, null);
    const drv = n.outpins[0], di = drv && inst.get(drv.inst);
    let base = null;
    if (di && /^(IOB|IBUF|DIFF[MS]I?)$/.test(di.type)) base = model.pad.Tiopi;
    else if (di && /^BUFG/.test(di.type) && depth < 4) {
      const inNet = netOfPin.get(`${di.name}\u0000I0`) || netOfPin.get(`${di.name}\u0000I`);
      const a = inNet && loadsOf(inNet, depth + 1)?.get(`${di.name}\u0000${netOfPin.has(`${di.name}\u0000I0`) ? 'I0' : 'I'}`);
      if (a !== undefined && a !== null) base = a;
    }
    if (base === null) return null;
    // a global buffer's loads: all at once, Tgclk after the pad (trce: no clock skew on the global lines, #26)
    if (/^BUFG/.test(di.type)) { const g = new Map(n.inpins.map(p => [`${p.inst}\u0000${p.pin}`, model.clock.Tgclk])); at.set(n.name, g); return g; }
    const src = pinNode(drv);
    const tree = n.pips.length && src >= 0 ? netTree(n.pips, [src], device) : null;
    const m = new Map();
    for (const p of n.inpins) {
      const sink = pinNode(p);
      const path = tree && sink >= 0 ? treePath(tree, sink) : null;
      m.set(`${p.inst}\u0000${p.pin}`, base + (path ? pathDelay(path, tree, device, model) : src >= 0 && sink >= 0 ? distanceDelay(src, sink, device, model) : 0));
    }
    at.set(n.name, m);
    return m;
  };
  const out = new Map();
  for (const n of design.nets) for (const p of n.inpins) {
    if (!CLOCK_PIN.test(p.pin)) continue;
    const a = loadsOf(n)?.get(`${p.inst}\u0000${p.pin}`);
    if (a !== undefined && !out.has(p.inst)) out.set(p.inst, a);
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
 * nets' PIPs) or, for a net without them, from the distance. Returns timingGraph's analysis plus
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
  r.pads = tg.pads(connDelay, clockArrivals(design, device, model));
  return r;
}

/**
 * The port a clock net comes from: its driver is followed back through the clock buffers (BUFGMUX,
 * BUFG, the input buffer) to the I/O site, which the packer names after the port. null when the net
 * does not come from a pad (a clock made by logic).
 */
export function clockPort(design, netName) {
  const driverOf = new Map();
  for (const n of design.nets) for (const p of n.outpins || []) driverOf.set(n.name, p.inst);
  const inst = new Map(design.insts.map(i => [i.name, i]));
  const inNet = new Map();   // buffer instance -> the net on its data input (I0 / I, not the select S)
  for (const n of design.nets) for (const p of n.inpins || []) if (/^I0?$/.test(p.pin)) inNet.set(p.inst, n.name);
  let net = netName;
  for (let k = 0; k < 6 && net; k++) {
    const i = inst.get(driverOf.get(net));
    if (!i) return null;
    if (/^(IOB|IBUF|IBUFG|IOBS|IOBM|DIFFM|DIFFS)$/.test(i.type)) return i.name;
    if (!/^BUFG/.test(i.type)) return null;
    net = inNet.get(i.name);
  }
  return null;
}

/**
 * The clocks' periods against the PERIOD constraints of the UCF (core/ucf.js parseUcf().clocks:
 * [{ net, period }], the net being the clock's port): [{ clock, port, required, period, slack, met }]
 * for each constrained clock found, and { port, required, missing: true } for a constraint on a port
 * that clocks nothing analyzed.
 */
export function checkPeriods(r, design, constraints = []) {
  const out = [];
  const byPort = new Map(r.clocks.map(c => [String(clockPort(design, c.clock) || c.clock).toLowerCase(), c]));
  for (const k of constraints) {
    const c = byPort.get(String(k.net).toLowerCase());
    if (!c) { out.push({ port: k.net, required: k.period, missing: true }); continue; }
    out.push({ clock: c.clock, port: k.net, required: k.period, period: c.period, slack: k.period - c.period, met: c.period <= k.period });
  }
  return out;
}

/**
 * The OFFSET constraints of a UCF (#26; core/ucf.js parseUcf().other keeps them): `OFFSET = IN 5 ns BEFORE "clk"`
 * (every input of that clock), `NET "sw<0>" OFFSET = IN …`, `… OFFSET = OUT 9 ns AFTER "clk"`; a VALID window and
 * RISING / FALLING are read past. [{ dir: 'in' | 'out', port (null: every pad of the clock), required (ns), clock
 * (the name after BEFORE / AFTER: a clock's port, or its TNM_NET), text }]; a TIMEGRP's is { unsupported: true }.
 */
export function parseOffsets(statements = []) {
  const out = [];
  for (const st of statements) {
    const m = /^(?:(NET|TIMEGRP|INST)\s+"?([^"\s]+)"?\s+)?OFFSET\s*=\s*(IN|OUT)\s+(-?[\d.]+)\s*(ns|ps)?\s+(?:VALID\s+[\d.]+\s*(?:ns|ps)?\s+)?(BEFORE|AFTER)\s+"?([^"\s;]+)"?/i.exec(String(st).trim());
    if (!m) continue;
    const text = String(st).trim().replace(/\s+/g, ' ');
    if (m[1] && !/^NET$/i.test(m[1])) { out.push({ text, unsupported: true }); continue; }
    out.push({ dir: m[3].toLowerCase(), port: m[2] || null, required: +m[4] / (/^ps$/i.test(m[5] || '') ? 1000 : 1), clock: m[7], text });
  }
  return out;
}

/**
 * The OFFSET constraints (parseOffsets) against the pads' paths (analyzeTiming's pads): [{ kind: 'offset', text,
 * dir, port, clock, required, value, slack, met }] for each constraint and pad it bounds (an IN: the pad to setup;
 * an OUT: the clock to pad), { kind: 'offset', text, missing: true } when nothing of the design is bounded by it
 * (no such clock or pad), { kind: 'offset', text, unsupported: true } for a TIMEGRP's. ucfClocks: parseUcf().clocks
 * (a TNM_NET name for its clock's port).
 */
export function checkOffsets(r, design, offsets = [], ucfClocks = []) {
  const out = [];
  const portOf = new Map(r.clocks.map(c => [c.clock, String(clockPort(design, c.clock) || c.clock).toLowerCase()]));
  const clockMatches = (clk, name) => {
    const n = String(name).toLowerCase(), port = portOf.get(clk);
    return port === n || String(clk).toLowerCase() === n || ucfClocks.some(u => String(u.tnm || '').toLowerCase() === n && String(u.net).toLowerCase() === port);
  };
  for (const o of offsets) {
    if (o.unsupported) { out.push({ kind: 'offset', text: o.text, unsupported: true }); continue; }
    const rows = (o.dir === 'in' ? r.pads?.inputs : r.pads?.outputs) || [];
    const hit = rows.filter(x => clockMatches(x.clock, o.clock) && (!o.port || x.pad.toLowerCase() === o.port.toLowerCase()));
    if (!hit.length) { out.push({ kind: 'offset', text: o.text, missing: true }); continue; }
    for (const x of hit) {
      const value = o.dir === 'in' ? x.setup : x.delay;
      out.push({ kind: 'offset', text: o.text, dir: o.dir, port: x.pad, clock: x.clock, required: o.required, value, slack: o.required - value, met: value <= o.required });
    }
  }
  return out;
}

/** A readable report of the critical path of each clock (lines of text), with the PERIOD checks
 *  (checkPeriods) and the OFFSET checks (checkOffsets) when given; then the pads' paths and the hold
 *  check (#26). */
export function timingReport(r, checks = []) {
  const lines = [];
  const step = s => `  ${s.kind.padEnd(12)} ${s.delay.toFixed(3).padStart(7)} ${s.arrival.toFixed(3).padStart(8)}  ${s.inst}.${s.pin}`;
  for (const k of checks) {
    if (k.kind === 'offset') {
      lines.push(k.unsupported ? `constraint ${k.text}: not analyzed (only OFFSET on a NET or on all pads)`
        : k.missing ? `constraint ${k.text}: no pad of the design is bounded by it`
          : `constraint ${k.text}: ${k.met ? 'met' : 'NOT MET'} on ${k.port} (${k.dir === 'in' ? 'pad to setup' : 'clock to pad'} ${k.value.toFixed(3)} ns, slack ${k.slack.toFixed(3)} ns)`);
      continue;
    }
    lines.push(k.missing ? `constraint PERIOD ${k.required} ns on ${k.port}: no clock of the design comes from this port`
      : `constraint PERIOD ${k.required} ns on ${k.port}: ${k.met ? 'met' : 'NOT MET'} (period ${k.period.toFixed(3)} ns, slack ${k.slack.toFixed(3)} ns)`);
  }
  for (const c of r.clocks) {
    lines.push(`clock ${c.clock}: minimum period ${c.period.toFixed(3)} ns (${(1000 / c.period).toFixed(1)} MHz)`);
    for (const s of c.path) lines.push(step(s));
  }
  const p = r.pads;
  if (!p) return lines;
  // (as trce's data sheet report, #26)
  const table = (title, rows, fmt) => { if (rows.length) lines.push('', title, ...rows.map(fmt)); };
  const w = Math.max(8, ...[...p.inputs, ...p.outputs].map(x => x.pad.length), ...p.padToPad.map(x => x.from.length));
  for (const clk of [...new Set([...p.inputs, ...p.outputs].map(x => x.clock))]) {
    table(`OFFSET IN (pad to setup; hold), clock ${clk}:`, p.inputs.filter(x => x.clock === clk), x => `  ${x.pad.padEnd(w)} ${x.setup.toFixed(3).padStart(7)} ns; hold ${x.hold.toFixed(3).padStart(7)} ns`);
    table(`OFFSET OUT (clock to pad), clock ${clk}:`, p.outputs.filter(x => x.clock === clk), x => `  ${x.pad.padEnd(w)} ${x.delay.toFixed(3).padStart(7)} ns`);
  }
  table('pad to pad:', p.padToPad, x => `  ${x.from.padEnd(w)} -> ${x.to.padEnd(w)} ${x.delay.toFixed(3).padStart(7)} ns`);
  for (const h of p.hold) {
    lines.push('', `hold, clock ${h.clock}: ${h.slack >= 0 ? 'met' : 'NOT MET'}, worst slack ${h.slack.toFixed(3)} ns (the shortest path at its earliest; the global clock reaches both flip-flops at once)`);
    for (const s of h.path) lines.push(step(s));
  }
  return lines;
}
