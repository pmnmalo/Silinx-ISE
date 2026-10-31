// Silinx toolchain - the Spartan-6 through nextpnr (#2138): a design of whole sites (fpga/s6/pack.js, phys.js, xdl.js)
// as the netlist the fork's spartan6 micro-architecture places and routes, and its results read back: the sites its cells
// took (the placement placedXdlS6 takes) and the PIPs of its nets (the routed design routedXdlS6 writes).
//
//   siteNetlist(design, { top, fixed, chains, generalOk, arcs }) -> the JSON netlist of a placed or unplaced XDL design
//   placementOf(json, phys, device) -> { site, tile, pos } by phys.insts
//   routedDesignS6(json, placed, device) -> the routed design for writeXdl
import { routing } from '../nextpnr-xdl.js';
import { arcsS6, S6_CLOCK_PIN } from './timing.js';
import { routingResources, netEndpointsS6 } from './route-nets.js';
import { mountRoutedS6 } from './route-output.js';

// the BEL type of a site type (the fork's gen/s6_gen.py)
const belType = t => (/^IOB[MS]$/.test(t) ? 'IOB' : t);
// an XDL instance's cell type: the site type it needs
const cellType = t => (t === 'BUFG' ? 'BUFGMUX' : t);

/** A site's BEL name in nextpnr: X<col>Y<row>/S<its index in the tile>_<its type>. */
export function siteBel(device, name) {
  const s = device.site(name);
  const i = device.tileSites[s.tile].findIndex(([n]) => n === name);
  return `X${device.tileCol[s.tile]}Y${device.tileRow[s.tile]}/S${i}_${belType(s.type)}`;
}

// the clock a pin of a block RAM goes with: its port's, or the only one in use
function clockOfPin(pin, clocks) {
  if (clocks.length < 2) return clocks[0];
  const a = /^(ADDRA|DIA|DIPA|DOA|DOPA|WEA|ENA|RSTA|REGCEA)/.test(pin);
  return clocks.find(c => /^CLKA/.test(c) === a) ?? clocks[0];
}

/** An instance's timing arcs as the micro-architecture's TMG parameter (spartan6.cc), in ps. Only the pins it uses. */
export function timingParam(inst, arcs, ins) {
  // (not placed yet: the arcs of no site class)
  const a = arcs(inst.tile ? inst : { ...inst, tile: '', site: '' }), ps = ns => Math.round(ns * 1000);
  const clocks = ins.filter(p => S6_CLOCK_PIN.test(p));
  const out = a.comb.map(([f, t, d]) => `c ${f} ${t} ${ps(d)}`);
  if (clocks.length) {
    const inverted = inst.cfg?.some(c => c.attr === 'CLKINV' && c.value === 'CLK_B');
    for (const c of clocks) out.push(`k ${c} ${inverted ? 'f' : 'r'}`);
    // (a pin's setup, its longest)
    const setup = new Map();
    for (const [p, d] of a.setup) if (ins.includes(p)) setup.set(p, Math.max(setup.get(p) ?? 0, d));
    for (const [p, d] of setup) out.push(`s ${p} ${clockOfPin(p, clocks)} ${ps(d)}`);
    const q = new Map();
    for (const [p, d] of a.clkToOut) q.set(p, Math.max(q.get(p) ?? 0, d));
    for (const [p, d] of q) out.push(`q ${p} ${clockOfPin(p, clocks)} ${ps(d)}`);
  }
  return out.join(';');
}

// a string parameter, as nextpnr's JSON tells it from a bit string
const str = s => `${s} `;

/**
 * An XDL design (placedXdlS6's) as nextpnr's JSON netlist: a cell per instance, its ports the site pins in use, its nets
 * the design's. fixed: Map instance name -> site (its BEL attribute); chains: [[instance names, bottom first]];
 * generalOk: Set of instance names (spartan6.cc's GENERAL_OK). A power net with no source yet is left out.
 */
export function siteNetlist(design, { top = design.name, fixed = new Map(), chains = [], generalOk = new Set(), device }) {
  const cells = {}, netnames = {};
  const arcs = arcsS6(design);
  const ins = new Map();
  for (const inst of design.insts) {
    cells[inst.name] = { type: cellType(inst.type), port_directions: {}, connections: {}, attributes: {}, parameters: {} };
    ins.set(inst.name, []);
  }
  let bit = 2;
  for (const n of design.nets) {
    if (!n.outpins.length || !n.inpins.length) continue;
    const b = bit++;
    netnames[n.name] = { bits: [b], attributes: {} };
    for (const p of n.outpins) { cells[p.inst].port_directions[p.pin] = 'output'; cells[p.inst].connections[p.pin] = [b]; }
    for (const p of n.inpins) { cells[p.inst].port_directions[p.pin] = 'input'; cells[p.inst].connections[p.pin] = [b]; ins.get(p.inst).push(p.pin); }
  }
  for (const inst of design.insts) {
    const c = cells[inst.name];
    const site = fixed.get(inst.name) ?? (inst.placed && inst.site ? inst.site : null);
    if (site) c.attributes.BEL = siteBel(device, site);
    if (generalOk.has(inst.name)) c.parameters.GENERAL_OK = str('1');
    if (inst.type !== 'TIEOFF') { const t = timingParam(inst, arcs, ins.get(inst.name)); if (t) c.parameters.TMG = str(t); }
  }
  for (const ch of chains) ch.forEach((name, k) => { if (k + 1 < ch.length) cells[name].parameters.CHAIN_NEXT = str(ch[k + 1]); });
  return { creator: 'Silinx', modules: { [top]: { attributes: { top: '00000000000000000000000000000001' }, ports: {}, cells, netnames } } };
}

const moduleOf = json => Object.entries(json.modules).find(([, m]) => m.attributes?.top)?.[1] ?? Object.values(json.modules)[0];

/** The sites nextpnr's result gives the instances of a physical design: { site, tile, pos } by phys.insts, as placeS6's. */
export function placementOf(json, phys, device) {
  const mod = moduleOf(json);
  const at = new Map();
  for (let k = 0; k < device.tileCount; k++) at.set(`X${device.tileCol[k]}Y${device.tileRow[k]}`, k);
  const site = [], tile = [], pos = [];
  for (const inst of phys.insts) {
    const bel = mod.cells[inst.name]?.attributes?.NEXTPNR_BEL;
    if (!bel) throw new Error(`${inst.name}: not placed by nextpnr`);
    const [t, b] = bel.split('/');
    const k = at.get(t), [name] = device.tileSites[k][+/^S(\d+)_/.exec(b)[1]];
    const x = +(/^SLICE_X(\d+)/.exec(name)?.[1] ?? 0);
    site.push(name);
    tile.push(device.tileName(k));
    pos.push([device.tileCol[k] + (x % 2) * 0.25, device.rows - 1 - device.tileRow[k]]);
  }
  return { site, tile, pos };
}

/** The routed design (for writeXdl) from nextpnr's routing of a placed XDL design: routedXdlS6's, on nextpnr's PIPs. */
export function routedDesignS6(json, placed, device) {
  const mod = moduleOf(json);
  const res = routingResources(device);
  const E = device.routingEdges();
  const edgeAt = new Map();
  for (let e = 0; e < E.edgeTo.length; e++) edgeAt.set(E.edgeTile[e] * 1048576 + E.edgePip[e], e);
  const at = new Map();
  for (let k = 0; k < device.tileCount; k++) at.set(`X${device.tileCol[k]}Y${device.tileRow[k]}`, k);
  const { nets: work, errors } = netEndpointsS6(placed, device, res);
  if (errors.length) throw new Error(errors.slice(0, 5).join('; '));
  const unrouted = [];
  const trees = work.map(w => {
    const tree = new Map(w.sources.map(s => [s, -1]));
    const route = routing(mod.netnames[w.name] ?? {});
    if (!route.length && w.sinks.some(s => !tree.has(s.node))) unrouted.push(w.name);
    for (const [, pip] of route) {
      if (!pip) continue;
      const [t, dst, src] = pip.split('/');
      const k = at.get(t), i = device.findPip(k, src, dst);
      if (i < 0) throw new Error(`${w.name}: no PIP ${t} ${src} -> ${dst}`);
      const e = edgeAt.get(k * 1048576 + i);
      tree.set(E.edgeTo[e], e);
    }
    return tree;
  });
  if (unrouted.length) throw new Error(`nets not routed: ${unrouted.slice(0, 10).join(', ')}`);
  return mountRoutedS6({ design: placed, device, res, r: { work, trees, E, fromOf: null } });
}
