// Stage S6-E (#727): the clock path (pad -> BUFG -> spine -> clock row -> slices), on designs ISE implements (map and
// par route the global clock; ise-s6.sh impl): flip-flops at fixed slices (LOC) clocked from a pad through a BUFG,
// their outputs XORed to one pad so that none is trimmed. residual6.mjs on them leaves the clock's bits the databases do
// not explain yet, by clock row and column.
// k16: a clock on each BUFGMUX (a clock pad whose dedicated path reaches it), each to a flip-flop in another clock row
// and column: every global clock's spine, rows and buffers, taken apart by gen-pipdrop6.mjs on ISE's routed design.
// --bufg: one design per BUFGMUX and clock pad that reaches it (two pads where two do): the selection bits.
//   node research/s6/gen-clock6.mjs [--bufg] <out dir> [part]   -> <out dir>/<name>/{top.v, top.ucf, top.txt}
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S6_DEVICES } from '../../core/fpga/s6/bitstream.js';
import { columnOf } from './ana-slice6.mjs';
import { s6Device } from '../../test/s6-lib.mjs';

/**
 * A design with many clocks: clock k from pad pads[k] (each through its own BUFG) to a flip-flop at sites[k]; d and q
 * on pads that are no clock's.
 */
export function manyClocks(pads, sites, { d = 'U16', q = 'V16' } = {}) {
  const v = [`module top(input [${pads.length - 1}:0] clk, input d, output q);`];
  pads.forEach((_, k) => v.push(`  (* KEEP = "TRUE" *) reg r${k} = 1'b0;`, `  always @(posedge clk[${k}]) r${k} <= d ^ r${(k + 1) % pads.length};`));
  v.push(`  assign q = ${pads.map((_, k) => `r${k}`).join(' ^ ')};`, 'endmodule', '');
  const u = [...pads.map((p, k) => `NET "clk<${k}>" LOC = "${p}" ;`), `NET "d" LOC = "${d}" ;`, `NET "q" LOC = "${q}" ;`, ...sites.map((s, k) => `INST "r${k}" LOC = "${s}" ;`)];
  return { v: v.join('\n'), ucf: `${u.join('\n')}\n` };
}

/** Clock pads reaching every BUFGMUX once (a pad per BUFGMUX, greedily): [pad]. */
export function padsForBufgs(pads) {
  const used = new Set(), out = [];
  for (const p of pads) { const b = p.bufg.find(x => !used.has(x)); if (b) { used.add(b); out.push(p.name); } }
  return out;
}

/**
 * A design with one clock from pad through a BUFG placed at site (an instance of its own, LOC'd) to a flip-flop: the
 * BUFGMUX's and the pad's selection bits.
 */
export function bufgDesign(pad, site, ff, { d = 'U16', q = 'V16' } = {}) {
  const v = ['module top(input clk, input d, output reg q = 1\'b0);', '  wire c;', '  BUFG b(.I(clk), .O(c));', '  always @(posedge c) q <= d;', 'endmodule', ''];
  const u = [`NET "clk" LOC = "${pad}" ;`, `NET "d" LOC = "${d}" ;`, `NET "q" LOC = "${q}" ;`, `INST "b" LOC = "${site}" ;`, `INST "q" LOC = "${ff}" ;`];
  return { v: v.join('\n'), ucf: `${u.join('\n')}\n` };
}

/** The selection designs: every BUFGMUX from the first pad that reaches it and, when another does, from that too. */
export function bufgSelections(pads) {
  const by = new Map();
  for (const p of pads) for (const b of p.bufg) (by.get(b) ?? by.set(b, []).get(b)).push(p.name);
  const out = [];
  for (const [b, ps] of [...by].sort()) { out.push({ bufg: b, pad: ps[0] }); if (ps.length > 1) out.push({ bufg: b, pad: ps[ps.length - 1] }); }
  return out;
}

/** A design's Verilog and UCF: flip-flops at the slices, clocked by clk (and clk2 for those of clock 2). */
export function clockDesign(sites, { clk = 'V10', clk2 = null, d = 'T10', q = 'U16' } = {}) {
  const regs = sites.map((s, i) => ({ name: `r${i}`, site: s.site ?? s, clock: s.clock ?? 1 }));
  const v = [`module top(input clk,${clk2 ? ' input clk2,' : ''} input d, output q);`];
  for (const r of regs) v.push(`  (* KEEP = "TRUE" *) reg ${r.name} = 1'b0;`, `  always @(posedge ${r.clock === 2 ? 'clk2' : 'clk'}) ${r.name} <= d ^ ${regs[(regs.indexOf(r) + 1) % regs.length].name};`);
  v.push(`  assign q = ${regs.map(r => r.name).join(' ^ ')};`, 'endmodule', '');
  const u = [`NET "clk" LOC = "${clk}" ;`, ...(clk2 ? [`NET "clk2" LOC = "${clk2}" ;`] : []), `NET "d" LOC = "${d}" ;`, `NET "q" LOC = "${q}" ;`];
  for (const r of regs) u.push(`INST "${r.name}" LOC = "${r.site}" ;`);
  return { v: v.join('\n'), ucf: `${u.join('\n')}\n` };
}

/** A SLICEL / SLICEM of a FAR column (its first frame in row 0) in a row, its Y the nearest to the row's middle. */
export function sliceAt(bases, dev, col, row, y = 8) {
  let best = null, score = Infinity;
  for (const [name, [f0]] of Object.entries(bases)) {
    const [c0] = columnOf(dev, f0), yy = +name.match(/Y(\d+)$/)[1];
    if (c0 !== row * dev.rowFrames + col || Math.floor(yy / 16) !== row || !/SLICE_X\d*[02468]Y/.test(name)) continue;
    const s = Math.abs(yy - (row * 16 + y));
    if (s < score) { score = s; best = name; }
  }
  return best;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), bufg = args[0] === '--bufg', [out, part = 'xc6slx16csg324-3'] = bufg ? args.slice(1) : args;
  if (!out) { console.error('usage: node research/s6/gen-clock6.mjs [--bufg] <out dir> [part]'); process.exit(1); }
  if (bufg) {
    const sel = bufgSelections([...s6Device(part).sites.pads.values()].filter(p => p.bufg.length));
    for (const { bufg: b, pad } of sel) {
      const dir = path.join(out, `b-${b}-${pad}`), { v, ucf } = bufgDesign(pad, b, 'SLICE_X16Y9');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'top.v'), v); fs.writeFileSync(path.join(dir, 'top.ucf'), ucf); fs.writeFileSync(path.join(dir, 'top.txt'), 'top\n');
    }
    console.log(`${part}: ${sel.length} designs`);
    process.exit(0);
  }
  const dev = S6_DEVICES[part.replace(/csg.*/, '')], bases = JSON.parse(fs.readFileSync(new URL(`./db/${dev.device}-lut.json`, import.meta.url), 'utf8')).slices;
  // the CLB columns' first frames (in row 0)
  const cols = [...new Set(Object.values(bases).map(([f]) => columnOf(dev, f)[0]).filter(c => c < dev.rowFrames))].sort((a, b) => a - b);
  const at = (c, r) => sliceAt(bases, dev, c, r);
  const designs = {
    k1: [at(cols[8], 0)],
    k2: [at(358, 2)],
    k3: [0, 1, 2, 3].map(r => at(cols[8], r)),
    k4: cols.map(c => at(c, 1)).filter(Boolean),
    k5: [{ site: at(cols[4], 0), clock: 1 }, { site: at(cols[12], 2), clock: 2 }],
  };
  const clockPads = padsForBufgs([...s6Device(part).sites.pads.values()].filter(p => p.bufg.length));
  // clock k's flip-flop in row k mod rows, a column five on from the last (the next one when the row has no slice there)
  const spread = clockPads.map((_, k) => { for (let j = 0; j < cols.length; j++) { const s = at(cols[(k * 5 + j) % cols.length], k % dev.rows); if (s) return s; } return null; });
  const many = manyClocks(clockPads, spread, { d: 'M11', q: 'N11' });
  fs.mkdirSync(path.join(out, 'k16'), { recursive: true });
  fs.writeFileSync(path.join(out, 'k16', 'top.v'), many.v); fs.writeFileSync(path.join(out, 'k16', 'top.ucf'), many.ucf); fs.writeFileSync(path.join(out, 'k16', 'top.txt'), 'top\n');
  console.log(`k16: ${clockPads.length} clocks from ${clockPads.join(' ')}`);
  for (const [name, sites] of Object.entries(designs)) {
    const dir = path.join(out, name), two = sites.some(s => s.clock === 2);
    fs.mkdirSync(dir, { recursive: true });
    const { v, ucf } = clockDesign(sites, two ? { clk2: 'T8' } : {});
    fs.writeFileSync(path.join(dir, 'top.v'), v);
    fs.writeFileSync(path.join(dir, 'top.ucf'), ucf);
    fs.writeFileSync(path.join(dir, 'top.txt'), 'top\n');
    console.log(`${name}: ${sites.length} flip-flops at ${sites.map(s => s.site ?? s).join(' ')}`);
  }
}
