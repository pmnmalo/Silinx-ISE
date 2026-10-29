// The EPFL benchmarks against the best-known LUT-6 results (#367, research/epfl-records): the records (taken from
// lsils/benchmarks at the design corpus's pinned commit), the measurement's Yosys scripts and how it reads Yosys's
// counts (checked on circuits whose LUT-6 mapping is known by hand), its table, and the section of docs/QUALITY.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compile, elaborate } from '../core/compile.js';
import { toVerilog } from '../core/synth-verilog.js';
import { DEPTH_ABC } from '../packages/silinx-fpga/src/synth-open.js';
import { scripts, parseCounts, table } from '../research/epfl-records/measure.mjs';
import { qualityPage } from '../test/designs-corpus/quality-page.mjs';

const records = JSON.parse(fs.readFileSync(new URL('../research/epfl-records/records.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(new URL('designs-corpus/manifest.json', import.meta.url), 'utf8'));

test('EPFL records: the 20 benchmarks, the size record no larger and the depth record no deeper, the corpus\'s pinned commit', () => {
  const names = Object.keys(records.benchmarks);
  assert.deepEqual(names.sort(), ['adder', 'arbiter', 'bar', 'cavlc', 'ctrl', 'dec', 'div', 'hyp', 'i2c', 'int2float', 'log2', 'max', 'mem_ctrl', 'multiplier', 'priority', 'router', 'sin', 'sqrt', 'square', 'voter']);
  for (const [n, r] of Object.entries(records.benchmarks)) {
    assert.ok(r.size.luts <= r.depth.luts, `${n}: the size record has the fewest LUTs`);
    assert.ok(r.depth.levels <= r.size.levels, `${n}: the depth record has the fewest levels`);
    assert.match(r.file, new RegExp(`^(arithmetic|random_control)/${n}\\.v$`));
  }
  // two values of the 2026 table, read independently from best_results/README.md
  assert.deepEqual([records.benchmarks.adder.size.luts, records.benchmarks.adder.depth.levels, records.benchmarks.voter.size.luts], [129, 5, 1145]);
  assert.equal(records.source.commit, manifest.sources.epfl.commit, 'the records of the sources the corpus reads');
  // the module names of the benchmarks the corpus has (dec, i2c are not called top)
  for (const d of manifest.designs.filter(x => x.source === 'epfl')) assert.equal(records.benchmarks[d.name.replace(/^epfl-/, '')].top, d.top, d.name);
});

test('EPFL measurement: the area and depth scripts (Silinx\'s depth-oriented ABC script on LUT-6)', () => {
  const s = scripts('flat.v', 'top');
  assert.match(s.area, /^read_verilog -sv flat\.v; hierarchy -top top; synth -flatten -top top -lut 6; opt_clean; tee -q -o stat\.txt stat; tee -q -o ltp\.txt ltp -noff$/);
  assert.ok(s.depth.includes(`abc -lut 6 -script +${DEPTH_ABC.split(';').map(c => c.trim().replace(/\s+/g, ',')).join(';')};`), s.depth);
  assert.match(s.depth, /synth -flatten -top top -noabc; abc -lut 6/);
  // the counts from Yosys's outputs; nothing found: not numbers
  assert.deepEqual(parseCounts('   Number of cells:   7\n     $lut   5\n     $_DFF_P_   2\n', 'Longest topological path in top (length=3):'), { luts: 5, levels: 3 });
  assert.ok(Number.isNaN(parseCounts('', '').levels));
});

test('EPFL measurement with Yosys: circuits whose LUT-6 mapping is known (an AND of 12: 3 LUTs in 2 levels; an XOR of 6: 1)', { timeout: 300000 }, async () => {
  const { yosysNode } = await import('../packages/silinx-fpga/src/synth-open-node.js');
  const design = elaborate(compile([{ path: 'a.v', lang: 'verilog', text: 'module top(input [11:0] a, input [5:0] b, output y, output z); assign y = &a; assign z = ^b; endmodule' }]), 'top');
  const flat = toVerilog(design);
  for (const [kind, script] of Object.entries(scripts('flat.v', flat.top))) {
    const r = await yosysNode(['-q', '-p', script], { 'flat.v': flat.text });
    assert.deepEqual(parseCounts(r['stat.txt'], r['ltp.txt']), { luts: 4, levels: 2 }, kind);
  }
});

test('EPFL measurement: its table and the section of docs/QUALITY.md', () => {
  const results = { adder: { area: { luts: 258, levels: 51 }, depth: { luts: 354, levels: 10 } }, hyp: { area: { error: 'more than 600 s' }, depth: { error: 'more than 600 s' } } };
  const t = table(results);
  assert.match(t, /^\| adder \| 258 \| 51 \| 129 \| 2\.00 \| 354 \| 10 \| 5 \| 2\.00 \|$/m);
  assert.match(t, /^\| hyp \| \(more than 600 s\) \|/m);
  const page = qualityPage({ generatedAt: '2026-10-17', designs: [] }, { epfl: { records, results } });
  assert.match(page, /^## Against the best-known results \(EPFL benchmarks, LUT-6\)$/m);
  assert.match(page, /^\| adder \| 258 \| 51 \| 129 \| 2\.00 \| 354 \| 10 \| 5 \| 2\.00 \|$/m);
  assert.match(page, /^\| hyp \| not mapped \| – \| 36451 \| – \| not mapped \| – \| 458 \| – \|$/m);
  assert.match(page, /geometric means: LUTs 2\.00× the size records, levels 2\.00× the depth records/);
  assert.doesNotMatch(qualityPage({ generatedAt: '2026-10-17', designs: [] }), /EPFL benchmarks, LUT-6/, 'no section without the measurement');
});
