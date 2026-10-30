// Silinx toolchain - nextpnr's routed design as XDL (#1954, #2136): nextpnr-himbaechel with the spartan3e micro-architecture
// (the fork pmnmalo/nextpnr-spartan) places and routes the netlist; its routed design (its --write JSON) becomes the
// XDL design the rest of the flow reads (the timing, the pins, the bitstream). Moved from
// packages/silinx-fpga/research/nextpnr-s3e/lib.mjs, which re-exports it.
import { writeXdl } from '../xdl.js';
import { initToEquation } from './lut.js';

const topModule = json => Object.entries(json.modules).find(([, m]) => m.attributes?.top) || Object.entries(json.modules)[0];
const esc = x => String(x).replace(/:/g, '_');
const bitsOf = v => (typeof v === 'string' ? v : (v >>> 0).toString(2));
const portNet = (c, p) => c.connections?.[p]?.[0];
// a cell's string parameter (nextpnr writes a string with a trailing space, to tell it from a bit string)
const strParam = (c, p) => (typeof c.parameters?.[p] === 'string' ? c.parameters[p].replace(/ $/, '') : c.parameters?.[p]);

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
 *  each LUT input was routed to (its inputs are permutable: S<i>_FI<j> is reached from any of F1..F4):
 *  - the LUT's output (S<i>_FOUT / GOUT) or the carry's sum (S<i>_XORF / XORG) to X / Y (FXMUX / GYMUX) and to the
 *    flip-flop's D (S<i>_DX / DY: DXMUX / DYMUX), or BX / BY to the flip-flop;
 *  - the carry in (S<i>_CI: CYINIT) from CIN or BX; a MUXCY's DI (S<i>_DIF / DIG: CY0F / CY0G) from pin 1 or BX / BY. */
function siteRoutes(mod, insts, v) {
  for (const n of Object.values(mod.netnames)) {
    for (const [, pip] of routing(n)) {
      if (!pip) continue;
      const [tile, dst, src] = pip.split('/');
      const m = /^S(\d+)_(\w+)$/.exec(src) || /^S(\d+)_(\w+)$/.exec(dst);
      if (!m) continue;
      const inst = insts.get(v.siteName(tile, +m[1]));
      const pinOf = w => v.pinOfWire(v.tileAt.get(tile)).get(w)?.pin;   // a site pin's name (F1, BX, CIN…)
      let x;
      if ((x = /^S\d+_([FG])I(\d)$/.exec(dst))) (inst.lutPins[x[1]] ||= [])[+x[2]] = +pinOf(src)[1];   // F1..F4 / G1..G4
      else if (/^S\d+_CI$/.test(dst)) inst.mux.CYINIT = pinOf(src);                                     // CIN / BX
      else if ((x = /^S\d+_DI([FG])$/.exec(dst))) inst.mux[`CY0${x[1]}`] = pinOf(src);                 // F1 / G1 / BX / BY
      else {
        const side = /^S\d+_(F|XORF)/.test(src) ? 'X' : /^S\d+_(G|XORG)/.test(src) ? 'Y' : null;
        const what = /XOR[FG]$/.test(src) ? 'xor' : /OUT$/.test(src) ? 'lut' : 'bypass';
        if (/^S\d+_D[XY]$/.test(dst)) inst.mux[`D${dst.slice(-1)}`] = what;                             // -> the flip-flop
        else if (side) inst.mux[side] = what;                                                              // -> X / Y
      }
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

/** A slice's carry settings, as Silinx's packer writes them (pack-cfg.js): CYINIT, per side its MUXCY (CYMUXF, CYSELF,
 *  CY0F and its constant's GNDF / C1VDD) and XORCY (XORF), COUTUSED when the chain goes on up the column. */
function carryCfg(inst, add) {
  const c = inst.cells;
  if (!c.CYMUXF && !c.XORF && !c.CYMUXG && !c.XORG) return;
  if (c.CYMUXF || c.XORF) add('CYINIT', '', inst.mux.CYINIT || 'BX');
  for (const [side, vdd] of [['F', 'C1VDD'], ['G', 'C2VDD']]) {
    const mux = c[`CYMUX${side}`], xr = c[`XOR${side}`];
    if (mux) {
      add(`CYMUX${side}`, esc(mux.name), '');
      add(`CYSEL${side}`, '', side);
      const k = strParam(mux, 'CY0');
      const cy0 = k !== undefined ? String(k) : inst.mux[`CY0${side}`] || `${side}1`;
      add(`CY0${side}`, '', cy0);
      if (cy0 === '0') add(`GND${side}`, `${inst.name}.GND${side}`, '');
      if (cy0 === '1') add(vdd, `${inst.name}.${vdd}`, '');
    }
    if (xr) add(`XOR${side}`, esc(xr.name), '');
  }
  if (c.CYMUXG && portNet(c.CYMUXG, 'O') !== undefined) add('COUTUSED', '', '0');
}

/** An instance's XDL type, name and settings (cfg items), as ISE's map writes them. */
function instanceCfg(inst, mod) {
  const cfg = [], c = inst.cells;
  const add = (attr, name, value) => cfg.push({ attr, name, value });
  if (inst.siteType === 'SLICEL' || inst.siteType === 'SLICEM') {
    inst.type = 'SLICEL';                // (logic on a SLICEM site too: ISE's DRC wants a SLICEL comp there)
    inst.name = esc((c.FFX || c.FFY || c.FLUT || c.GLUT || c.CYMUXF || c.XORF).name);
    for (const [side, lut] of [['F', c.FLUT], ['G', c.GLUT]]) if (lut) add(side, esc(lut.name), `#LUT:${initToEquation(bitsOf(lut.parameters.INIT), 4, lutPins(inst.lutPins[side]))}`);
    let ctrl = null;
    for (const [X, ff] of [['X', c.FFX], ['Y', c.FFY]]) {
      if (!ff) continue;
      const init = parseInt(bitsOf(ff.parameters.INIT ?? '0'), 2) & 1, mode = strParam(ff, 'SRMODE') ?? 'NONE';
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
    carryCfg(inst, add);
    const bx = inst.mux.DX === 'bypass' || inst.mux.CYINIT === 'BX' || inst.mux.CY0F === 'BX';
    const by = inst.mux.DY === 'bypass' || inst.mux.CY0G === 'BY';
    if (bx) add('BXINV', '', 'BX');
    if (by) add('BYINV', '', 'BY');
    // FXMUX / GYMUX: the LUT or the carry's sum, to X / Y or to the flip-flop
    for (const [X, mux, l, sum] of [['X', 'FXMUX', 'F', 'FXOR'], ['Y', 'GYMUX', 'G', 'GXOR']]) {
      const from = [inst.mux[X], inst.mux[`D${X}`]].find(w => w === 'lut' || w === 'xor');
      if (from) add(mux, '', from === 'xor' ? sum : l);
    }
    if (inst.mux.X) add('XUSED', '', '0');
    if (inst.mux.Y) add('YUSED', '', '0');
  } else if (c.IOB) {
    // the IOB's name: its port bit, as the UCF names it (led<3>: nextpnr writes a bus's bits as one port again)
    const pad = portNet(c.IOB, 'PAD');
    const [port, d] = Object.entries(mod.ports).find(([, p]) => p.bits.includes(pad)) || [c.IOB.name, null];
    inst.name = d && d.bits.length > 1 ? `${port}<${d.bits.indexOf(pad)}>` : port.replace(/\[(\d+)\]$/, '<$1>');
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

// ---------------------------------------------------------------- measuring the result
/** The slices, LUTs and flip-flops of an XDL design (parseXdl's). */
export function xdlSize(design) {
  const slices = design.insts.filter(i => /^SLICE[LM]$/.test(i.type));
  const has = attr => slices.reduce((n, i) => n + i.cfg.filter(c => c.attr === attr).length, 0);
  return { slices: slices.length, luts: has('F') + has('G'), ffs: has('FFX') + has('FFY') };
}
