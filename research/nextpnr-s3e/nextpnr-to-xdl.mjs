// nextpnr-himbaechel's routed design (spartan3e micro-architecture, #1954) to XDL, so that Silinx's bitgen
// writes its .bit and ISE checks it (xdl -xdl2ncd, drc).
//
//   node research/nextpnr-s3e/nextpnr-to-xdl.mjs routed.json sites.json out.xdl [part]
//
// routed.json: nextpnr's --write; sites.json: the XDL site of each BEL's site ("X<c>Y<r>/<site index>"),
// written by the chip database's generator (s3e_gen.py). The spike's cells only: LUT4, FF, IOB, BUFGMUX.
//
// A net's site pins are the site-pin wires on its route (the device graph's pinwires): a pin wire is an
// outpin or an inpin as the site pin's direction says. The route's PIPs inside a slice (the generator's
// S<i>_* wires) set the slice's multiplexers (FXMUX, DXMUX…) instead of being written.
import fs from 'node:fs';
import { writeXdl } from '../../packages/silinx-fpga/src/xdl.js';
import { initToEquation } from '../../packages/silinx-fpga/src/fpga/lut.js';
import { loadDeviceCache } from '../../packages/silinx-fpga/src/fpga/device-node.js';

const Z_STRIDE = 8;
const [routedFile, sitesFile, outFile, partArg] = process.argv.slice(2);
if (!outFile) { console.error('usage: nextpnr-to-xdl.mjs routed.json sites.json out.xdl [part]'); process.exit(2); }
const part = partArg || 'xc3s250ecp132-4';
const json = JSON.parse(fs.readFileSync(routedFile, 'utf8'));
const siteOf = JSON.parse(fs.readFileSync(sitesFile, 'utf8'));
const device = loadDeviceCache(part);
const top = Object.entries(json.modules).find(([, m]) => m.attributes?.top) || Object.entries(json.modules)[0];
const mod = top[1];

// "X<c>Y<r>" -> the device's tile index
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
const siteName = (tile, index) => siteOf[`${tile}/${index}`];
const bit = (v) => typeof v === 'string' ? v : (v >>> 0).toString(2);
const param = (c, p, d = null) => c.parameters?.[p] ?? d;
const portNet = (c, p) => c.connections?.[p]?.[0];
const netName = new Map();
for (const [name, n] of Object.entries(mod.netnames)) for (const b of n.bits) if (!netName.has(b) || !n.hide_name) netName.set(b, name);

// ---------------------------------------------------------------- instances, one per used site
const insts = new Map();   // site name -> { name, type, tile, site, cells: { z offset: cell }, ... }
for (const [name, c] of Object.entries(mod.cells)) {
  const bel = c.attributes?.NEXTPNR_BEL;
  if (!bel) throw new Error(`${name}: not placed`);
  const [tile, belName] = bel.split('/');
  const m = /^S(\d+)_/.exec(belName);
  const index = +m[1], site = siteName(tile, index);
  const k = tileAt.get(tile);
  let inst = insts.get(site);
  if (!inst) {
    const s = device.site(site);
    inst = { name: null, siteType: s.type, tile: device.tileName(k), site, cells: {}, mux: {}, lutPins: {} };
    insts.set(site, inst);
  }
  inst.cells[belName.slice(m[0].length)] = { name, ...c };
}
// the slices' multiplexers, from the route's PIPs inside the sites, and the site pin each LUT input was routed
// to (its inputs are permutable: S<i>_FI<j> is reached from any of F1..F4)
for (const n of Object.values(mod.netnames)) {
  const r = n.attributes?.ROUTING;
  if (!r) continue;
  const parts = r.split(';');
  for (let i = 0; i + 2 < parts.length; i += 3) {
    if (!parts[i + 1]) continue;
    const [tile, dst, src] = parts[i + 1].split('/');
    const m = /^S(\d+)_(\w+)$/.exec(src) || /^S(\d+)_(\w+)$/.exec(dst);
    if (!m) continue;
    const inst = insts.get(siteName(tile, +m[1]));
    const li = /^S\d+_([FG])I(\d)$/.exec(dst);
    if (li) {
      const pin = pinOfWire(tileAt.get(tile)).get(src).pin;   // F1..F4 / G1..G4
      (inst.lutPins[li[1]] ||= [])[+li[2]] = +pin[1];
    } else if (/OUT$/.test(src) && !/^S\d+_D/.test(dst)) inst.mux[src.endsWith('FOUT') ? 'X' : 'Y'] = 'used';        // LUT -> X / Y pin
    else if (/OUT$/.test(src)) inst.mux[`D${dst.slice(-1)}`] = 'lut';                                       // LUT -> flip-flop
    else inst.mux[`D${dst.slice(-1)}`] = 'bypass';                                                           // BX / BY -> flip-flop
  }
}

// a LUT's site pins by input (I0..I3), the unconnected inputs on the pins left (their values do not matter: the
// INIT repeats over them)
const lutPins = chosen => {
  const pins = [0, 1, 2, 3].map(i => chosen?.[i]);
  const free = [1, 2, 3, 4].filter(k => !pins.includes(k));
  return pins.map(k => k ?? free.shift());
};
const esc = x => String(x).replace(/:/g, '_');
const xdlInsts = [];
for (const inst of insts.values()) {
  const cfg = [];
  const add = (attr, name, value) => cfg.push({ attr, name, value });
  const c = inst.cells;
  if (inst.siteType === 'SLICEL' || inst.siteType === 'SLICEM') {
    inst.type = 'SLICEL';                // (logic on a SLICEM site too: ISE's DRC wants a SLICEL comp there)
    for (const [side, lut] of [['F', c.FLUT], ['G', c.GLUT]]) if (lut) add(side, esc(lut.name), `#LUT:${initToEquation(bit(param(lut, 'INIT')), 4, lutPins(inst.lutPins[side]))}`);
    let ctrl = null;
    for (const [X, ff] of [['X', c.FFX], ['Y', c.FFY]]) {
      if (!ff) continue;
      const init = parseInt(bit(param(ff, 'INIT', '0')), 2) & 1, mode = param(ff, 'SRMODE', 'NONE');
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
  xdlInsts.push({ name: inst.name, type: inst.type, placed: true, tile: inst.tile, site: inst.site, cfg });
}

// ---------------------------------------------------------------- nets: their site pins and PIPs
const xdlNets = [];
for (const [name, n] of Object.entries(mod.netnames)) {
  const r = n.attributes?.ROUTING;
  if (!r || n.hide_name && netName.get(n.bits[0]) !== name) continue;
  const parts = r.split(';');
  const net = { name, type: 'wire', outpins: [], inpins: [], pips: [] };
  // a routed wire is named by its node's first tile wire: its site pins are the node's pin wires
  const seen = new Set();
  for (let i = 0; i + 2 < parts.length; i += 3) {
    const [tile, wire] = parts[i].split('/');
    const node = device.node(tileAt.get(tile), wire);
    if (node < 0 || seen.has(node)) continue;
    seen.add(node);
    for (const w of device.nodeWireIds(node)) {
      const k = device.wireTile[w], x = device.wireInfo(w);
      const p = pinOfWire(k).get(x.name);
      const inst = p && insts.get(siteName(`X${device.tileCol[k]}Y${device.tileRow[k]}`, p.site));
      if (inst) (p.dir === 'o' ? net.outpins : net.inpins).push({ inst: inst.name, pin: p.pin });
    }
  }
  for (let i = 0; i + 2 < parts.length; i += 3) {
    if (!parts[i + 1]) continue;
    const [tile, dst, src] = parts[i + 1].split('/');
    if (/^S\d+_/.test(src) || /^S\d+_/.test(dst)) continue;   // inside a site: its multiplexers
    const k = tileAt.get(tile), pi = device.findPip(k, src, dst);
    if (pi < 0) throw new Error(`${name}: no PIP ${tile} ${src} -> ${dst}`);
    const x = device.pip(k, pi);
    net.pips.push({ tile: x.tile, from: x.from, dir: x.dir, to: x.to });
  }
  if (net.outpins.length || net.inpins.length) xdlNets.push(net);
}

// the check of the LUTs' pins: each input's net is the net on the site pin its equation reads it from
{
  const netAt = new Map();   // "inst pin" -> the net's first bit
  for (const net of xdlNets) for (const p of net.inpins) netAt.set(`${p.inst} ${p.pin}`, mod.netnames[net.name].bits[0]);
  for (const inst of insts.values()) {
    for (const [side, lut] of [['F', inst.cells.FLUT], ['G', inst.cells.GLUT]]) {
      if (!lut) continue;
      const pins = lutPins(inst.lutPins[side]);
      for (let i = 0; i < 4; i++) {
        const b = portNet(lut, `I${i}`);
        if (b === undefined || typeof b === 'string') continue;
        const at = netAt.get(`${inst.name} ${side}${pins[i]}`);
        if (at !== b) throw new Error(`${lut.name}: I${i} on ${side}${pins[i]} carries another net`);
      }
    }
  }
}

// a BUFGMUX's select S tied to VCC, from its tile's VCC site, as ISE's map and Silinx write it
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
  xdlNets.push({ name: `GLOBAL_LOGIC1_${vccs++}`, type: 'vcc', outpins: [{ inst: dummy, pin: 'VCCOUT' }],
    inpins: [{ inst: inst.name, pin: 'S' }], pips: [{ tile: pip.tile, from: pip.from, dir: pip.dir, to: pip.to }] });
}

fs.writeFileSync(outFile, writeXdl({ name: top[0], part, insts: xdlInsts, nets: xdlNets, cfg: '', comment: 'from nextpnr-himbaechel (spartan3e), research/nextpnr-s3e' }));
console.log(`${outFile}: ${xdlInsts.length} instances, ${xdlNets.length} nets, ${xdlNets.reduce((s, x) => s + x.pips.length, 0)} PIPs`);
