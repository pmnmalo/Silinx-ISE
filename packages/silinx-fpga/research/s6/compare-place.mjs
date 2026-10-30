// The Spartan-6 placer (#729) against ISE's placement of the same netlists: night 1's implementations of Silinx's
// own EDIF of each example (research/s6/night1.mjs, `edif-<board>/<example>/top.xdl`, ISE 14.7 map + par), measured
// by the placer's own cost: the half-perimeter wirelength of the nets (clocks and power nets left out, VPR's
// correction for many pins) in tiles, per connection (ISE's map trims the netlist further), and the slices used. The result is Silinx's own record (no Xilinx file):
// research/s6/measured/place-compare.json.
//
//   node research/s6/compare-place.mjs [night1 folder (~/s6-night1)] [--seeds 3]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../src/xdl.js';
import { placeS6, crossing } from '../../src/fpga/s6/place.js';
import { checkPlacementS6 } from '../../src/fpga/s6/place-check.js';
import { EXAMPLE_ORDER } from '../../../../core/examples.js';
import { S6_BOARDS, s6Device, s6Example } from '../../../../test/s6-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const seeds = args.includes('--seeds') ? +args[args.indexOf('--seeds') + 1] : 3;
const dir = args.find(a => !a.startsWith('--') && a !== String(seeds)) || path.join(os.homedir(), 's6-night1');

// the position of a site as the placer's: its tile, the second slice of a CLB a quarter tile over
function positionOf(device, siteName) {
  const s = device.site(siteName);
  if (!s) return null;
  const m = /^SLICE_X(\d+)Y/.exec(siteName);
  return [device.tileCol[s.tile] + (m ? (+m[1] % 2) * 0.25 : 0), device.rows - 1 - device.tileRow[s.tile]];
}
// the wirelength of a placed design (parseXdl's): the nets but the clocks' (driven by a BUFG) and the power nets
// (and its connections: the pins of the nets measured but their drivers, for the wirelength per connection: ISE's map
// trims and merges the netlist further, so its designs have fewer nets than the packer's)
function xdlWirelength(design, device) {
  const pos = new Map(design.insts.filter(i => i.placed).map(i => [i.name, positionOf(device, i.site)]));
  const type = new Map(design.insts.map(i => [i.name, i.type]));
  let wl = 0, conns = 0;
  for (const n of design.nets) {
    if (n.type !== 'wire' || !n.outpins.length || type.get(n.outpins[0].inst) === 'BUFG') continue;
    const ps = [...new Set([...n.outpins, ...n.inpins].map(p => p.inst))].map(i => pos.get(i)).filter(Boolean);
    if (ps.length < 2) continue;
    const xs = ps.map(p => p[0]), ys = ps.map(p => p[1]);
    wl += (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)) * crossing(ps.length);
    conns += ps.length - 1;
  }
  return { wl, conns };
}
// the connections the placer's wirelength measures
const physConns = phys => phys.nets.filter(n => !n.clock && !n.power && n.driver).map(n => new Set([n.driver.inst, ...n.loads.map(l => l.inst)]).size).filter(k => k > 1).reduce((a, k) => a + k - 1, 0);

const out = { stage: 'S6-0 (night 1)', ise: 'ISE 14.7 map + par of Silinx\'s EDIF', measure: 'half-perimeter wirelength in tiles (the placer\'s cost)', boards: {} };
for (const { board, part } of S6_BOARDS) {
  const { device, sites } = s6Device(part);
  out.boards[board] = {};
  for (const name of EXAMPLE_ORDER) {
    const f = path.join(dir, `edif-${board}`, name, 'top.xdl');
    if (!fs.existsSync(f)) { console.log(`${board} ${name}: no ${f}`); continue; }
    const ise = parseXdl(fs.readFileSync(f, 'utf8'));
    const iseSlices = ise.insts.filter(i => /^SLICE[XLM]$/.test(i.type) && i.placed).length;
    const { nl, phys } = await s6Example(name, board);
    const runs = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const r = placeS6(phys, sites, { nl, seed });
      const err = checkPlacementS6(phys, sites, r);
      if (err.length) throw new Error(`${board} ${name} seed ${seed}: ${err[0]}`);
      runs.push({ wirelength: +r.wirelength.toFixed(1), delay: +r.delay.toFixed(2), seconds: r.stats.seconds });
    }
    const iw = xdlWirelength(ise, device), sc = physConns(phys);
    const best = Math.min(...runs.map(x => x.wirelength));
    const e = {
      ise: { wirelength: +iw.wl.toFixed(1), connections: iw.conns, perConnection: +(iw.wl / Math.max(1, iw.conns)).toFixed(2), slices: iseSlices },
      silinx: { wirelength: best, wirelengths: runs.map(x => x.wirelength), connections: sc, perConnection: +(best / Math.max(1, sc)).toFixed(2), slices: phys.insts.filter(i => i.kind === 'slice').length, delay: Math.min(...runs.map(x => x.delay)) },
    };
    out.boards[board][name] = e;
    console.log(`${board} ${name}: ISE ${e.ise.wirelength} / ${e.ise.connections} = ${e.ise.perConnection} (${e.ise.slices} slices), Silinx ${e.silinx.wirelengths.join(' / ')} / ${sc} = ${e.silinx.perConnection} (${e.silinx.slices} slices)`);
  }
}
fs.writeFileSync(path.join(here, 'measured', 'place-compare.json'), JSON.stringify(out, null, 1) + '\n');
