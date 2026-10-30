// Full project, stage A: the frame of every CLB column and the bits of every row, from ONE design:
// the LUT F of every slice holds its own number (marker 0101 + 12 bits). Also an empty design
// (EMPTY.xdl: the bitstream format and the bits set by default).
//   PART=xc3s250ecp132-4 node gen-map.mjs outdir      (the part's device description, or XDLRC=file)
import fs from 'node:fs';
import { loadGraph } from './xdlrc-graph.mjs';
import { eqOf } from './lib.mjs';
const part = process.env.PART || 'xc3s250ecp132-4';
const g = loadGraph(process.env.XDLRC || part);
const slices = [];
for (const t of g.tiles) for (const s of t.sites) if (/^SLICE[LM]$/.test(s.type)) { const [, x, y] = /X(\d+)Y(\d+)/.exec(s.name).map(Number); slices.push({ site: s.name, tile: t.name, type: s.type, x, y }); }
// 16-bit code: marker 0101 and the slice's number (1..4095) in the 12 low bits; more slices than
// that (XC3S1200E: 8672): one design per 4000 slices (MAP0, MAP1, …)
export const code = i => (0b0101 << 12) | ((i % 4000) + 1);
const bits = c => Array.from({ length: 16 }, (_, a) => (c >> a) & 1);
const head = name => `design "${name}" ${part} v3.2 ,\n  cfg "";\n`;
if (process.argv[2]) {
  const out = process.argv[2];
  fs.mkdirSync(out, { recursive: true });
  for (let k = 0; k * 4000 < slices.length; k++) {
    const body = slices.slice(k * 4000, (k + 1) * 4000).map((s, j) => `inst "${s.site}" "${s.type}",placed ${s.tile} ${s.site} ,\n  cfg " F:${s.site}_f:#LUT:${eqOf(bits(code(k * 4000 + j)))} G:${s.site}_g:#LUT:D=(A1*~A1) FXMUX::F GYMUX::G XUSED::0 YUSED::0 "\n  ;`).join('\n');
    fs.writeFileSync(`${out}/MAP${k}.xdl`, head('fuzz') + body + '\n');
  }
  fs.writeFileSync(`${out}/EMPTY.xdl`, head('empty'));
  fs.writeFileSync(`${out}/slices.json`, JSON.stringify(slices));
  console.log(slices.length, 'slices');
}
