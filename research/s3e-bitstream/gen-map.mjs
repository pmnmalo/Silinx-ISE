// Full project, stage A: the frame of every CLB column and the bits of every row, from ONE design:
// the LUT F of every slice holds its own number (marker 0101 + 12 bits).
import fs from 'node:fs';
import { parseXdlrc } from '../../core/xdl.js';
import { eqOf } from './lib.mjs';
const dev = parseXdlrc(fs.readFileSync(process.env.XDLRC || 'device.xdlrc', 'utf8'));
const slices = [];
for (const t of dev.tiles) for (const s of t.sites) if (/^SLICE[LM]$/.test(s.type)) { const [, x, y] = /X(\d+)Y(\d+)/.exec(s.name).map(Number); slices.push({ site: s.name, tile: t.name, type: s.type, x, y }); }
// 16-bit code: marker 0101 and the slice's number (1..2448) in the 12 low bits
export const code = i => (0b0101 << 12) | (i + 1);
const bits = c => Array.from({ length: 16 }, (_, a) => (c >> a) & 1);
const head = 'design "fuzz" xc3s250ecp132-4 v3.2 ,\n  cfg "";\n';
const body = slices.map(s => `inst "${s.site}" "${s.type}",placed ${s.tile} ${s.site} ,\n  cfg " F:${s.site}_f:#LUT:${eqOf(bits(code(slices.indexOf(s))))} G:${s.site}_g:#LUT:D=(A1*~A1) FXMUX::F GYMUX::G XUSED::0 YUSED::0 "\n  ;`).join('\n');
if (process.argv[2]) { fs.writeFileSync(`${process.argv[2]}/MAP.xdl`, head + body + '\n'); fs.writeFileSync(`${process.argv[2]}/slices.json`, JSON.stringify(slices)); console.log(slices.length, 'slices'); }
