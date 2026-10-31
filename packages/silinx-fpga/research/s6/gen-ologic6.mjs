// Stage S6-E7 (#2025): an OLOGIC2's output flip-flop (OMUX::OUTFF, the setting ISE gives an output register packed in
// the pad: OUTFFTYPE::FF, SRINIT_OQ::0, CLK0INV::CLK0) at every site, on designs ISE implements (ise-s6.sh impl): every
// pad of the part an output from a flip-flop forced into its I/O logic (IOB = "TRUE"), one global clock. Each IOB tile's
// k-th pad in design k (two pads a side's tile, four a top or bottom one: the OLOGIC2s of an IOI tile apart); one more
// with every third tile's first pad only (the clock rows' bits apart). ana-ologic6.mjs places the bits by site.
//   node research/s6/gen-ologic6.mjs <out dir> [part]   -> <out dir>/<name>/{top.v, top.ucf, top.txt}
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { s6Device } from '../../../../test/s6-lib.mjs';

/** The designs of a part: [{ name, clk, d, outs: [pad] }], the clock and the data input on pads of their own. */
export function ologicDesigns(part) {
  const { sites } = s6Device(part), pads = [...sites.pads.values()];
  const clk = pads.find(p => p.bufg.length && p.bank === 2).name, byTile = new Map();
  for (const p of pads) (byTile.get(p.tile) ?? byTile.set(p.tile, []).get(p.tile)).push(p.name);
  const tiles = [...byTile].filter(([, ps]) => !ps.includes(clk)).map(([, ps]) => ps), d = tiles[0][0];
  const outs = k => tiles.map(ps => ps[k]).filter(p => p && p !== d);
  return [...[0, 1, 2, 3].map(k => ({ name: `p${k}`, clk, d, outs: outs(k) })),
    { name: 'sparse', clk, d, outs: tiles.filter((_, i) => i % 3 === 1).map(ps => ps[0]) }];
}

/** A design's Verilog and UCF: a shift register from d, each output its stage registered in the pad's OLOGIC2. */
export function ologicDesign({ clk, d, outs }) {
  const n = outs.length;
  const v = ['module top(input clk, input d, output [' + (n - 1) + ':0] q);', `  reg [${n - 1}:0] r = ${n}'b0;`,
    `  (* IOB = "TRUE" *) reg [${n - 1}:0] o = ${n}'b0;`, `  always @(posedge clk) begin r <= {r[${n - 2}:0], d}; o <= r; end`,
    '  assign q = o;', 'endmodule', ''];
  const u = [`NET "clk" LOC = "${clk}" ;`, `NET "d" LOC = "${d}" ;`, ...outs.map((p, i) => `NET "q<${i}>" LOC = "${p}" ;`)];
  return { v: v.join('\n'), ucf: `${u.join('\n')}\n` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, part = 'xc6slx16csg324-3'] = process.argv.slice(2);
  if (!out) { console.error('usage: node research/s6/gen-ologic6.mjs <out dir> [part]'); process.exit(1); }
  const ds = ologicDesigns(part);
  for (const x of ds) {
    const dir = path.join(out, x.name), { v, ucf } = ologicDesign(x);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'top.v'), v); fs.writeFileSync(path.join(dir, 'top.ucf'), ucf); fs.writeFileSync(path.join(dir, 'top.txt'), 'top\n');
  }
  console.log(`${part}: ${ds.map(x => `${x.name} ${x.outs.length}`).join(', ')}`);
}
