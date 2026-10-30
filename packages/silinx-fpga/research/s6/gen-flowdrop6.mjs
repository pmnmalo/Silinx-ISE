// Stage S6-H (#732): the PIPs the open flow routes on that the databases have no bits for (pads whose I/O paths no
// ISE design used, a hard block's tiles on the XC6SLX45 …), measured one at a time in context as gen-cmtdrop6.mjs
// measured the CMT paths': from the open flow's routed designs (flow-xdl6.mjs), each PIP predictDesign names as not
// in the databases dropped alone from the first design that has it: <design>.base.xdl, <design>-p<i>.drop.xdl and
// .drop.json. ise-xdl-bits.sh turns them into bitstreams; ana-cmtdrop6.mjs <dir> <part> s6-pips-flow takes the bits.
//   node research/s6/gen-flowdrop6.mjs <out dir> <xdl> …   (one part's designs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../src/xdl.js';
import { bitFormat6 } from '../../src/fpga/s6/bitstream.js';
import { predictDesign } from '../../src/fpga/s6/bitgen.js';
import { loadBitDbS6 } from '../../src/fpga/s6/bitdb-node.js';
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import { oneDrops } from './gen-cmtdrop6.mjs';

/** The PIPs ('TYPE from dir to') the databases do not have among designs' (predictDesign's unknown, the PIPs only). */
export function unknownPips(designs, device, dev, db) {
  const out = new Set();
  for (const [, text] of designs) for (const k of predictDesign(parseXdl(text), device, dev, db).unknown.keys()) if (/^\S+ \S+ (->|=-|==|=>) \S+$/.test(k)) out.add(k);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, ...files] = process.argv.slice(2);
  if (!files.length) { console.error('usage: node research/s6/gen-flowdrop6.mjs <out dir> <xdl> …'); process.exit(1); }
  const designs = files.map(f => [path.basename(f, '.xdl'), fs.readFileSync(f, 'utf8')]), text = new Map(designs);
  const part = designs[0][1].match(/^design "[^"]*" (\S+)/m)[1].replace(/^(xc6slx\d+)-?(csg\d+)(-\d)?$/, '$1$2-3');
  const device = loadDeviceCache(part), dev = bitFormat6(part.replace(/^xc/, '').replace(/-\d$/, '')), db = loadBitDbS6(part);
  const unknown = unknownPips(designs, device, dev, db), drops = oneDrops(designs, k => !unknown.has(k));
  fs.mkdirSync(out, { recursive: true });
  for (const d of new Set(drops.map(x => x.design))) fs.writeFileSync(path.join(out, `${d}.base.xdl`), text.get(d));
  for (const x of drops) {
    const lines = text.get(x.design).split('\n');
    lines.splice(x.line, 1);
    fs.writeFileSync(path.join(out, `${x.design}-p${x.i}.drop.xdl`), lines.join('\n'));
    fs.writeFileSync(path.join(out, `${x.design}-p${x.i}.drop.json`), JSON.stringify([{ tile: x.tile, pip: x.pip }]));
  }
  const left = [...unknown].filter(k => !drops.some(x => `${x.tile.replace(/_X\d+Y\d+$/, '')} ${x.pip}` === k));
  console.log(`${part}: ${unknown.size} PIPs not in the databases, ${drops.length} drops from ${new Set(drops.map(x => x.design)).size} designs${left.length ? `; not dropped (a switch box's): ${left.slice(0, 4).join(', ')}` : ''}`);
}
