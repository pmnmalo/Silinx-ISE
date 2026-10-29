// Stage S6-H (#732): the open flow's routed designs for ISE: each example on each board synthesized, packed, placed and
// routed as the Silinx toolchain does it (on the switches whose bits are known, open-flow-s6.js), written as
// <board>-<example>.xdl. ISE then checks them (xdl -xdl2ncd, drc) and writes their bitstreams, which
// check-bitgen6.mjs compares with bitstreamS6's of the same XDL: the design rules on routings ISE did not choose, and
// every bit, the settings ISE's own designs never had among them.
//   node research/s6/flow-xdl6.mjs <out dir> [example …]   (all of them by default; both boards)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeS6 } from '../../packages/silinx-fpga/src/fpga/s6/place.js';
import { placedXdlS6 } from '../../packages/silinx-fpga/src/fpga/s6/xdl.js';
import { routeS6, routedXdlS6 } from '../../packages/silinx-fpga/src/fpga/s6/route.js';
import { knownPipS6 } from '../../packages/silinx-fpga/src/fpga/s6/bitgen.js';
import { loadBitDbS6 } from '../../packages/silinx-fpga/src/fpga/s6/bitdb-node.js';
import { writeXdl } from '../../packages/silinx-fpga/src/xdl.js';
import { EXAMPLES } from '../../test/examples-lib.mjs';
import { S6_BOARDS, s6Device, s6Example } from '../../test/s6-lib.mjs';

/** An example routed as the open flow routes it: { xdl (text), failed (nets routed on unknown switches) }. */
export async function flowXdl(name, board, part) {
  const { device, sites } = s6Device(part), d = await s6Example(name, board);
  const x = placedXdlS6(d.nl, d.packed, d.phys, placeS6(d.phys, sites, { nl: d.nl, seed: 1 }), { part, device, name: 'top' });
  let r = routeS6(x, device, { allowPip: knownPipS6(device, loadBitDbS6(part)) });
  const failed = r.failed;
  if (failed.length) r = routeS6(x, device);
  return { xdl: writeXdl(routedXdlS6(x, device, r)), failed };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, ...names] = process.argv.slice(2);
  if (!out) { console.error('usage: node research/s6/flow-xdl6.mjs <out dir> [example …]'); process.exit(1); }
  fs.mkdirSync(out, { recursive: true });
  for (const { board, part } of S6_BOARDS) {
    for (const name of names.length ? names : EXAMPLES) {
      const { xdl, failed } = await flowXdl(name, board, part);
      fs.writeFileSync(path.join(out, `${board}-${name}.xdl`), xdl);
      console.log(`${board}-${name}: ${xdl.length} bytes${failed.length ? `, ${failed.length} net(s) on unknown switches` : ''}`);
    }
  }
}
