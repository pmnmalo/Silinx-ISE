// Stage S6-H (#732): the open flow's routed designs for ISE: each example on each board synthesized, packed, placed and
// routed by nextpnr as the Silinx toolchain routes it (on the switches whose bits are known, nextpnr's chip database;
// open-flow-nextpnr-s6.js, #2824: Silinx's own router removed), written as
// <board>-<example>.xdl. ISE then checks them (xdl -xdl2ncd, drc) and writes their bitstreams, which
// check-bitgen6.mjs compares with bitstreamS6's of the same XDL: the design rules on routings ISE did not choose, and
// every bit, the settings ISE's own designs never had among them.
//   node research/s6/flow-xdl6.mjs <out dir> [example …]   (all of them by default; both boards)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeS6 } from '../../src/fpga/s6/place.js';
import { placedXdlS6 } from '../../src/fpga/s6/xdl.js';
import { writeXdl } from '../../src/xdl.js';
import { EXAMPLES } from '../../../../test/examples-lib.mjs';
import { S6_BOARDS, s6Device, s6Example, s6RouteNextpnr } from '../../../../test/s6-lib.mjs';

/** An example placed by the Spartan-6's placer and routed by nextpnr, as the open flow routes a placement: { xdl (text) }. */
export async function flowXdl(name, board, part) {
  const { device, sites } = s6Device(part), d = await s6Example(name, board);
  const x = placedXdlS6(d.nl, d.packed, d.phys, placeS6(d.phys, sites, { nl: d.nl, seed: 1 }), { part, device, name: 'top' });
  return { xdl: writeXdl(await s6RouteNextpnr(x, part)) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, ...names] = process.argv.slice(2);
  if (!out) { console.error('usage: node research/s6/flow-xdl6.mjs <out dir> [example …]'); process.exit(1); }
  fs.mkdirSync(out, { recursive: true });
  for (const { board, part } of S6_BOARDS) {
    for (const name of names.length ? names : EXAMPLES) {
      const { xdl } = await flowXdl(name, board, part);
      fs.writeFileSync(path.join(out, `${board}-${name}.xdl`), xdl);
      console.log(`${board}-${name}: ${xdl.length} bytes`);
    }
  }
}
