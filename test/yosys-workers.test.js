// Yosys in worker threads for Node (packages/silinx-fpga/src/synth-open-node.js yosysWorkers, #86): runs given at once go in
// parallel up to n, the others queued; outputs, lines and errors as yosysNode's; the open synthesis
// gives the same netlist; idle workers do not keep the process alive. With 4 Yosys or more at a time,
// the second balancing starts with the first mappings (#277), the netlist the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { yosysNode, yosysWorkers } from '../packages/silinx-fpga/src/synth-open-node.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { DEPTH_ABC2, DEPTH_ABC2_LUT4 } from '../packages/silinx-fpga/src/synth-open.js';
import { compile, elaborate } from '../core/compile.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// a run of a second or so that prints as it goes (a 16-bit multiplier made of gates)
const MUL = { 'm.v': 'module m(input [15:0] a, b, output [31:0] p); assign p = a * b; endmodule\n' };
const ARGS = ['-p', 'read_verilog m.v; synth -top m; abc -g AND; stat; write_json m.json'];

// each run: when its first line came and when it ended (an event counter, not the clock)
async function timeline(run, k) {
  let tick = 0;
  const runs = Array.from({ length: k }, () => ({ first: null, end: null }));
  const outs = await Promise.all(runs.map(r => run(ARGS, MUL, () => { if (r.first === null) r.first = ++tick; }).then(o => { r.end = ++tick; return o; })));
  return { runs, outs };
}

test('yosysWorkers: two runs at once in parallel, a third queued; the outputs as yosysNode\'s', { timeout: 300000 }, async () => {
  const one = await yosysNode(ARGS, MUL);
  const { runs, outs } = await timeline(yosysWorkers(2), 3);
  // the second starts printing before the first ends; the third only after one of them ended
  assert.ok(runs[1].first < runs[0].end, JSON.stringify(runs));
  assert.ok(runs[2].first > Math.min(runs[0].end, runs[1].end), JSON.stringify(runs));
  for (const o of outs) assert.equal(o['m.json'], one['m.json']);
  // one worker: one after the other
  const serial = await timeline(yosysWorkers(1), 2);
  assert.ok(serial.runs[1].first > serial.runs[0].end, JSON.stringify(serial.runs));
});

test('yosysWorkers: an error of Yosys as yosysNode\'s (its exit code), the worker kept for the next run', { timeout: 300000 }, async () => {
  const run = yosysWorkers(1);
  const bad = ['-p', 'read_verilog nothing.v'];
  const e1 = await yosysNode(bad, {}).catch(e => e);
  const e2 = await run(bad, {}).catch(e => e);
  assert.ok(e1 instanceof Error && e2 instanceof Error);
  assert.deepEqual([e2.message, e2.code], [e1.message, e1.code]);
  assert.equal(e2.code, 1);
  const out = await run(ARGS, MUL);
  assert.match(out['m.json'], /"m"/);
});

test('yosysWorkers: the open synthesis gives the same netlist as with yosysNode, its mappings in parallel', { timeout: 300000 }, async () => {
  const text = `module c(input clk, input [7:0] a, b, output reg [7:0] q); always @(posedge clk) q <= (a << b[2:0]) + (a > b ? a : b); endmodule`;
  const d = elaborate(compile([{ path: 'c.v', lang: 'verilog', text }]), 'c');
  const r1 = await synthesizeOpen(d, { run: yosysNode });
  const r2 = await synthesizeOpen(d, { run: yosysWorkers() });
  assert.equal(r2.files['c.json'], r1.files['c.json']);
  assert.deepEqual(r2.depth, r1.depth);
  assert.deepEqual(r2.warnings, r1.warnings);
});

test('yosysWorkers: idle workers do not keep the process alive', { timeout: 120000 }, () => {
  const script = `import { yosysWorkers } from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'packages/silinx-fpga/src/synth-open-node.js')).href)};
const run = yosysWorkers(2);
const o = await run(['-p', 'read_verilog m.v; write_json m.json'], { 'm.v': 'module m(input a, output y); assign y = a; endmodule' });
console.log(Object.keys(o).includes('m.json') ? 'done' : 'no netlist');`;
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-yw-')), 'idle.mjs');
  fs.writeFileSync(file, script);
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 100000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'done');
});

// the runs of a synthesis, in the order they are called and end: [{ kind, start, end }] (an event counter)
function recorder(parallel) {
  let tick = 0;
  const runs = [];
  const run = (args, files, onLine) => {
    const p = args.join(' ');
    // (ABC9's remap, #377: the cells' models read before the RTLIL)
    // (High's search for state machines to try one-hot, #539: started first, beside the usual run)
    const r = { kind: /silinx_fold_ce/.test(p) ? 'fold' : /speedup/.test(p) ? 'speed' : /write_rtlil silinx_fsm_pre\.il/.test(p) ? 'fsm' : / -abc9 -nowidelut /.test(p) ? 'abc9' : /^-q -p read_rtlil/.test(p) ? (/silinx_lut\.lib/.test(p) ? (p.split('if,-g').length > 3 ? 'third' : 'second-delays') : files['silinx_depth.abc'] === DEPTH_ABC2_LUT4 && /abc -luts 1,1,1,1 /.test(p) ? 'second-lut4' : files['silinx_depth.abc'] === DEPTH_ABC2 ? 'second' : 'first') : 'synth', start: ++tick, end: null };
    runs.push(r);
    return yosysNode(args, files, onLine).then(o => { r.end = ++tick; return o; });
  };
  return Object.assign(run, parallel ? { parallel } : {}, { runs });
}
const CHAIN = `module chain(input clk, input [23:0] a, input [23:0] b, output reg gt);
  reg [23:0] ra, rb;
  integer i;
  reg g;
  always @* begin
    g = 1'b0;
    for (i = 0; i < 24; i = i + 1) g = (ra[i] & ~rb[i]) | (~(ra[i] ^ rb[i]) & g);
  end
  always @(posedge clk) begin ra <= a; rb <= b; gt <= g; end
endmodule
`;
const COUNTER = 'module counter(input clk, output reg [7:0] q); always @(posedge clk) q <= q + 1; endmodule\n';

test('#277 with 4 Yosys at a time the second balancing (and ABC9\'s remap, #377) starts with the first mappings, with fewer after them; the same netlist', { timeout: 300000 }, async () => {
  const chain = elaborate(compile([{ path: 'chain.v', lang: 'verilog', text: CHAIN }]), 'chain');
  const few = recorder(2), many = recorder(4);
  const r1 = await synthesizeOpen(chain, { run: few });
  const r2 = await synthesizeOpen(chain, { run: many });
  const kinds = rs => rs.map(r => r.kind);
  // (the second balancing with and without the LUT delays, the third, and the second onto LUT4s alone, #370)
  // ABC9's remap (#377): with two last, after the others; with four right after the first ones, before the second
  // balancing (its run the longest); the critical path's remap (#652) after them all, measured against their choice
  assert.deepEqual(kinds(few.runs), ['fsm', 'synth', 'first', 'first', 'second', 'second-delays', 'third', 'second-lut4', 'abc9', 'speed']);
  assert.deepEqual(kinds(many.runs), ['fsm', 'synth', 'first', 'first', 'abc9', 'second', 'second-delays', 'third', 'second-lut4', 'speed']);
  const firstEnd = rs => Math.max(...rs.filter(r => r.kind === 'first').map(r => r.end));
  const secondStart = rs => Math.min(...rs.filter(r => /^second/.test(r.kind)).map(r => r.start));
  // two: after the first ones ended (the depth-oriented one kept); four: before
  assert.ok(secondStart(few.runs) > firstEnd(few.runs), JSON.stringify(few.runs));
  assert.ok(secondStart(many.runs) < firstEnd(many.runs), JSON.stringify(many.runs));
  const abc9Start = rs => rs.find(r => r.kind === 'abc9').start;
  assert.ok(abc9Start(few.runs) > Math.max(...few.runs.filter(r => /^second/.test(r.kind)).map(r => r.end)), JSON.stringify(few.runs));
  assert.ok(abc9Start(many.runs) < firstEnd(many.runs), JSON.stringify(many.runs));
  assert.equal(r2.files['chain.json'], r1.files['chain.json']);
  assert.deepEqual(r2.depth, r1.depth);
  assert.deepEqual(r2.warnings, r1.warnings);
  assert.equal(r1.depth.kept, true, JSON.stringify(r1.depth));
  // a counter: the depth-oriented mapping not kept; with four, its second balancing made and left
  const counter = elaborate(compile([{ path: 'counter.v', lang: 'verilog', text: COUNTER }]), 'counter');
  const c1 = recorder(), c2 = recorder(4);
  const n1 = await synthesizeOpen(counter, { run: c1 }), n2 = await synthesizeOpen(counter, { run: c2 });
  assert.deepEqual(kinds(c1.runs), ['fsm', 'synth', 'first', 'first', 'abc9', 'speed']);
  assert.deepEqual(kinds(c2.runs), ['fsm', 'synth', 'first', 'first', 'abc9', 'second', 'second-delays', 'third', 'second-lut4', 'speed']);
  assert.equal(n2.files['counter.json'], n1.files['counter.json']);
  assert.deepEqual(n2.depth, n1.depth);
  assert.deepEqual([n1.depth.kept, n1.depth.second, n1.depth.delays, n1.depth.third], [false, undefined, undefined, undefined]);
});

test('#277 yosysWorkers says how many Yosys it runs at a time: n, by default 4 at most and one core left', () => {
  assert.equal(yosysWorkers(3).parallel, 3);
  const cores = os.availableParallelism?.() ?? os.cpus().length;
  assert.equal(yosysWorkers().parallel, Math.min(4, Math.max(1, cores - 1)));
});
