// Silinx - the Spartan-6 router's nets and resources (#730, core/fpga/s6/route.js): the endpoints of each net of a
// placed design, the nodes of the general interconnect (which the global clocks do not take), the sites of the
// route-through PIPs and which of them a net may take, the TIEOFFs the power nets are routed from (browser + Node).
import { PIP_ROUTETHRU } from '../device.js';

// a wire of the general interconnect in a switch box: the singles, doubles and quads (EE2B3, SR1E1, NN4M0 …), the
// logic inputs and outputs, the fan wires, the constants (the clock and set / reset pin wires CLK0, SR1 are not)
const GENERAL_WIRE = /^((EE|EL|ER|NE|NL|NN|NR|NW|SE|SL|SR|SS|SW|WL|WR|WW)[124][A-Z]|LOGICIN|LOGICOUT|FAN|GFAN|KEEP\d|VCC_WIRE|GND_WIRE)/;
// the sites whose route-throughs any net may take when the design has no instance on them: the I/O logic between a
// pad and the interconnect (ILOGIC2 D -> FABRICOUT, OLOGIC2 D1 -> OQ, T1 -> TQ), the clock spines' BUFH, as ISE
// routes them (their XDL_DUMMY instances); a slice's only out of the net's own source (COUT -> DMUX, route.js)
export const FREE_ROUTETHRU = new Set(['ILOGIC2', 'OLOGIC2', 'BUFH']);

const cache = new WeakMap();
/** The router's view of a device (built once a device): { general, rtSite, rtPins, tieoffs }. */
export function routingResources(device) {
  if (cache.has(device)) return cache.get(device);
  const N = device.nodeCount;
  // the nodes of the general interconnect
  const general = new Uint8Array(N);
  const tplGeneral = device.templates.map(tp => Uint8Array.from(tp.wires, w => (GENERAL_WIRE.test(device.names[w]) ? 1 : 0)));
  for (let n = 0; n < N; n++) {
    for (let j = device.nodeStart[n]; j < device.nodeStart[n + 1]; j++) {
      const w = device.nodeWires[j], k = device.wireTile[w];
      if (tplGeneral[device.tileTemplate[k]][w - device.tileWireBase[k]]) { general[n] = 1; break; }
    }
  }
  // the site of each route-through PIP of a template (by its from-wire, a pin of the site), and its two pins
  const rtSite = device.templates.map(tp => {
    const siteOfWire = new Map();
    tp.sites.forEach((s, i) => { for (const p of s.pins.values()) siteOfWire.set(p.wire, i); });
    return Int16Array.from(tp.from, (f, i) => (tp.flags[i] & PIP_ROUTETHRU ? siteOfWire.get(f) ?? siteOfWire.get(tp.to[i]) ?? -1 : -1));
  });
  const rtPins = device.routethrus.map(r => { const m = /^_ROUTETHROUGH-(\w+)-(\w+) (\w+)$/.exec(r); return m ? { from: m[1], to: m[2], type: m[3] } : null; });
  // the TIEOFF of each tile that has one: its HARD1 and HARD0 nodes
  const tieoffs = new Map();
  for (const s of device.sites('TIEOFF')) tieoffs.set(s.tile, { site: s.name, tile: s.tile, hard1: device.sitePinNode(s.name, 'HARD1'), hard0: device.sitePinNode(s.name, 'HARD0') });
  const r = { general, rtSite, rtPins, tieoffs };
  cache.set(device, r);
  return r;
}

/** The site name of route-through PIP i of tile k, or null. */
export function routeThruSite(device, res, k, i) {
  const s = res.rtSite[device.tileTemplate[k]][i];
  return s < 0 ? null : device.tileSites[k][s][0];
}

/**
 * The routing problem of a placed design (parseXdl's structure, core/fpga/s6/xdl.js placedXdlS6's): each net's
 * source nodes and sinks, its kind ('wire', a 'clock' from a global buffer, 'vcc' / 'gnd' with no source: routed
 * from the TIEOFFs near its sinks, as ISE), the site of its source; the problems in `errors`.
 */
export function netEndpointsS6(design, device, res = routingResources(device)) {
  const instByName = new Map(design.insts.map(i => [i.name, i]));
  const nets = [], errors = [];
  const pinNode = (p, what, net) => {
    const inst = instByName.get(p.inst);
    if (!inst?.placed) { errors.push(`net ${net.name}: ${what} ${p.inst}.${p.pin}: instance not placed or unknown`); return -1; }
    const n = device.sitePinNode(inst.site, p.pin);
    if (n < 0) errors.push(`net ${net.name}: ${what} ${p.inst}.${p.pin}: site ${inst.site} has no pin ${p.pin}`);
    return n;
  };
  const used = new Set(design.insts.filter(i => i.placed).map(i => i.site));
  for (const net of design.nets) {
    // (a power net with its TIEOFF already, as placedXdlS6 writes them, is routed as any other)
    const kind = net.type === 'vcc' || net.type === 'power' || net.type === 'vdd' ? 'vcc' : net.type === 'gnd' || net.type === 'ground' ? 'gnd' : null;
    const power = kind && !net.outpins.length ? kind : null;
    const sinks = net.inpins.map(p => ({ pin: p, node: pinNode(p, 'inpin', net), site: instByName.get(p.inst)?.site })).filter(s => s.node >= 0);
    const src = net.outpins[0];
    const sources = net.outpins.map(p => pinNode(p, 'outpin', net)).filter(n => n >= 0);
    const driver = src && instByName.get(src.inst);
    if (!power && !sources.length) { if (sinks.length) errors.push(`net ${net.name}: no source`); continue; }
    nets.push({
      net, name: net.name, power, sinks, sources, sourceSite: driver?.site ?? null,
      clock: !power && (driver?.type === 'BUFG' || driver?.type === 'BUFGMUX'),
      // a pad into a global buffer: the dedicated clock path
      dedicated: !power && driver?.type === 'IOB' && net.inpins.length > 0 && net.inpins.every(p => /^BUFG/.test(instByName.get(p.inst)?.type || '')),
    });
  }
  return { nets, errors, used };
}

/** The TIEOFF sources a power sink may be routed from: those of the tiles nearest its node (ISE: its switch box's). */
export function powerSources(device, res, node, power, near = 2) {
  const r = (device.nodeR0[node] + device.nodeR1[node]) >> 1, c = (device.nodeC0[node] + device.nodeC1[node]) >> 1;
  const out = [];
  for (let dr = -near; dr <= near; dr++) {
    for (let dc = -near; dc <= near; dc++) {
      const k = device.tileIndex.get(tileAt(device, r + dr, c + dc));
      const t = k === undefined ? null : res.tieoffs.get(k);
      if (t) out.push({ ...t, node: power === 'vcc' ? t.hard1 : t.hard0, d: Math.abs(dr) + Math.abs(dc) });
    }
  }
  return out.sort((a, b) => a.d - b.d);
}
const grids = new WeakMap();
function tileAt(device, r, c) {
  let g = grids.get(device);
  if (!g) { g = new Map(); for (let k = 0; k < device.tileCount; k++) g.set(device.tileRow[k] * 4096 + device.tileCol[k], device.tileNames[k]); grids.set(device, g); }
  return g.get(r * 4096 + c);
}
