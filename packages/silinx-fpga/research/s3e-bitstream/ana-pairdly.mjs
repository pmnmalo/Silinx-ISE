// #751: gen-pairdly.mjs's variants against ISE's bitgen: for every variant with ISE's .bit, the bits where Silinx's
// writer (packages/silinx-fpga/src/fpga/bitgen.js) differs, and ISE's value of the watched bits (the group's first pad's bits that #44 /
// #97 gave to one pad), one line per variant:
//   <design> <variant> <pad>=<kind><delay>… | <bit>=<ISE><Silinx>… | other differing bits
//   node ana-pairdly.mjs dir [--json]      (dir: gen-pairdly.mjs's, with ISE's V###.bit next to each V###.xdl)
import fs from 'node:fs';
import path from 'node:path';
import { parseXdl } from '../../src/xdl.js';
import { frameData } from '../../src/fpga/bitgen.js';
import { readBit, getBit, diffFrames } from '../../src/fpga/bitstream.js';
import { loadDb } from '../../src/fpga/bitdb-node.js';

// the bits of #751 (issue), per device
export const WATCH = {
  'xc3s500efg320-4': ['538,356', '46,31'],
  'xc3s1200efg320-4': ['47,31', '767,740', '767,996'],
};
const [dir] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const asJson = process.argv.includes('--json');
const key = JSON.parse(fs.readFileSync(path.join(dir, 'key.json'), 'utf8'));
const db = loadDb(key.part);
const rows = [];
for (const [d, { kinds, variants }] of Object.entries(key.designs)) {
  for (const [v, vals] of Object.entries(variants)) {
    const bitFile = path.join(dir, d, `${v}.bit`);
    if (!fs.existsSync(bitFile)) continue;
    const design = parseXdl(fs.readFileSync(path.join(dir, d, `${v}.xdl`), 'utf8'));
    const r = frameData(design, db);
    const ise = readBit(fs.readFileSync(bitFile));
    const fw = r.frames.frameWords;
    const watch = Object.fromEntries((WATCH[key.part] || []).map(b => { const [f, i] = b.split(',').map(Number); return [b, [getBit(ise.frames, fw, f, i), getBit(r.frames, fw, f, i)]]; }));
    const diff = diffFrames(r.frames, ise.frames, fw).map(x => `${x.frame},${x.bit}=${x.value}`).filter(x => !(x.replace(/=.$/, '') in watch));
    const pads = Object.fromEntries(Object.entries(kinds).map(([p, k]) => [p, `${k}${vals[p] ?? ''}`]));
    rows.push({ design: d, variant: v, pads, watch, diff, unknown: r.unknown.length });
  }
}
if (asJson) console.log(JSON.stringify({ part: key.part, rows }));
else for (const x of rows) console.log(`${x.design} ${x.variant} ${Object.entries(x.pads).map(([p, k]) => `${p}=${k}`).join(' ')} | ${Object.entries(x.watch).map(([b, [i, s]]) => `${b}=${i}${s}`).join(' ')}${x.diff.length ? ` | ${x.diff.join(' ')}` : ''}${x.unknown ? ` | ${x.unknown} unknown` : ''}`);
