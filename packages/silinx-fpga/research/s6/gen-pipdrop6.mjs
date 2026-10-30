// Stage S6-D (#726): the PIPs of the tiles other than the INT-like and CLB ones (the I/O, block RAM and DSP sites',
// the clock tiles'), by PIP drop on designs ISE routed (packages/silinx-fpga/research/s3e-bitstream's gen-pipdrop.mjs): for each design,
// <name>.base.xdl (ISE's XDL as it is) and <name>.drop.xdl (without those PIPs; the nets keep their pins, so bitgen
// programs the rest); ana-pipdrop6.mjs takes the bits the drop clears, tile by tile.
//   node research/s6/gen-pipdrop6.mjs [--split L] <out dir> <name>=<top.xdl> …
// <name>.drop.json: [{ tile, pip ('from dir to') }] the PIPs dropped. With --split L, L variants more of each design
// (<name>-s<j>.drop.xdl / .json and its base, j = 0 … L-1) drop the PIPs at places j, j + L, … of each tile's list: the
// PIPs one tile has together come apart.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The tile types whose PIPs are measured already (kept): the INT-like and the CLB tiles. */
export const KEPT = /^(INT|INT_BRK|INT_BRAM|INT_BRAM_BRK|IOI_INT|LIOI_INT|INT_GCLK|CLEXL|CLEXM)_X\d+Y\d+$/;

/**
 * An XDL without the PIPs of the tiles KEPT does not match: { xdl, dropped: [{ tile, pip }] }; with split [j, L] only
 * those at places j, j + L, … of their tile's list (in the XDL's order).
 */
export function dropPips(xdl, split = null) {
  const dropped = [], seen = {};
  const out = xdl.split('\n').filter(line => {
    const m = line.match(/^\s+pip (\S+) (\S+) (->|=-|==|=>) (\S+)\s*,/);
    if (!m || KEPT.test(m[1])) return true;
    const i = seen[m[1]] = (seen[m[1]] ?? -1) + 1;
    if (split && i % split[1] !== split[0]) return true;
    dropped.push({ tile: m[1], pip: `${m[2]} ${m[3]} ${m[4]}` });
    return false;
  });
  return { xdl: out.join('\n'), dropped };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), L = args[0] === '--split' ? +args[1] : 0;
  const [out, ...designs] = L ? args.slice(2) : args;
  if (!designs.length) { console.error('usage: node research/s6/gen-pipdrop6.mjs [--split L] <out dir> <name>=<top.xdl> …'); process.exit(1); }
  fs.mkdirSync(out, { recursive: true });
  for (const d of designs) {
    const [name, file] = d.split('='), text = fs.readFileSync(file, 'utf8');
    for (const [n, split] of L ? Array.from({ length: L }, (_, j) => [`${name}-s${j}`, [j, L]]) : [[name, null]]) {
      const { xdl, dropped } = dropPips(text, split);
      // a variant's base is its design's (the same file under its own name, for ana-pipdrop6.mjs)
      fs.writeFileSync(path.join(out, `${n}.base.xdl`), text);
      fs.writeFileSync(path.join(out, `${n}.drop.xdl`), xdl);
      fs.writeFileSync(path.join(out, `${n}.drop.json`), JSON.stringify(dropped));
      console.log(`${n}: ${dropped.length} PIPs dropped`);
    }
  }
}
