// The Spartan-6 designs of the placer's and the routing's tests (#729, #730): a design synthesized for the Spartan-6
// (the open synthesis, Yosys xc6s), packed, its physical design, on the boards' parts; a placed design routed by
// nextpnr, as the flow's Place & Route routes it (#2824).
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { readYosysJson } from '../packages/silinx-fpga/src/fpga/netlist.js';
import { loadDeviceCache } from '../packages/silinx-fpga/src/fpga/device-node.js';
import { packS6 } from '../packages/silinx-fpga/src/fpga/s6/pack.js';
import { physS6 } from '../packages/silinx-fpga/src/fpga/s6/phys.js';
import { s6Sites } from '../packages/silinx-fpga/src/fpga/s6/sites.js';
import { siteNetlist, routedDesignS6 } from '../packages/silinx-fpga/src/fpga/s6/nextpnr.js';
import { nextpnrS6Node } from '../packages/silinx-fpga/src/nextpnr-s6-node.js';
import { example, exampleUcf } from './examples-lib.mjs';

/** The boards of the Spartan-6 toolchain: their part (the device description) and board id (the UCF). */
export const S6_BOARDS = [
  { board: 'nexys3', part: 'xc6slx16csg324-3' },
  { board: 'atlys', part: 'xc6slx45csg324-3' },
];

/** The Nexys3's eight switches and eight LEDs (its UCF's pads), for the designs a test routes by nextpnr: a pad left to
 *  the placer may be one whose I/O path the bit database, and so nextpnr's chip database, does not have (#2824). */
export const NEXYS3_SW = ['T10', 'T9', 'V9', 'M8', 'N8', 'U8', 'V8', 'T5'];
export const NEXYS3_LD = ['U16', 'V16', 'U15', 'V15', 'M11', 'N11', 'R11', 'T11'];

const devices = new Map();
/** A part's device description and its sites (loaded once). */
export function s6Device(part) {
  if (!devices.has(part)) { const device = loadDeviceCache(part); devices.set(part, { device, sites: s6Sites(device) }); }
  return devices.get(part);
}

/** A design synthesized for the Spartan-6, read as the packer reads it (the UNISIM primitives it instantiates
 *  compiled with it, as the flow's front end compiles them). */
export async function s6Netlist(sources, top) {
  const d = elaborate(compile([...primitiveSources(sources), ...sources]), top);
  const r = await synthesizeOpen(d, { family: 'spartan6', run: yosysNode });
  return readYosysJson(r.files[`${r.top}.json`], { top: r.top });
}
export const s6Verilog = text => s6Netlist([{ path: 'm.v', lang: 'verilog', text }], 'm');

/** A netlist packed and turned into its physical design: { nl, packed, phys }. */
export function s6Phys(nl, ucf = null) {
  const packed = packS6(nl);
  return { nl, packed, phys: physS6(nl, packed, { ucf }) };
}

const netlists = new Map();
/** An example on a board: { nl, packed, phys, ucf } (the netlist synthesized once). */
export async function s6Example(name, board) {
  if (!netlists.has(name)) {
    const ex = example(name);
    netlists.set(name, await s6Netlist(ex.design.map(f => ({ path: f.path, lang: f.lang, text: f.text })), ex.project.top));
  }
  const ucf = exampleUcf(name, { board }).text;
  return { ...s6Phys(netlists.get(name), ucf), ucf };
}

let nextpnr = null;
/** A design the Spartan-6's placer placed (placedXdlS6's, for its part) routed by nextpnr, as the flow's Place & Route
 *  routes the placement it keeps (open-flow-nextpnr-s6.js: its run with --no-place; a pad off a global buffer's
 *  dedicated path GENERAL_OK): the routed design (routedDesignS6's, for writeXdl). nextpnr's ERROR lines in the error. */
export async function s6RouteNextpnr(placed, part, { seed = 1 } = {}) {
  const { device, sites } = s6Device(part), name = part.replace(/-\d+$/, '');
  nextpnr ||= nextpnrS6Node();
  const generalOk = new Set(placed.insts.filter(i => i.placed && sites.pads.has(i.site) && !sites.pads.get(i.site).bufg.length).map(i => i.name));
  const input = siteNetlist(placed, { top: 'top', generalOk, chains: [], device });
  const lines = [];
  let files;
  try {
    files = await nextpnr.run(['--device', name, '--chipdb', 'chipdb.bin', '--json', 'design.json', '--write', 'out.json', '--no-place', '--seed', String(seed), '--timing-allow-fail'],
      { 'design.json': JSON.stringify(input), 'chipdb.bin': await nextpnr.chipdb(name, () => {}) }, l => lines.push(l));
  } catch (e) {
    throw new Error(`nextpnr's routing failed: ${e?.message ?? lines.filter(l => /^ERROR:/.test(l)).join(' ')}`);
  }
  const out = files['out.json'];
  return routedDesignS6(JSON.parse(typeof out === 'string' ? out : new TextDecoder().decode(out)), placed, device);
}
