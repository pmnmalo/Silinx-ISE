// Stage S6-H (#732): the Silinx toolchain's Spartan-6 bitstream writer (packages/silinx-fpga/src/fpga/s6/bitgen.js
// bitstreamS6) against ISE's bitgen: each routed design's XDL written as a .bit with the header and options of ISE's
// own (its design name, date and time, CRC on or off, start-up clock) and compared byte for byte; the features the
// databases do not have named.
//   node research/s6/check-bitgen6.mjs <dir> …   (each with top.xdl and top.bit, top.crc.bit: night 1's impl-*; or a
//     folder of <name>.xdl and <name>.bit, as ise-xdl-bits.sh writes them)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../src/xdl.js';
import { readBit6 } from '../../src/fpga/s6/bitstream.js';
import { bitstreamS6 } from '../../src/fpga/s6/bitgen.js';
import { loadBitDbS6 } from '../../src/fpga/s6/bitdb-node.js';
import { loadDeviceCache } from '../../src/fpga/device-node.js';

/** ISE's .bit against bitstreamS6's of the same XDL with its header: { same, diff (bytes), first (offset), sizes, unknown }. */
export function compareBit(xdlText, iseBytes, device, db) {
  const h = readBit6(iseBytes);
  const { bytes, unknown } = bitstreamS6(parseXdl(xdlText), device, db, { name: h.header.a, date: h.header.c, time: h.header.d, crc: h.crc, startupClk: h.startupClk });
  let diff = 0, first = -1;
  for (let i = 0; i < Math.max(bytes.length, iseBytes.length); i++) if (bytes[i] !== iseBytes[i]) { diff++; if (first < 0) first = i; }
  return { same: diff === 0, diff, first, sizes: [iseBytes.length, bytes.length], unknown };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: node research/s6/check-bitgen6.mjs <dir> …'); process.exit(1); }
  const cache = {}, pairs = [];
  for (const d of dirs) {
    if (fs.existsSync(path.join(d, 'top.xdl'))) { for (const b of ['top.bit', 'top.crc.bit']) if (fs.existsSync(path.join(d, b))) pairs.push([path.join(d, 'top.xdl'), path.join(d, b)]); continue; }
    for (const f of fs.readdirSync(d).filter(x => x.endsWith('.xdl'))) { const b = path.join(d, f.replace(/\.xdl$/, '.bit')); if (fs.existsSync(b)) pairs.push([path.join(d, f), b]); }
  }
  let same = 0;
  for (const [x, b] of pairs) {
    const text = fs.readFileSync(x, 'utf8'), part = text.match(/^design "[^"]*" (\S+)/m)[1].replace(/^(xc6slx\d+)-?(csg\d+)(-\d)?$/, '$1$2-3');
    const c = (cache[part] ??= { device: loadDeviceCache(part), db: loadBitDbS6(part) });
    const r = compareBit(text, fs.readFileSync(b), c.device, c.db);
    if (r.same) same++;
    else console.log(`${path.relative(process.cwd(), b)}: ${r.diff} bytes differ from ${r.first} (sizes ${r.sizes.join(' / ')})${r.unknown.size ? `; not in the databases: ${[...r.unknown.keys()].slice(0, 3).join(', ')}` : ''}`);
  }
  console.log(`${pairs.length} bitstreams: ${same} byte-identical with ISE's bitgen`);
}
