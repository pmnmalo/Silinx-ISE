// core/synth-front.js (#1674, the toolchain's separation, #1651): the HDL front end's part of the open synthesis, an
// elaborated design as the flat Verilog and its hints, which packages/silinx-fpga/src/synth-open.js synthesizeVerilog synthesizes; and
// synthesizeVerilog on a flat Verilog given by hand, the toolchain's own input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { toVerilog } from '../core/synth-verilog.js';
import { gateAssignments, GATE_MIN } from '../packages/silinx-fpga/src/carry-chain.js';
import { synthesisInput, synthesizeOpen } from '../core/synth-front.js';
import * as synthOpen from '../packages/silinx-fpga/src/synth-open.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { example } from './examples-lib.mjs';

const designOf = (name) => {
  const ex = example(name);
  return elaborate(compile(ex.design), ex.project.top);
};

test('#1674 synthesisInput: the flat Verilog, its top and warnings as toVerilog writes them, and the gate count', () => {
  for (const name of ['gates', 'traffic', 'pong']) {
    const design = designOf(name);
    const v = toVerilog(design), input = synthesisInput(design);
    assert.deepEqual(Object.keys(input), ['text', 'top', 'warnings', 'shiftArrays', 'gates'], name);
    assert.equal(input.text, v.text, name);
    assert.equal(input.top, v.top, name);
    assert.deepEqual(input.warnings, [], name);
    assert.deepEqual(input.shiftArrays, v.shiftArrays ?? [], name);
    assert.equal(input.gates, gateAssignments(design), name);
  }
  // gates: the examples gates (36 gates) and blinky (3)
  assert.ok(synthesisInput(designOf('gates')).gates >= GATE_MIN);
  assert.ok(synthesisInput(designOf('blinky')).gates < GATE_MIN);
});

test('#1674 #1678 the IDE\'s synthesis (synthesizeOpen, synthesisInput) in core/synth-front.js, not in the package', () => {
  assert.equal(typeof synthesizeOpen, 'function');
  assert.equal(typeof synthesisInput, 'function');
  assert.ok(!('synthesizeOpen' in synthOpen) && !('synthesisInput' in synthOpen));
  assert.equal(typeof synthOpen.synthesizeVerilog, 'function');
});

test('#1674 synthesizeOpen: a front end\'s error rejects, as before (no Yosys run)', async () => {
  let ran = 0;
  await assert.rejects(synthesizeOpen(null, { run: async () => { ran++; return {}; } }), TypeError);
  assert.equal(ran, 0);
});

test('#1674 synthesizeOpen is synthesizeVerilog on the design\'s synthesis input: the same netlist and warnings', { timeout: 300000 }, async () => {
  const design = designOf('blinky');
  const opts = { family: 'spartan3e', run: yosysNode, effort: 'normal' };
  const a = await synthesizeOpen(design, opts);
  const b = await synthOpen.synthesizeVerilog(synthesisInput(design), opts);
  assert.deepEqual(a.files, b.files);
  assert.deepEqual(a.util, b.util);
  assert.deepEqual(a.warnings, []);
  assert.deepEqual(b.warnings, []);
});

test('#1674 synthesizeVerilog: a flat Verilog module given by hand, no hints', { timeout: 300000 }, async () => {
  const text = 'module cnt(input clk, input rst, output reg [3:0] q);\n  always @(posedge clk) if (rst) q <= 0; else q <= q + 1;\nendmodule\n';
  const r = await synthOpen.synthesizeVerilog({ text, top: 'cnt' }, { family: 'spartan3e', run: yosysNode, effort: 'normal' });
  assert.equal(r.top, 'cnt');
  assert.equal(r.files['cnt_syn.v'], text);
  assert.deepEqual(Object.keys(r.files), ['cnt_syn.v', 'cnt.json', 'cnt_yosys.v', 'cnt_stat.txt']);
  assert.deepEqual(r.cells, { INV: 1, MUXCY: 3, XORCY: 4, BUFG: 1, FDRE: 4, IBUF: 2, OBUF: 4 });
  assert.equal(r.util.flipFlops, 4);
  assert.deepEqual(r.warnings, []);
});
