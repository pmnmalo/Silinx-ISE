// The Spartan-3E through nextpnr-himbaechel (#1954): what Silinx gives the chip database (the PIPs to leave out, the
// delay model) and what it makes of nextpnr's result (XDL, its check against the netlist, its size). The scripts of
// this folder are the command lines of these functions; README.md tells the whole flow.
import { writeXdl, evalLut } from '../../src/xdl.js';
import { initToEquation } from '../../src/fpga/lut.js';
import { knownRouting } from '../../src/fpga/bitgen.js';
import { SPEED_4, WIRE_NAMES, nodeClasses, lutPinIndex } from '../../src/fpga/timing.js';

const topModule = json => Object.entries(json.modules).find(([, m]) => m.attributes?.top) || Object.entries(json.modules)[0];
const esc = x => String(x).replace(/:/g, '_');
const bitsOf = v => (typeof v === 'string' ? v : (v >>> 0).toString(2));
const portNet = (c, p) => c.connections?.[p]?.[0];
const mostFrequent = m => [...m].sort((a, b) => b[1] - a[1])[0][0];

// ---------------------------------------------------------------- for the chip database
/**
 * The PIPs nextpnr must not use: those whose bits Silinx's bit database does not know, as Silinx's own router is kept
 * off them (knownRouting's allowPip). Per tile name: the indices of its template's PIPs (the device graph's order,
 * which the generator s3e_gen.py reads). Route-through PIPs are not counted (the generator leaves them all out).
 * Returns { pips: { tile: [index] }, total, unknown }.
 */
export function unknownPips(device, db) {
  const { allowPip } = knownRouting(db);
  const pips = {};
  let total = 0, unknown = 0;
  for (let k = 0; k < device.tileCount; k++) {
    const tp = device.templates[device.tileTemplate[k]], bad = [];
    for (let i = 0; i < tp.from.length; i++) {
      const p = device.pip(k, i);
      if (p.routethru) continue;
      total++;
      if (!allowPip(p.tile, p.from, p.to)) bad.push(i);
    }
    if (bad.length) pips[device.tileName(k)] = bad;
    unknown += bad.length;
  }
  return { pips, total, unknown };
}

/**
 * Silinx's delay model (SPEED_4, fitted to ISE's trce) for the chip database: nextpnr counts a PIP's delay, not a
 * wire's, so each PIP takes the class of the node it drives (pipClass: per template, class x 5 + the LUT input it
 * reaches, the most frequent where the template's tiles disagree), and the model's delays (wire per class, the LUT
 * pins' offsets, the connection's fixed part, the distance estimate, SLICEL's slice delays).
 * Returns { timing, disagree } (disagree: template PIPs whose tiles disagree on the class).
 */
export function timingExport(device) {
  const cls = nodeClasses(device), lut = lutPinIndex(device);
  const votes = new Map();   // template -> Array of Map(class -> count)
  for (let k = 0; k < device.tileCount; k++) {
    const t = device.tileTemplate[k], tp = device.templates[t];
    if (!votes.has(t)) votes.set(t, Array.from({ length: tp.from.length }, () => new Map()));
    const v = votes.get(t);
    for (let i = 0; i < tp.from.length; i++) {
      const n = device.pipNodes(k, i)[1], c = cls[n] * 5 + lut[n];
      v[i].set(c, (v[i].get(c) || 0) + 1);
    }
  }
  const pipClass = {};
  let disagree = 0;
  for (const [t, v] of votes) pipClass[t] = v.map(m => { if (m.size > 1) disagree++; return mostFrequent(m); });
  const slice = Object.fromEntries(Object.entries(SPEED_4.slice).map(([k, [l]]) => [k, l]));
  const timing = { wireNames: WIRE_NAMES, wire: SPEED_4.wire, lutPin: SPEED_4.lutPin, base: SPEED_4.base, dist: SPEED_4.dist, slice, pipClass };
  return { timing, disagree };
}

// ---------------------------------------------------------------- nextpnr's result to XDL
// BELs of a site: z = site index * Z_STRIDE + offset, BEL names S<site index>_<BEL> (s3e_gen.py)
const Z_STRIDE = 8;

/** The device's views the converter needs: tile by "X<col>Y<row>" (nextpnr's tile names), site names, pin wires. */
function deviceViews(device) {
  const tileAt = new Map();
  for (let k = 0; k < device.tileCount; k++) tileAt.set(`X${device.tileCol[k]}Y${device.tileRow[k]}`, k);
  // the site pin of each tile wire (by template): wire name -> { site index, pin, dir }
  const pinOfWire = k => {
    const tp = device.templates[device.tileTemplate[k]];
    if (!tp.pinOfWire) {
      tp.pinOfWire = new Map();
      tp.sites.forEach((s, i) => { for (const [pin, p] of s.pins) tp.pinOfWire.set(device.names[tp.wires[p.wire]], { site: i, pin, dir: p.dir }); });
    }
    return tp.pinOfWire;
  };
  const siteName = (tile, index) => device.tileSites[tileAt.get(tile)]?.[index]?.[0];
  return { tileAt, pinOfWire, siteName };
}

/** The routed design's ROUTING attribute: [wire, pip] pairs (each "tile/name", pip "tile/dst/src" or ''). */
const routing = n => {
  const parts = (n.attributes?.ROUTING || '').split(';'), out = [];
  for (let i = 0; i + 2 < parts.length; i += 3) out.push([parts[i], parts[i + 1]]);
  return out;
};

/** One instance per used site, its cells by BEL (FLUT, GLUT, FFX, FFY, IOB, BUFGMUX). */
function sitesOfCells(mod, device, v) {
  const insts = new Map();
  for (const [name, c] of Object.entries(mod.cells)) {
    const bel = c.attributes?.NEXTPNR_BEL;
    if (!bel) throw new Error(`${name}: not placed`);
    const [tile, belName] = bel.split('/');
    const m = /^S(\d+)_/.exec(belName);
    const site = v.siteName(tile, +m[1]);
    let inst = insts.get(site);
    if (!inst) {
      inst = { name: null, siteType: device.site(site).type, tile: device.tileName(v.tileAt.get(tile)), site, cells: {}, mux: {}, lutPins: {} };
      insts.set(site, inst);
    }
    inst.cells[belName.slice(m[0].length)] = { name, ...c };
  }
  return insts;
}

/** The slices' multiplexers from the route's PIPs inside the sites (s3e_gen.py's S<i>_* wires), and the site pin
 *  each LUT input was routed to (its inputs are permutable: S<i>_FI<j> is reached from any of F1..F4). */
function siteRoutes(mod, insts, v) {
  for (const n of Object.values(mod.netnames)) {
    for (const [, pip] of routing(n)) {
      if (!pip) continue;
      const [tile, dst, src] = pip.split('/');
      const m = /^S(\d+)_(\w+)$/.exec(src) || /^S(\d+)_(\w+)$/.exec(dst);
      if (!m) continue;
      const inst = insts.get(v.siteName(tile, +m[1]));
      const li = /^S\d+_([FG])I(\d)$/.exec(dst);
      if (li) {
        const pin = v.pinOfWire(v.tileAt.get(tile)).get(src).pin;   // F1..F4 / G1..G4
        (inst.lutPins[li[1]] ||= [])[+li[2]] = +pin[1];
      } else if (/OUT$/.test(src) && !/^S\d+_D/.test(dst)) inst.mux[src.endsWith('FOUT') ? 'X' : 'Y'] = 'used';   // LUT -> X / Y pin
      else if (/OUT$/.test(src)) inst.mux[`D${dst.slice(-1)}`] = 'lut';                                          // LUT -> flip-flop
      else inst.mux[`D${dst.slice(-1)}`] = 'bypass';                                                              // BX / BY -> flip-flop
    }
  }
}

/** A LUT's site pins by input (I0..I3), the unconnected inputs on the pins left (their values do not matter: the
 *  INIT repeats over them). */
export function lutPins(chosen) {
  const pins = [0, 1, 2, 3].map(i => chosen?.[i]);
  const free = [1, 2, 3, 4].filter(k => !pins.includes(k));
  return pins.map(k => k ?? free.shift());
}

/** An instance's XDL type, name and settings (cfg items), as ISE's map writes them. */
function instanceCfg(inst, mod) {
  const cfg = [], c = inst.cells;
  const add = (attr, name, value) => cfg.push({ attr, name, value });
  if (inst.siteType === 'SLICEL' || inst.siteType === 'SLICEM') {
    inst.type = 'SLICEL';                // (logic on a SLICEM site too: ISE's DRC wants a SLICEL comp there)
    for (const [side, lut] of [['F', c.FLUT], ['G', c.GLUT]]) if (lut) add(side, esc(lut.name), `#LUT:${initToEquation(bitsOf(lut.parameters.INIT), 4, lutPins(inst.lutPins[side]))}`);
    let ctrl = null;
    for (const [X, ff] of [['X', c.FFX], ['Y', c.FFY]]) {
      if (!ff) continue;
      const init = parseInt(bitsOf(ff.parameters.INIT ?? '0'), 2) & 1, mode = ff.parameters.SRMODE ?? 'NONE';
      add(`FF${X}`, esc(ff.name), '#FF');
      add(`FF${X}_INIT_ATTR`, '', init ? 'INIT1' : 'INIT0');
      add(`FF${X}_SR_ATTR`, '', /_SET$/.test(mode) || (mode === 'NONE' && init) ? 'SRHIGH' : 'SRLOW');
      add(`D${X}MUX`, '', inst.mux[`D${X}`] === 'bypass' ? '0' : '1');
      ctrl = { ce: portNet(ff, 'CE') !== undefined, sr: portNet(ff, 'SR') !== undefined, sync: !/ASYNC/.test(mode) };
    }
    if (ctrl) {
      add('CLKINV', '', 'CLK');
      if (ctrl.ce) add('CEINV', '', 'CE');
      if (ctrl.sr) add('SRINV', '', 'SR');
      add('SYNC_ATTR', '', ctrl.sync ? 'SYNC' : 'ASYNC');
    }
    if (inst.mux.DX === 'bypass') add('BXINV', '', 'BX');
    if (inst.mux.DY === 'bypass') add('BYINV', '', 'BY');
    if (inst.mux.X || inst.mux.DX === 'lut') add('FXMUX', '', 'F');
    if (inst.mux.Y || inst.mux.DY === 'lut') add('GYMUX', '', 'G');
    if (inst.mux.X) add('XUSED', '', '0');
    if (inst.mux.Y) add('YUSED', '', '0');
    inst.name = esc((c.FFX || c.FFY || c.FLUT || c.GLUT).name);
  } else if (c.IOB) {
    // the IOB's name: its port
    const port = Object.entries(mod.ports).find(([, p]) => p.bits.includes(portNet(c.IOB, 'PAD')))?.[0] || c.IOB.name;
    inst.name = port.replace(/\[(\d+)\]$/, '<$1>');
    const out = portNet(c.IOB, 'O') !== undefined;
    inst.type = out ? 'IOB' : 'IBUF';                    // (an input alone: IBUF, as ISE's map writes it)
    if (out) {
      add('DRIVEATTRBOX', '', '12'); add('IOATTRBOX', '', 'LVCMOS25'); add('O1INV', '', 'O1'); add('OMUX', '', 'O1'); add('SLEW', '', 'SLOW');
      add('OUTBUF', `${esc(inst.name)}_OBUF`, '');
    } else {
      add('IDELMUX', '', '1'); add('IMUX', '', '1'); add('IOATTRBOX', '', 'LVCMOS25');
      add('INBUF', `${esc(inst.name)}_IBUF`, '');
    }
    add('PAD', esc(inst.name), '');
  } else if (c.BUFGMUX) {
    inst.type = 'BUFGMUX';
    inst.name = esc(c.BUFGMUX.name);
    add('DISABLE_ATTR', '', 'LOW'); add('I0_USED', '', '0'); add('SINV', '', 'S_B');
    add('GCLKMUX', `${inst.name}.GCLKMUX`, ''); add('GCLK_BUFFER', inst.name, '');
  } else throw new Error(`${inst.site}: no cell the converter knows`);
  return { name: inst.name, type: inst.type, placed: true, tile: inst.tile, site: inst.site, cfg };
}

/** The nets: their site pins (a routed wire is named by its node's first tile wire: its pins are the node's pin
 *  wires) and their PIPs (those inside a site set its multiplexers instead). */
function netsOf(mod, insts, device, v) {
  const netName = new Map();
  for (const [name, n] of Object.entries(mod.netnames)) for (const b of n.bits) if (!netName.has(b) || !n.hide_name) netName.set(b, name);
  const nets = [];
  for (const [name, n] of Object.entries(mod.netnames)) {
    const route = routing(n);
    if (!route.length || n.hide_name && netName.get(n.bits[0]) !== name) continue;
    const net = { name, type: 'wire', outpins: [], inpins: [], pips: [] };
    const seen = new Set();
    for (const [wire] of route) {
      const [tile, w0] = wire.split('/');
      const node = device.node(v.tileAt.get(tile), w0);
      if (node < 0 || seen.has(node)) continue;
      seen.add(node);
      for (const w of device.nodeWireIds(node)) {
        const k = device.wireTile[w], p = v.pinOfWire(k).get(device.wireInfo(w).name);
        const inst = p && insts.get(device.tileSites[k][p.site][0]);
        if (inst) (p.dir === 'o' ? net.outpins : net.inpins).push({ inst: inst.name, pin: p.pin });
      }
    }
    for (const [, pip] of route) {
      if (!pip) continue;
      const [tile, dst, src] = pip.split('/');
      if (/^S\d+_/.test(src) || /^S\d+_/.test(dst)) continue;
      const k = v.tileAt.get(tile), pi = device.findPip(k, src, dst);
      if (pi < 0) throw new Error(`${name}: no PIP ${tile} ${src} -> ${dst}`);
      const x = device.pip(k, pi);
      net.pips.push({ tile: x.tile, from: x.from, dir: x.dir, to: x.to });
    }
    if (net.outpins.length || net.inpins.length) nets.push(net);
  }
  return nets;
}

/** The check of the LUTs' pins: each input's net is the net on the site pin its equation reads it from. */
function checkLutPins(mod, insts, nets) {
  const netAt = new Map();   // "inst pin" -> the net's first bit
  for (const net of nets) for (const p of net.inpins) netAt.set(`${p.inst} ${p.pin}`, mod.netnames[net.name].bits[0]);
  for (const inst of insts.values()) {
    for (const [side, lut] of [['F', inst.cells.FLUT], ['G', inst.cells.GLUT]]) {
      if (!lut) continue;
      const pins = lutPins(inst.lutPins[side]);
      for (let i = 0; i < 4; i++) {
        const b = portNet(lut, `I${i}`);
        if (b === undefined || typeof b === 'string') continue;
        if (netAt.get(`${inst.name} ${side}${pins[i]}`) !== b) throw new Error(`${lut.name}: I${i} on ${side}${pins[i]} carries another net`);
      }
    }
  }
}

/** A BUFGMUX's select S tied to VCC, from its tile's VCC site, as ISE's map and Silinx write it. */
function tieSelects(xdlInsts, nets, device) {
  let vccs = 0;
  for (const inst of xdlInsts.filter(i => i.type === 'BUFGMUX')) {
    const k = device.tile(inst.tile), s = device.sitePin(inst.site, 'S');
    const vcc = device.tileSites[k].find(([name]) => device.site(name).type === 'VCC');
    const tp = device.templates[device.tileTemplate[k]];
    let pip = null;
    for (let i = 0; i < tp.from.length && !pip; i++) {
      const [from, to] = device.pipWires(k, i);
      if (to === s.wire && /VCC/.test(from)) pip = device.pip(k, i);
    }
    if (!vcc || !pip) throw new Error(`${inst.site}: no VCC for its select`);
    const dummy = `XDL_DUMMY_${inst.tile}_${vcc[0]}`;
    xdlInsts.push({ name: dummy, type: 'VCC', placed: true, tile: inst.tile, site: vcc[0], cfg: [{ attr: '_NO_USER_LOGIC', name: '', value: '' }, { attr: '_VCC_SOURCE', name: '', value: 'VCCOUT' }] });
    nets.push({ name: `GLOBAL_LOGIC1_${vccs++}`, type: 'vcc', outpins: [{ inst: dummy, pin: 'VCCOUT' }],
      inpins: [{ inst: inst.name, pin: 'S' }], pips: [{ tile: pip.tile, from: pip.from, dir: pip.dir, to: pip.to }] });
  }
}

/**
 * nextpnr-himbaechel's routed design (spartan3e micro-architecture, its --write JSON) as an XDL design (parseXdl's
 * structure: writeXdl writes it): one instance per used site with its settings, each net's site pins and PIPs.
 * The spike's cells only: LUT4, FF, IOB, BUFGMUX. Throws when a LUT input is not on the pin its equation reads.
 */
export function nextpnrToXdl(json, device, part = device.part) {
  const [top, mod] = topModule(json);
  const v = deviceViews(device);
  const insts = sitesOfCells(mod, device, v);
  siteRoutes(mod, insts, v);
  const xdlInsts = [...insts.values()].map(inst => instanceCfg(inst, mod));
  const nets = netsOf(mod, insts, device, v);
  checkLutPins(mod, insts, nets);
  tieSelects(xdlInsts, nets, device);
  return { name: top, part, insts: xdlInsts, nets, cfg: '', comment: 'from nextpnr-himbaechel (spartan3e), research/nextpnr-s3e' };
}

/** XDL text of nextpnr's routed design (nextpnrToXdl). */
export const nextpnrToXdlText = (json, device, part) => writeXdl(nextpnrToXdl(json, device, part));

// ---------------------------------------------------------------- checking and measuring the result
/** The slices, LUTs and flip-flops of an XDL design (parseXdl's). */
export function xdlSize(design) {
  const slices = design.insts.filter(i => /^SLICE[LM]$/.test(i.type));
  const has = attr => slices.reduce((n, i) => n + i.cfg.filter(c => c.attr === attr).length, 0);
  return { slices: slices.length, luts: has('F') + has('G'), ffs: has('FFX') + has('FFY') };
}

/** The netlist's simulation: its LUT4s by INIT, its flip-flops. */
function netlistSim(mod, inputs) {
  const S = { val: new Map(), luts: [], ffs: [] };
  for (const [name, p] of Object.entries(mod.ports)) if (p.direction === 'input') S.val.set(p.bits[0], inputs[name] || 0);
  for (const [name, c] of Object.entries(mod.cells)) {
    const con = p => portNet(c, p);
    if (c.type === 'LUT4') S.luts.push({ init: bitsOf(c.parameters.INIT).padStart(16, '0'), ins: [0, 1, 2, 3].map(i => con(`I${i}`)), out: con('O') });
    else if (c.type === 'FF') S.ffs.push({ name: esc(name), d: con('D'), q: con('Q'), ce: con('CE'), sr: con('SR'), set: /_SET$/.test(c.parameters.SRMODE), hasSr: c.parameters.SRMODE !== 'NONE', init: parseInt(bitsOf(c.parameters.INIT ?? '0'), 2) & 1 });
    else if (c.type === 'IOB' && con('I') !== undefined) S.val.set(con('I'), S.val.get(con('PAD')) || 0);
  }
  S.get = b => (b === undefined || b === '0' ? 0 : b === '1' ? 1 : S.val.get(b) || 0);
  S.lut = l => +l.init[15 - l.ins.reduce((a, b, i) => a | (S.get(b) << i), 0)];
  return S;
}

/** The XDL's simulation: its slices' LUT equations on their site pins, FXMUX / DXMUX, the flip-flops' set / reset. */
function xdlSim(design, inputs) {
  const S = { val: new Map(), luts: [], ffs: [] };
  const netOfPin = new Map();
  for (const n of design.nets) for (const p of [...n.outpins, ...n.inpins]) netOfPin.set(`${p.inst} ${p.pin}`, n.name);
  for (const inst of design.insts) {
    const cfg = Object.fromEntries(inst.cfg.map(c => [c.attr, c])), pin = p => netOfPin.get(`${inst.name} ${p}`);
    if (/^SLICE[LM]$/.test(inst.type)) {
      for (const [side, X] of [['F', 'X'], ['G', 'Y']]) {
        const out = `${inst.name}/${side}`, ff = `FF${X}`;   // the LUT's output, inside the slice
        if (cfg[side]) S.luts.push({ eq: cfg[side].value.replace(/^#LUT:/, ''), ins: [1, 2, 3, 4].map(k => pin(`${side}${k}`)), out });
        if (cfg[`${side === 'F' ? 'FX' : 'GY'}MUX`] && pin(X)) S.luts.push({ copy: out, out: pin(X) });
        if (cfg[ff]) {
          S.ffs.push({
            name: cfg[ff].name, d: cfg[`D${X}MUX`]?.value === '1' ? out : pin(`B${X}`), q: pin(`${X}Q`),
            ce: cfg.CEINV ? pin('CE') : undefined, sr: cfg.SRINV ? pin('SR') : undefined,
            set: cfg[`${ff}_SR_ATTR`]?.value === 'SRHIGH', init: cfg[`${ff}_INIT_ATTR`]?.value === 'INIT1' ? 1 : 0,
          });
          S.ffs.at(-1).hasSr = S.ffs.at(-1).sr !== undefined;
        }
      }
    } else if ((inst.type === 'IOB' || inst.type === 'IBUF') && pin('I')) {
      S.val.set(pin('I'), inputs[(inst.cfg.find(c => c.attr === 'PAD')?.name || '').replace(/<(\d+)>$/, '[$1]')] || 0);
    }
  }
  S.get = n => (n === undefined ? 0 : S.val.get(n) || 0);
  S.lut = l => +(l.copy ? S.get(l.copy) : evalLut(l.eq, Object.fromEntries(l.ins.map((n, k) => [`A${k + 1}`, S.get(n)]))));
  return S;
}

/** The combinational logic settled (its LUTs evaluated until nothing changes). */
function settle(S, what) {
  for (let pass = 0; pass < 64; pass++) {
    let changed = false;
    for (const l of S.luts) { const v = S.lut(l); if (S.val.get(l.out) !== v) { S.val.set(l.out, v); changed = true; } }
    if (!changed) return;
  }
  throw new Error(`${what}: no stable state`);
}

/** A rising clock edge on every flip-flop (set / reset synchronous, the spike's). */
function clock(S) {
  const next = S.ffs.map(f => {
    if (f.hasSr && S.get(f.sr)) return f.set ? 1 : 0;
    return f.ce === undefined || S.get(f.ce) ? S.get(f.d) : S.get(f.q);
  });
  S.ffs.forEach((f, i) => S.val.set(f.q, next[i]));
}

/**
 * Does an XDL design (parseXdl's) implement nextpnr's netlist? Both simulated cycle by cycle from the flip-flops'
 * initial values (`cycles`), then `starts` runs of 64 cycles from random states (the same in both, each flip-flop
 * 1 with probability 0.9, so that long carries come at once: a counter's top bits are reached without 2^n cycles),
 * every flip-flop compared after each rising edge. inputs: top ports' values (0 unless given).
 * Returns { ok, flipFlops, message } (message: the first difference).
 */
export function simCheck(json, design, { cycles = 1000, starts = 0, inputs = {} } = {}) {
  const A = netlistSim(topModule(json)[1], inputs), B = xdlSim(design, inputs);
  const byName = new Map(B.ffs.map(f => [f.name, f]));
  for (const f of A.ffs) if (!byName.has(f.name)) return { ok: false, flipFlops: A.ffs.length, message: `flip-flop ${f.name} not in the XDL` };
  const run = (n, from) => {
    for (let t = 0; t < n; t++) {
      settle(A, 'netlist'); settle(B, 'XDL');
      clock(A); clock(B);
      for (const f of A.ffs) {
        const a = A.get(f.q), b = B.get(byName.get(f.name).q);
        if (a !== b) return `${from}cycle ${t + 1}: ${f.name} is ${a} in the netlist, ${b} in the XDL`;
      }
    }
    return null;
  };
  for (const f of A.ffs) { A.val.set(f.q, f.init); B.val.set(byName.get(f.name).q, byName.get(f.name).init); }
  let message = run(cycles, '');
  let seed = 1;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let k = 0; k < starts && !message; k++) {
    for (const f of A.ffs) { const v = rand() < 0.9 ? 1 : 0; A.val.set(f.q, v); B.val.set(byName.get(f.name).q, v); }
    message = run(64, `start ${k + 1}, `);
  }
  return { ok: !message, flipFlops: A.ffs.length, message };
}
