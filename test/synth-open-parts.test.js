// The parts of the open synthesis (#405: out of packages/silinx-fpga/src/synth-open.js): running Yosys (synth-open-yosys.js: a failed run's
// message, its output as lines, the worker's source), the critical path of a netlist (synth-open-path.js) and the
// depth-oriented mappings of synthesizeOpen (synth-open-depth.js). synth-open.js still exports what moved. A small
// design synthesized: the depth mappings tried (the depth-oriented one, the wide, ABC9 and speed remaps), none kept,
// their estimates the usual netlist's; its levels, critical path and estimate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as so from '../packages/silinx-fpga/src/synth-open.js';
import { yosysError, lineStream, yosysWorkerSource, asText } from '../packages/silinx-fpga/src/synth-open-yosys.js';
import { pathEnds, logicLevels, criticalDelay, deepDesign, DEEP_RULE } from '../packages/silinx-fpga/src/synth-open-path.js';
import { mountDepth } from '../packages/silinx-fpga/src/synth-open-depth.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { compile, elaborate } from '../core/compile.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

test('#405 open synthesis parts: synth-open.js exports what moved', () => {
  assert.deepEqual([so.yosysError, so.lineStream, so.yosysWorkerSource, so.asText], [yosysError, lineStream, yosysWorkerSource, asText]);
  assert.deepEqual([so.pathEnds, so.logicLevels, so.criticalDelay, so.deepDesign, so.DEEP_RULE], [pathEnds, logicLevels, criticalDelay, deepDesign, DEEP_RULE]);
  assert.equal(typeof mountDepth, 'function');
});

test('#405 open synthesis parts, running Yosys: a failed run\'s message, the output as lines, the worker\'s source', () => {
  assert.deepEqual(yosysError({ code: 1 }), { message: 'Yosys failed (exit code 1)', code: 1, crash: false });
  assert.equal(yosysError(new RangeError('Maximum call stack size exceeded')).crash, true);
  const lines = [];
  const feed = lineStream((l) => lines.push(l));
  const enc = new TextEncoder();
  feed(enc.encode('one\r\ntw')); feed(enc.encode('o\n\x1b[1mthree\x1b[0m\nfou')); feed.end();
  assert.deepEqual(lines, ['one', 'two', 'three', 'fou']);
  assert.equal(asText(enc.encode('x')), 'x');
  // the worker's text: a classic script (no export), with the helpers it needs
  const src = yosysWorkerSource('https://example.invalid/yosys.js');
  assert.match(src, /^const asText = /m);
  assert.doesNotMatch(src, /^export /m);
  assert.doesNotThrow(() => new Function(src));
});

test('#405 open synthesis parts: a comparator synthesized, the depth mappings tried, its path and levels', { timeout: 120000 }, async () => {
  const V = `module cmp(input [15:0] a, b, output lt, output [15:0] m);
  assign lt = a < b;
  assign m = (a & b) ^ {a[7:0], b[15:8]};
endmodule
`;
  const r = await synthesizeOpen(elaborate(compile([{ path: 'cmp.v', lang: 'verilog', text: V }]), 'cmp'), { run: yosysNode });
  assert.deepEqual(r.warnings, []);
  assert.deepEqual([r.util.luts, r.util.carry, r.util.ios], [32, 8, 49]);
  // every depth mapping tried at High, none faster: the usual netlist kept
  assert.deepEqual(Object.keys(r.depth), ['tried', 'kept', 'ns', 'luts', 'wide', 'slices', 'abc9', 'speed']);
  assert.equal(r.depth.kept, false);
  for (const k of ['wide', 'abc9', 'speed']) assert.equal(r.depth[k].kept, false, k);
  const json = JSON.parse(r.files['cmp.json']);
  const ns = criticalDelay(json, 'cmp');
  assert.equal(ns, pathEnds(json, 'cmp').worst);
  assert.deepEqual(r.depth.ns, [ns, ns]);
  assert.equal(logicLevels(json, 'cmp'), 1);
  assert.equal(deepDesign(json, 'cmp'), false);
});
