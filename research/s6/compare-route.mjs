// The Spartan-6 router (#730) against ISE's routing of the same netlists: night 1's implementations of Silinx's own
// EDIF of each example (`edif-<board>/<example>/top.xdl`, ISE 14.7 par), and the Silinx toolchain's placement and
// routing of the same netlist, measured alike: the routing switches (PIPs) of the signal nets (not the clocks', not
// the power nets'), by the kind of wire they drive (singles, doubles, quads, the logic pins and the rest), per
// connection (ISE's map trims the netlist further: fewer nets). The result is Silinx's own record (no Xilinx file):
// research/s6/measured/route-compare.json.
//
//   node research/s6/compare-route.mjs [night1 folder (~/s6-night1)]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../packages/silinx-fpga/src/xdl.js';
import { placeS6 } from '../../packages/silinx-fpga/src/fpga/s6/place.js';
import { placedXdlS6 } from '../../packages/silinx-fpga/src/fpga/s6/xdl.js';
import { routeS6, routedXdlS6 } from '../../packages/silinx-fpga/src/fpga/s6/route.js';
import { checkRoutingS6 } from '../../packages/silinx-fpga/src/fpga/s6/route-check.js';
import { EXAMPLE_ORDER } from '../../core/examples.js';
import { S6_BOARDS, s6Device, s6Example } from '../../test/s6-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2] || path.join(os.homedir(), 's6-night1');

// the kind of the wire a PIP drives: the interconnect's singles (?R1 / ?L1), doubles (?2), quads (?4), the logic
// pins (LOGICIN, a site's input pins), the rest (outputs into the interconnect, clock, I/O and site wires)
const kindOf = to => (/^(EL|ER|NL|NR|SL|SR|WL|WR)1B/.test(to) ? 'single' : /^(EE|NE|NN|NW|SE|SS|SW|WW)2B/.test(to) ? 'double'
  : /^(EE|NE|NN|NW|SE|SS|SW|WW)4B/.test(to) ? 'quad' : /^LOGICIN/.test(to) ? 'logicin' : 'other');
function usage(design) {
  const type = new Map(design.insts.map(i => [i.name, i.type]));
  const u = { nets: 0, connections: 0, pips: 0, single: 0, double: 0, quad: 0, logicin: 0, other: 0 };
  for (const n of design.nets) {
    if (n.type !== 'wire' || !n.outpins.length || /^BUFG/.test(type.get(n.outpins[0].inst) || '')) continue;
    u.nets++; u.connections += n.inpins.length;
    for (const p of n.pips) { u.pips++; u[kindOf(p.to)]++; }
  }
  u.perConnection = +(u.pips / Math.max(1, u.connections)).toFixed(2);
  return u;
}

const out = { stage: 'S6-0 (night 1)', ise: 'ISE 14.7 par of Silinx\'s EDIF', measure: 'PIPs of the signal nets by the wire they drive, per connection', boards: {} };
for (const { board, part } of S6_BOARDS) {
  const { device, sites } = s6Device(part);
  out.boards[board] = {};
  for (const name of EXAMPLE_ORDER) {
    const f = path.join(dir, `edif-${board}`, name, 'top.xdl');
    if (!fs.existsSync(f)) { console.log(`${board} ${name}: no ${f}`); continue; }
    const ise = usage(parseXdl(fs.readFileSync(f, 'utf8')));
    const d = await s6Example(name, board);
    const pl = placeS6(d.phys, sites, { nl: d.nl, seed: 1 });
    const x = placedXdlS6(d.nl, d.packed, d.phys, pl, { part, device, name });
    const r = routeS6(x, device);
    const routed = routedXdlS6(x, device, r);
    const chk = checkRoutingS6(routed, device);
    if (!chk.ok || r.failed.length || r.stats.overused) throw new Error(`${board} ${name}: ${chk.problems[0] || r.failed[0] || 'shared nodes'}`);
    const silinx = { ...usage(routed), passes: r.stats.passes, seconds: r.stats.seconds };
    out.boards[board][name] = { ise, silinx };
    console.log(`${board} ${name}: ISE ${ise.pips} PIPs / ${ise.connections} = ${ise.perConnection} (q ${ise.quad} d ${ise.double} s ${ise.single}), Silinx ${silinx.pips} / ${silinx.connections} = ${silinx.perConnection} (q ${silinx.quad} d ${silinx.double} s ${silinx.single}), ${silinx.passes} passes ${silinx.seconds} s`);
  }
}
fs.writeFileSync(path.join(here, 'measured', 'route-compare.json'), JSON.stringify(out, null, 1) + '\n');
