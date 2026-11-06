// docs/QUALITY.md, the comparison of the Silinx toolchain's circuits with ISE's on the design corpus
// (test/designs-corpus/compare-ise.mjs): the page's summary and tables from the results, and the
// committed page is the one its committed results give.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { qualityPage } from './designs-corpus/quality-page.mjs';
import { lastError, newFailures, parseClocks, constrainedPeriod, trcePaths, criticalPath, remoteWork, silinxSides, mergeable, OPTIMIZATIONS } from './designs-corpus/compare-lib.mjs';
import { GOAL_IMPL, synthGoal } from '../packages/silinx-fpga/src/synth-open.js';
import os from 'node:os';
import { iseWorkBase } from '../server/toolchain.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('quality page: summary (geometric means, counts), size and speed tables, designs not built', () => {
  const page = qualityPage({
    generatedAt: '2026-10-11T12:00:00Z', silinxVersion: '9.9.9', isePeriodNs: 5, notBuilt: ['neorv32'],
    designs: [
      { name: 'a', silinx: { slices: 50, luts: 80, ffs: 10, srl16: 1, bram: 0, mult: 0, periodNs: 10, estimateNs: 10.2 }, ise: { slices: 100, luts: 100, ffs: 12, srl16: 2, bram: 0, mult: 0, periodNs: 8 } },
      { name: 'b', silinx: { slices: 200, luts: 125, ffs: 20, srl16: 0, bram: 1, mult: 2, periodNs: 8, estimateNs: 8.1 }, ise: { slices: 100, luts: 100, ffs: 20, srl16: 0, bram: 1, mult: 2, periodNs: 8 } },
      { name: 'c', silinx: { error: 'ERROR:Silinx - no room' }, ise: { slices: 10, luts: 12, ffs: 3, srl16: 0, bram: 0, mult: 0, periodNs: 5 } },
      { name: 'd', silinx: { slices: 5 }, ise: { error: 'ERROR:HDLCompilers:26 - "x.v" line 1 unexpected token: \'$clog2\'' } },
    ],
  });
  assert.match(page, /^# Quality of the Silinx toolchain against Xilinx ISE$/m);
  assert.match(page, /Measured 2026-10-11 \(Silinx 9\.9\.9, ISE 14\.7\)/);
  // LUTs 0.8 and 1.25: geometric mean 1 (+0%); FFs 10/12 and 1; slices 0.5 and 2; periods 1.25 and 1: +12%
  assert.match(page, /tightened to\n5 ns/);
  assert.match(page, /- \*\*Size:\*\* 2 designs built by both\. Logic LUTs: Silinx \+0% against ISE; flip-flops\n  −9%; slices \+0%/);
  assert.match(page, /needs as few LUTs or fewer on 1 of 2\./);
  assert.match(page, /- \*\*Speed:\*\* 2 designs timed by both\. Critical path: Silinx \+12% against ISE/);
  assert.match(page, /Silinx is as fast or faster on 1 of 2\./);
  assert.ok(page.includes('| a | 80 | 100 | 0.80 | 10 | 12 | 50 | 100 | 1 / 2 | 0 / 0 | 0 / 0 |'), page);
  assert.ok(page.includes('| b | 125 | 100 | 1.25 | 20 | 20 | 200 | 100 | 0 / 0 | 1 / 1 | 2 / 2 |'));
  assert.ok(page.includes('| c | – | 12 | – |'));
  assert.ok(page.includes('| a | 10.00 | 8.00 | 1.25 | 10.20 |'));
  assert.ok(page.includes('- c, Silinx: `ERROR:Silinx - no room`'));
  assert.match(page, /- neorv32: Silinx cannot read or synthesize it yet/);
  // a message with a backtick in it: a code span with double backticks
  assert.ok(qualityPage({ generatedAt: '2026-10-11', designs: [{ name: 'e', silinx: {}, ise: { error: 'ERROR:HDLCompilers:26 - Macro reference `assert is not defined' } }] })
    .includes('- e: XST cannot read it (`` ERROR:HDLCompilers:26 - Macro reference `assert is not defined ``); Silinx reads it.'));
  assert.match(page, /- \*\*Reading the design:\*\* XST \(ISE 14\.7's synthesis, from 2013\) cannot read 1 of the designs/);
  assert.ok(page.includes("- d: XST cannot read it (`ERROR:HDLCompilers:26 - \"x.v\" line 1 unexpected token: '$clog2'`); Silinx reads it."));
});

test('quality page: docs/QUALITY.md is the page of test/designs-corpus/ise-comparison.json', () => {
  const res = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/designs-corpus/ise-comparison.json'), 'utf8'));
  // (with the EPFL benchmarks against the best-known LUT-6 results, research/epfl-records, #367)
  const epfl = { records: JSON.parse(fs.readFileSync(path.join(ROOT, 'research/epfl-records/records.json'), 'utf8')), results: JSON.parse(fs.readFileSync(path.join(ROOT, 'research/epfl-records/results.json'), 'utf8')) };
  assert.equal(fs.readFileSync(path.join(ROOT, 'docs/QUALITY.md'), 'utf8'), qualityPage(res, { epfl }), 'regenerate it: node test/designs-corpus/compare-ise.mjs --report');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/designs-corpus/manifest.json'), 'utf8'));
  // every design of the corpus is either compared, listed as not built, or added after the comparison (#366)
  assert.deepEqual([...res.designs.map(d => d.name), ...(res.notBuilt || []), ...(res.pending || [])].sort(), manifest.designs.map(d => d.name).sort());
});

test('compare-ise: the error of a failed run says what happened, not only "see the messages above"', () => {
  assert.equal(lastError({ lines: ['=== SILINX STEP par ===', 'ERROR:Silinx - 4 net(s) cannot be routed', 'ERROR: Silinx toolchain failed: see the messages above.'] }), 'ERROR:Silinx - 4 net(s) cannot be routed');
  assert.equal(lastError({ lines: ['=== SILINX STEP map ===', 'Packing 7662 slices', 'RangeError: Array buffer allocation failed', 'ERROR: Silinx toolchain failed: see the messages above.'] }),
    'ERROR: Silinx toolchain failed: see the messages above. (Packing 7662 slices / RangeError: Array buffer allocation failed)');
  assert.equal(lastError({ lines: [], error: 'killed' }), 'killed');
  assert.equal(lastError({ lines: [] }), 'failed');
});

test('compare-ise --guard: a design built before that fails now is not published', () => {
  const before = { designs: [{ name: 'aes', silinx: { slices: 7662 }, ise: { error: 'ERROR:Xst:1468' } }, { name: 't80', silinx: { slices: 1539 }, ise: { slices: 1000 } }] };
  const now = { designs: [{ name: 'aes', silinx: { error: 'out of memory' }, ise: { error: 'ERROR:Xst:1468' } }, { name: 't80', silinx: { slices: 1540 }, ise: { error: 'timeout' } }, { name: 'new', silinx: { error: 'x' } }] };
  assert.deepEqual(newFailures(before, now), ['aes (Silinx): out of memory', 't80 (ISE): timeout']);
  assert.deepEqual(newFailures(before, before), []);
  assert.deepEqual(newFailures(null, now), []);
});

// #53: ISE's flow times only the clocks the UCF constrains; Silinx's routing is timed by trce -a, every
// clock: the period set against ISE's is that of the constrained clock (vtr-stereovision3: its board
// clock tm3_clk_v0, 4.996 ns, against ISE's 4.916; its other clock, tm3_clk_v2, 7.352 ns, is not in ISE's)
test('ISE comparison: the period of the clock the UCF constrains, not of the worst clock (#53)', () => {
  const clocks = parseClocks('$iopadmap$tm3_clk_v2=7.352 $iopadmap$tm3_clk_v0=4.996 ');
  assert.deepEqual(clocks, { '$iopadmap$tm3_clk_v2': 7.352, '$iopadmap$tm3_clk_v0': 4.996 });
  const ucf = `# the clock on the Basys2's oscillator (generated by test/designs-corpus)
NET "tm3_clk_v0" LOC = "B8" ;
NET "tm3_clk_v0" CLOCK_DEDICATED_ROUTE = FALSE ;
NET "tm3_clk_v0" TNM_NET = "tm3_clk_v0" ;
TIMESPEC "TS_tm3_clk_v0" = PERIOD "tm3_clk_v0" 20 ns HIGH 50% ;
`;
  assert.equal(constrainedPeriod(clocks, ucf, 7.352), 4.996);
  // a net named as the port, other names of the time group, case
  assert.equal(constrainedPeriod({ clk: 6.1, other: 9 }, 'NET "CLK" TNM_NET = "sys";\nTIMESPEC "TS_sys" = PERIOD "sys" 20 ns HIGH 50%;', 9), 6.1);
  // no PERIOD, a time group without one, a clock not found: the worst
  assert.equal(constrainedPeriod(clocks, '', 7.352), 7.352);
  assert.equal(constrainedPeriod(clocks, 'NET "tm3_clk_v0" TNM_NET = "g";', 7.352), 7.352);
  assert.equal(constrainedPeriod({ '$iopadmap$a': 3 }, ucf, 7.352), 7.352);
  assert.deepEqual(parseClocks(''), {});
});

// #366: designs added to the corpus after the weekly comparison ran are listed as such, not as not built
test('quality page: the designs added after the comparison (pending) have their own section', () => {
  const page = qualityPage({ generatedAt: '2026-10-17', designs: [], notBuilt: ['x'], pending: ['epfl-sin', 'itc99-b01'] });
  assert.match(page, /^## Added after this comparison\n\nepfl-sin, itc99-b01: added to the design corpus after this comparison was run; the next weekly run compares them too\.$/m);
  assert.match(page, /^- x: Silinx cannot read or synthesize it yet/m);
  assert.doesNotMatch(qualityPage({ generatedAt: '2026-10-17', designs: [] }), /Added after this comparison/);
});

// #377: Silinx at its two Optimization Efforts, Normal (the default) and High, against ISE at its default
test('quality page: Silinx at efforts Normal and High (the High columns and summary only when measured); the guard on both', () => {
  const res = { generatedAt: '2026-10-18', silinxVersion: 'x', isePeriodNs: 5, designs: [
    { name: 'epfl-priority', silinx: { luts: 174, slices: 90, ffs: 0, periodNs: 43.0, estimateNs: 43.5 }, silinxHigh: { luts: 250, slices: 130, ffs: 0, periodNs: 11.07, estimateNs: 11.24 }, ise: { luts: 200, slices: 100, ffs: 0, periodNs: 20.83 } },
    { name: 'serv', silinx: { luts: 300, slices: 200, ffs: 350, periodNs: 13.4 }, silinxHigh: { error: 'out of memory' }, ise: { luts: 330, slices: 210, ffs: 350, periodNs: 13.0 } },
  ] };
  const page = qualityPage(res);
  assert.match(page, /\*\*Normal\*\*, the\ndefault .* and \*\*High\*\*/);
  assert.match(page, /^\| design \| LUTs Silinx \| LUTs High \| LUTs ISE \| S \/ I \| H \/ I \|/m);
  assert.match(page, /^\| epfl-priority \| 174 \| 250 \| 200 \| 0\.87 \| 1\.25 \| 0 \| 0 \| 90 \| 130 \| 100 \|/m);
  assert.match(page, /^\| epfl-priority \| 43\.00 \| 11\.07 \| 20\.83 \| 2\.06 \| 0\.53 \| 43\.50 \| 11\.24 \|$/m);
  assert.match(page, /^- \*\*At Optimization Effort High:\*\* logic LUTs \+25%, slices \+30% against ISE \(1 designs\);\n {2}critical path −47%, as fast or faster on 1 of 1\.$/m);
  assert.match(page, /^- serv, Silinx at effort High: `out of memory`$/m);
  // without High results: the page as before (no High column)
  const plain = qualityPage({ ...res, designs: res.designs.map(({ silinxHigh, ...d }) => d) });
  assert.doesNotMatch(plain, /LUTs High|High \(trce\)|Effort High/);
  // the guard: a design built at High before that fails at High now
  const before = { designs: [{ name: 'serv', silinx: {}, silinxHigh: {}, ise: {} }] };
  assert.deepEqual(newFailures(before, res), ['serv (Silinx, effort High): out of memory']);
});

// #2941: since #2470 the Optimization is Fast, Area or Speed (impl.optLevel 1 alone is Fast): the comparison builds Area, a new
// project's default, and Speed, by their ISE properties, and the page names them; the results before it read as Normal and High
test('ISE comparison: Silinx at Optimizations Area and Speed, by their ISE properties, named in the page; the results before as Normal and High (#2941)', () => {
  assert.deepEqual(OPTIMIZATIONS, ['area', 'speed']);
  // what compare-ise.mjs sets on each build's project is what the flow reads as that Optimization (not optLevel 1: Fast)
  for (const goal of OPTIMIZATIONS) assert.equal(synthGoal({ startupClk: 'JtagClk', optLevel: 1, ...GOAL_IMPL[goal] }), goal);
  const src = fs.readFileSync(path.join(ROOT, 'test/designs-corpus/compare-ise.mjs'), 'utf8');
  assert.match(src, /project\.impl = \{ \.\.\.\(project\.impl \|\| \{\}\), \.\.\.GOAL_IMPL\[goal\] \};/);
  assert.doesNotMatch(src, /optLevel: EFFORTS/);
  assert.match(src, /optimizations: OPTIMIZATIONS, notBuilt/);
  assert.deepEqual(silinxSides({ optimizations: ['area', 'speed'] }), { main: 'Area', second: 'Speed' });
  assert.deepEqual(silinxSides({}), { main: 'Normal', second: 'High' });
  const p = (levels, logic, route) => ({ levels, lut: logic - 1.5, carry: 0, ff: 1.5, other: 0, logic, route });
  const res = { generatedAt: '2026-11-06', silinxVersion: 'x', isePeriodNs: 5, optimizations: ['area', 'speed'], designs: [
    { name: 'itc99-b12', silinx: { luts: 315, slices: 168, ffs: 119, periodNs: 10.6, estimateNs: 10.63, path: p(6, 5.8, 4.8) }, silinxHigh: { luts: 335, slices: 178, ffs: 119, periodNs: 9.4, estimateNs: 9.45, path: p(6, 5.8, 3.6) }, ise: { luts: 362, slices: 214, ffs: 141, periodNs: 7.8, path: p(5, 5, 2.8) } },
    { name: 'serv', silinx: { error: 'out of memory' }, silinxHigh: { error: 'no room' }, ise: { luts: 330, slices: 210, ffs: 350, periodNs: 13 } },
  ] };
  const page = qualityPage(res);
  assert.match(page, /^Silinx is built at two of its Optimizations \(Process Properties of \*Synthesize\*\): \*\*Area\*\*\n\(the default of a new project: .*\), and \*\*Speed\*\*\n\(the mappings for speed for every design and several placements, the faster circuit\); ISE at its default\. \*Silinx\* in the summary is Area; \*Area\* and \*Speed\* in the tables are the two\.$/m);
  assert.doesNotMatch(page, /Normal|Effort High|\| High|High \(trce\)/);
  assert.match(page, /^- \*\*Size:\*\* 1 designs built by both\. Logic LUTs: Silinx −13% against ISE/m);
  assert.match(page, /^- \*\*At Optimization Speed:\*\* logic LUTs −7%, slices −17% against ISE \(1 designs\);\n {2}critical path \+21%, as fast or faster on 0 of 1\.$/m);
  assert.match(page, /\*A \/ I\*: Area \/ ISE, the\nratio of logic LUTs/);
  assert.match(page, /^\| design \| LUTs Area \| LUTs Speed \| LUTs ISE \| A \/ I \| Sp \/ I \| FFs Area \| FFs ISE \| slices Area \| slices Speed \| slices ISE \| SRL16 A \/ I \| RAMB16 A \/ I \| MULT A \/ I \|$/m);
  assert.match(page, /^\| itc99-b12 \| 315 \| 335 \| 362 \| 0\.87 \| 0\.93 \| 119 \| 141 \| 168 \| 178 \| 214 \|/m);
  assert.match(page, /\*Area estimate\*: Silinx's own/);
  assert.match(page, /^\| design \| Area \(trce\) \| Speed \(trce\) \| ISE \(trce\) \| A \/ I \| Sp \/ I \| Area estimate \| Speed estimate \|$/m);
  assert.match(page, /^\| itc99-b12 \| 10\.60 \| 9\.40 \| 7\.80 \| 1\.36 \| 1\.21 \| 10\.63 \| 9\.45 \|$/m);
  assert.match(page, /^- Area: 1 design slower than ISE; against ISE's critical paths, on average, logic\n {2}\+0\.80 ns, routing \+2\.00 ns\.$/m);
  assert.match(page, /^- Speed: 1 design slower than ISE;/m);
  assert.match(page, /^\| design \| levels Area \| levels Speed \| levels ISE \| logic Area \|/m);
  assert.match(page, /^- serv, Silinx at Optimization Area: `out of memory`$/m);
  assert.match(page, /^- serv, Silinx at Optimization Speed: `no room`$/m);
  // the guard names them too
  const before = { designs: [{ name: 'serv', silinx: {}, silinxHigh: {}, ise: {} }] };
  assert.deepEqual(newFailures(before, res), ['serv (Silinx, Area): out of memory', 'serv (Silinx, Speed): no room']);
  // a --filter run is merged only into results of the same Optimizations (not the Normal and High of the results before)
  assert.equal(mergeable(res, { optimizations: OPTIMIZATIONS }), true);
  assert.equal(mergeable({ designs: [] }, { optimizations: OPTIMIZATIONS }), false);
  assert.equal(mergeable({ optimizations: ['fast', 'speed'] }, { optimizations: OPTIMIZATIONS }), false);
  // the results before #2941 (the committed ones of 2026-10-25): their page as it was, Normal and High
  const old = qualityPage({ ...res, optimizations: undefined });
  assert.match(old, /\*\*Normal\*\*, the\ndefault/);
  assert.match(old, /^\| design \| LUTs Silinx \| LUTs High \| LUTs ISE \| S \/ I \| H \/ I \|/m);
  assert.match(old, /^- serv, Silinx at effort High: `no room`$/m);
});

// #646: the critical paths' breakdown, from trce's reports (text extracts of ISE 14.7's trce -v 3 on the
// blinky example: test/fixtures/trce, ISE's own flow and Silinx's routing)
const twr = name => fs.readFileSync(path.join(ROOT, 'test/fixtures/trce', `${name}.twr.txt`), 'utf8');
test('ISE comparison: a critical path\'s levels of logic and its LUT, carry, flip-flop and routing delays, from trce (#646)', () => {
  // ISE: Tcko 0.587 + Topcyf 1.162 + Tcinxb 0.404 + Tilo 0.759 + Tsrck 0.910; nets 0.964 + 0 + 0.724 + 1.191
  const ise = { levels: 3, lut: 0.759, carry: 1.566, ff: 1.497, other: 0, logic: 3.822, route: 2.879 };
  assert.deepEqual(trcePaths(twr('blinky-ise')), [{ name: 'TS_clk = PERIOD TIMEGRP "clk" 20 ns HIGH 50%', ns: 6.701, path: ise }]);
  assert.deepEqual(criticalPath(twr('blinky-ise'), 6.701), ise);
  // Silinx's routing: Topcyf 1.162 + 3 × Tbyp 0.118 (the carry chain), Tcko 0.652 + Tsrck 0.910
  const silinx = { levels: 5, lut: 0.759, carry: 1.516, ff: 1.562, other: 0, logic: 3.837, route: 2.909 };
  assert.deepEqual(criticalPath(twr('blinky-silinx'), 6.746), silinx);
  // the logic delays add up to trce's logic
  for (const p of [ise, silinx]) assert.equal(+(p.lut + p.carry + p.ff + p.other).toFixed(3), p.logic);
  // trce -a (ise-open-check.sh: no constraint, each clock's analysis), several clocks: the analysis of the
  // period the comparison reports (#53), else the slowest
  const a = twr('blinky-silinx').replace(/^Timing constraint: .*$/m, 'Timing constraint: Default period analysis for net "clk_BUFGP"');
  const b = twr('blinky-ise').replace(/^Timing constraint: .*$/m, 'Timing constraint: Default period analysis for net "u_pre/tick"');
  assert.deepEqual(trcePaths(a + b).map(x => [x.name, x.ns]), [['Default period analysis for net "clk_BUFGP"', 6.746], ['Default period analysis for net "u_pre/tick"', 6.701]]);
  assert.deepEqual(criticalPath(a + b, 6.701), ise);
  assert.deepEqual(criticalPath(b + a, 6.746), silinx);
  assert.deepEqual(criticalPath(b + a, null), silinx);
  // a report without a path detailed (trce -v 0, an empty report): no breakdown
  assert.deepEqual(trcePaths(twr('blinky-ise').replace(/-{20,}\nSlack:[\s\S]*route\)\n/, '')), [{ name: 'TS_clk = PERIOD TIMEGRP "clk" 20 ns HIGH 50%', ns: 6.701, path: null }]);
  assert.equal(criticalPath('', 5), null);
  assert.equal(criticalPath(twr('blinky-ise').replace(/Levels of Logic = \d+/g, ''), 6.701), null);
});

test('quality page: the critical paths\' logic and routing (only when measured) and the gap of the slower designs (#646)', () => {
  const p = (levels, lut, carry, logic, route) => ({ levels, lut, carry, ff: 1.5, other: 0, logic, route });
  const res = { generatedAt: '2026-10-20', designs: [
    { name: 'a', silinx: { periodNs: 12, path: p(6, 4.2, 0, 5.7, 6.3) }, silinxHigh: { periodNs: 10, path: p(5, 3.5, 0, 5, 5) }, ise: { periodNs: 10, path: p(5, 3.5, 0, 5, 5) } },
    { name: 'b', silinx: { periodNs: 9, path: p(3, 1.5, 2, 5, 4) }, silinxHigh: { periodNs: 9.5, path: p(3, 1.5, 2, 5, 4.5) }, ise: { periodNs: 9.2, path: p(4, 2.25, 0.5, 4.25, 4.95) } },
    { name: 'c', silinx: { periodNs: 3 }, ise: { periodNs: 3 } },
  ] };
  const page = qualityPage(res);
  assert.match(page, /^### The critical paths: logic and routing$/m);
  // a: logic +0.70, routing +1.30; b is faster at Normal. High: b, logic +0.75, routing −0.45
  assert.match(page, /^- Silinx: 1 design slower than ISE; against ISE's critical paths, on average, logic\n {2}\+0\.70 ns, routing \+1\.30 ns\.$/m);
  assert.match(page, /^- High: 1 design slower than ISE; against ISE's critical paths, on average, logic\n {2}\+0\.75 ns, routing −0\.45 ns\.$/m);
  assert.match(page, /^\| design \| levels Silinx \| levels High \| levels ISE \| logic Silinx \| logic High \| logic ISE \| LUT Silinx \| LUT High \| LUT ISE \| carry Silinx \| carry High \| carry ISE \| route Silinx \| route High \| route ISE \|$/m);
  assert.ok(page.includes('| a | 6 | 5 | 5 | 5.70 | 5.00 | 5.00 | 4.20 | 3.50 | 3.50 | 0.00 | 0.00 | 0.00 | 6.30 | 5.00 | 5.00 |'), page);
  assert.ok(page.includes('| b | 3 | 3 | 4 | 5.00 | 5.00 | 4.25 | 1.50 | 1.50 | 2.25 | 2.00 | 2.00 | 0.50 | 4.00 | 4.50 | 4.95 |'));
  assert.doesNotMatch(page, /^\| c \| (\d|–) \|.*\| – \| – \|$/m);
  // without High: two sides; without any breakdown (the results before #646): no section
  const plain = qualityPage({ ...res, designs: res.designs.map(({ silinxHigh, ...d }) => d) });
  assert.match(plain, /^\| design \| levels Silinx \| levels ISE \| logic Silinx \| logic ISE \|/m);
  assert.doesNotMatch(plain, /^- High:/m);
  assert.doesNotMatch(qualityPage({ ...res, designs: res.designs.map(d => ({ name: d.name, silinx: { periodNs: d.silinx.periodNs }, ise: { periodNs: d.ise.periodNs } })) }), /The critical paths: logic and routing/);
});

test('#1774 compare-ise.mjs over SSH: the trce of Silinx\'s routings in the ssh config\'s remoteDir, the folder Docker Desktop shares, mounted as it is; else under the remote home', () => {
  assert.deepEqual(remoteWork('/Users/Shared/silinx-ise/build', 'silinx-compare-ab12'),
    { remote: '/Users/Shared/silinx-ise/build/silinx-compare-ab12', mount: '/Users/Shared/silinx-ise/build/silinx-compare-ab12' });
  assert.deepEqual(remoteWork('silinx-compare', 'silinx-compare-ab12'), { remote: 'silinx-compare/silinx-compare-ab12', mount: '$HOME/silinx-compare/silinx-compare-ab12' });
  // with the user's configuration as compare-ise.mjs copies it into its run's SILINX_CONFIG_DIR (iseWorkBase reads it there)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-1774-')), saved = process.env.SILINX_CONFIG_DIR;
  try {
    process.env.SILINX_CONFIG_DIR = dir;
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ mode: 'ssh', ssh: { host: 'h', remoteDir: '/Users/Shared/silinx-ise/build' } }));
    assert.equal(remoteWork(iseWorkBase('silinx-compare'), 'r').mount, '/Users/Shared/silinx-ise/build/r', 'not $HOME/silinx-compare/r: a folder Docker Desktop may not share');
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ mode: 'ssh', ssh: { host: 'h' } }));
    assert.equal(remoteWork(iseWorkBase('silinx-compare'), 'r').mount, '$HOME/silinx-compare/r', 'no remoteDir: the home, as before');
  } finally {
    if (saved === undefined) delete process.env.SILINX_CONFIG_DIR; else process.env.SILINX_CONFIG_DIR = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
