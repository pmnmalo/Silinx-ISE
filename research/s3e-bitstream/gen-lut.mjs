// Feasibility test, step 2: XDL designs that set the LUT memory bits of chosen slices by a binary
// code (design Bj: address a holds bit j of a), plus all-0 / all-1, to find each bit in the bitstream.
import fs from 'node:fs';

import { eqOf } from './lib.mjs';
const design = (insts) => `design "fuzz" xc3s250ecp132-4 v3.2 ,\n  cfg "";\n${insts.map(({ site, tile, type, f, g }) => `inst "${site}" "${type}",placed ${tile} ${site} ,\n  cfg " F:${site}_f:#LUT:${eqOf(f)} G:${site}_g:#LUT:${eqOf(g)} FXMUX::F GYMUX::G XUSED::0 YUSED::0 "\n  ;`).join('\n')}\n`;

// the slices under test: [site, tile, type]
const SITES = JSON.parse(process.argv[2] || "[]");
const zero = Array(16).fill(0), one = Array(16).fill(1);
const code = j => Array.from({ length: 16 }, (_, a) => (a >> j) & 1);
const out = process.argv[3];
if (!out) process.exitCode = 0; else {
fs.mkdirSync(out, { recursive: true });
const runs = [['Z', () => [zero, zero]]];
for (const lut of ['f', 'g']) {
  runs.push([`${lut}O`, () => (lut === 'f' ? [one, zero] : [zero, one])]);
  for (let j = 0; j < 4; j++) runs.push([`${lut}B${j}`, () => (lut === 'f' ? [code(j), zero] : [zero, code(j)])]);
}
for (const [name, fg] of runs) {
  const [f, g] = fg();
  fs.writeFileSync(`${out}/${name}.xdl`, design(SITES.map(([site, tile, type]) => ({ site, tile, type, f, g }))));
}
console.log(runs.map(r => r[0]).join(' '));
}
