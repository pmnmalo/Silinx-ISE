// The Spartan-6 designs of the placer's and the router's tests (#729, #730): a design synthesized for the Spartan-6
// (the open synthesis, Yosys xc6s), packed, its physical design, on the boards' parts.
import { compile, elaborate } from '../core/compile.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { readYosysJson } from '../packages/silinx-fpga/src/fpga/netlist.js';
import { loadDeviceCache } from '../packages/silinx-fpga/src/fpga/device-node.js';
import { packS6 } from '../packages/silinx-fpga/src/fpga/s6/pack.js';
import { physS6 } from '../packages/silinx-fpga/src/fpga/s6/phys.js';
import { s6Sites } from '../packages/silinx-fpga/src/fpga/s6/sites.js';
import { example, exampleUcf } from './examples-lib.mjs';

/** The boards of the Spartan-6 toolchain: their part (the device description) and board id (the UCF). */
export const S6_BOARDS = [
  { board: 'nexys3', part: 'xc6slx16csg324-3' },
  { board: 'atlys', part: 'xc6slx45csg324-3' },
];

const devices = new Map();
/** A part's device description and its sites (loaded once). */
export function s6Device(part) {
  if (!devices.has(part)) { const device = loadDeviceCache(part); devices.set(part, { device, sites: s6Sites(device) }); }
  return devices.get(part);
}

/** A design synthesized for the Spartan-6, read as the packer reads it. */
export async function s6Netlist(sources, top) {
  const d = elaborate(compile(sources), top);
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
