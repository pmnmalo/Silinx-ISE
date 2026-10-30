// A routed XDL design to its .bit with Silinx's bitgen (#1954: nextpnr's result, converted by nextpnr-to-xdl.mjs).
//   node packages/silinx-fpga/research/nextpnr-s3e/xdl-to-bit.mjs routed.xdl out.bit
import fs from 'node:fs';
import { parseXdl } from '../../src/xdl.js';
import { bitgen } from '../../src/fpga/bitgen.js';
import { loadDb } from '../../src/fpga/bitdb-node.js';

const [xdlFile, bitFile] = process.argv.slice(2);
const design = parseXdl(fs.readFileSync(xdlFile, 'utf8'));
const { bytes, unknown } = bitgen(design, loadDb(design.part), { name: `${design.name}.ncd`, crc: true, startupClk: 'JtagClk', part: design.part.replace(/^xc/, '').replace(/-\d$/, '') });
if (unknown.length) {
  console.error(`${unknown.length} feature(s) not in the bit database:`);
  for (const u of unknown.slice(0, 30)) console.error(`  ${u.tile} ${u.feature}`);
  process.exit(1);
}
fs.writeFileSync(bitFile, bytes);
console.log(`${bitFile}: ${bytes.length} bytes`);
