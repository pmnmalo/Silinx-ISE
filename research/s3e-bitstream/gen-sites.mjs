// Feasibility test, step 2b: LUT F of several slices, one block of designs per slice (O, B0..B3), to
// see how the LUT bits move across the chip.
import fs from 'node:fs';
import { eqOf } from './lib.mjs';
const SITES = JSON.parse(process.argv[2]);
const out = process.argv[3];
fs.mkdirSync(out, { recursive: true });
const zero = Array(16).fill(0), one = Array(16).fill(1);
const code = j => Array.from({ length: 16 }, (_, a) => (a >> j) & 1);
const design = (fOf) => `design "fuzz" xc3s250ecp132-4 v3.2 ,\n  cfg "";\n${SITES.map(([site, tile, type], k) => `inst "${site}" "${type}",placed ${tile} ${site} ,\n  cfg " F:${site}_f:#LUT:${eqOf(fOf(k))} G:${site}_g:#LUT:${eqOf(zero)} FXMUX::F GYMUX::G XUSED::0 YUSED::0 "\n  ;`).join('\n')}\n`;
fs.writeFileSync(`${out}/Z.xdl`, design(() => zero));
SITES.forEach((s, k) => {
  fs.writeFileSync(`${out}/s${k}O.xdl`, design(i => (i === k ? one : zero)));
  for (let j = 0; j < 4; j++) fs.writeFileSync(`${out}/s${k}B${j}.xdl`, design(i => (i === k ? code(j) : zero)));
});
