// Authoring an exercise from a reference project (#3831, core/grade-author.js): the project's design as the exercise's
// reference (its files by their paths, a drawing's HDL written in), and a vectors test's outputs filled from the
// reference: checked against the counter's outputs written by hand, then graded; the styles kept; the problems.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectReference, expectedFromReference } from '../core/grade-author.js';
import { parseVectors } from '../core/grade-format.js';
import { gradeTests } from '../core/grade.js';
import { COUNTER_V, COUNTER_VHD, VECTORS, counterExercise, hdl, trafficExercise, drawing } from './grade-fixtures.mjs';

const sub = s => ({ ...s, files: new Map(Object.entries(s.files)) });
const counter = (vectors, extra = {}) => ({ ex: counterExercise(extra), test: { id: 'count', kind: 'vectors', clock: 'clk', vectors } });
// VECTORS with its outputs left out
const INPUTS = VECTORS.split('\n').map((l, k) => (k > 1 ? l.replace(/ \|.*$/, '') : l)).join('\n');

test('#3831 Expected from the Reference: the counter\'s outputs, as written by hand, from its rows\' inputs; the rows then graded', async () => {
  assert.equal(INPUTS, '# the reset, then counting with the enable on and off\nrst en | q\n1 0\n0 1\n0 1\n0 0\n0 1\n1 1\n0 1\n');
  const { ex, test: t } = counter(INPUTS);
  const r = expectedFromReference(ex, t);
  assert.deepEqual(r.problems, []);
  assert.equal(r.rows, 7);
  // (the header and the comment as written; q in decimal, its column having no value yet)
  assert.equal(r.text, '# the reset, then counting with the enable on and off\nrst en | q\n1 0 | 0\n0 1 | 1\n0 1 | 2\n0 0 | 2\n0 1 | 3\n1 1 | 0\n0 1 | 1\n');
  // (the same bits as the hand-written VECTORS', an independent reference)
  const ports = ex.ports;
  assert.deepEqual(parseVectors(r.text, ports, { clock: 'clk' }).rows.map(x => x.out), parseVectors(VECTORS, ports, { clock: 'clk' }).rows.map(x => x.out));
  const graded = await gradeTests({ ...ex, tests: [{ ...ex.tests[0], vectors: r.text }] }, sub(hdl(COUNTER_V)));
  assert.deepEqual(graded.tests.map(x => [x.verdict, x.messages]), [['AC', []]]);
});

test('#3831 Expected from the Reference: outputs written over, in their column\'s style; comments kept; a row with no \'|\'', () => {
  const { ex, test: t } = counter('rst en | q   # q after the edge\n1 0 | 0x0\n0 1 | 9 # wrong, replaced\n0 1\n\n# a pause\n0 0 | -\n');
  const r = expectedFromReference(ex, t);
  assert.deepEqual(r.problems, []);
  assert.equal(r.text, 'rst en | q   # q after the edge\n1 0 | 0x0\n0 1 | 0x1  # wrong, replaced\n0 1 | 0x2\n\n# a pause\n0 0 | 0x2\n');
  assert.equal(expectedFromReference(ex, { ...t, vectors: 'rst en | q\n1 0 | 0000\n0 1\n' }).text, 'rst en | q\n1 0 | 0000\n0 1 | 0001\n');
  assert.equal(expectedFromReference(ex, { ...t, vectors: 'rst en | q\n1 0 | 0b0\n0 1\n' }).text, 'rst en | q\n1 0 | 0b0000\n0 1 | 0b0001\n');
});

test('#3831 Expected from the Reference: an X of the reference is a don\'t care', () => {
  // (no reset in the first row: the VHDL reference's c starts at 0, a Verilog one with no reset is X)
  const ex = counterExercise({ reference: { files: [{ path: 'ref/counter4.v', text: COUNTER_V }] } });
  const r = expectedFromReference(ex, { id: 'x', kind: 'vectors', clock: 'clk', vectors: 'rst en | q\n0 1\n1 0\n0 1\n' });
  assert.equal(r.text, 'rst en | q\n0 1 | -\n1 0 | 0\n0 1 | 1\n');
});

test('#3831 Expected from the Reference: its problems', () => {
  const { ex, test: t } = counter('rst en | q\n1 0\n');
  const fails = (e, x) => expectedFromReference(e, x).problems;
  assert.deepEqual(fails(ex, { ...t, kind: 'reference' }), ['Expected from the Reference fills a vectors test']);
  assert.deepEqual(fails({ ...ex, reference: undefined }, t), ['the exercise has no reference design (Reference from the Project makes it of the project\'s)']);
  assert.deepEqual(fails({ ...ex, reference: { files: [{ path: 'ref/c.vhd', file: 'ref/c.vhd' }] } }, t), ['the exercise has no reference design (Reference from the Project makes it of the project\'s)']);
  assert.deepEqual(fails(ex, { ...t, vectors: '# nothing\n' }), ['the vectors are empty: a line of the inputs\' names, a \'|\', the outputs\' names, then a row of inputs per cycle']);
  assert.deepEqual(fails(ex, { ...t, vectors: 'rst en | q\n1\n0 2\n' }), ['vectors line 2: 2 input value(s), a \'|\', 1 output value(s)', 'vectors line 3: \'2\' is not a value of en (1 bit)']);
  assert.deepEqual(fails(ex, { ...t, vectors: 'rst go | q\n1 0\n' }), ['vectors line 1: \'go\' is not a port', 'vectors line 2: 1 input value(s), a \'|\', 1 output value(s)']);
  assert.deepEqual(fails({ ...ex, reference: { files: [{ path: 'ref/c.vhd', text: 'entity counter4 is\nend' }] } }, t), ['the reference: "ref/c.vhd" Line 2: expected \';\' but found end of file', 'the reference: "" Line 1: top module \'counter4\' not found']);
  assert.deepEqual(fails({ ...ex, reference: { files: [{ path: 'ref/c.v', text: COUNTER_V.replace(/\bq\b/g, 'count') }] } }, t), ['the reference: counter4 has no port q', 'the reference: counter4 has a port count the statement does not have']);
});

test('#3831 Reference from the Project: the design\'s files by their paths, its test benches left out; a drawing\'s HDL written in', () => {
  const s = sub(hdl(COUNTER_VHD, 'src/counter4.vhd', { project: { files: [{ path: 'src/counter4.vhd', lang: 'vhdl', role: 'design' }, { path: 'tb/tb.vhd', lang: 'vhdl', role: 'sim' }] }, files: { 'tb/tb.vhd': '-- a test bench\n' } }));
  assert.deepEqual(projectReference(s), { reference: { files: [{ path: 'src/counter4.vhd', file: 'src/counter4.vhd' }] }, problems: [] });
  // (an exercise in a folder: a file in it by its path from there, one outside it written in)
  assert.deepEqual(projectReference(s, 'src'), { reference: { files: [{ path: 'src/counter4.vhd', file: 'counter4.vhd' }] }, problems: [] });
  assert.deepEqual(projectReference(s, 'ex').reference.files, [{ path: 'src/counter4.vhd', text: COUNTER_VHD }]);
  // the traffic state machine drawn: its HDL made from the drawing (the stale file's text not taken), then filling a test
  const d = projectReference(sub(drawing()));
  assert.deepEqual(d.problems, []);
  assert.equal(d.reference.files.length, 1);
  assert.equal(d.reference.files[0].path, 'src/traffic.vhd');
  assert.match(d.reference.files[0].text, /entity traffic is/);
  const ex = trafficExercise({ reference: d.reference });
  const r = expectedFromReference(ex, { id: 'v', kind: 'vectors', clock: 'clk', vectors: 'rst req done night | phase\n1 0 0 0\n0 1 0 0\n0 0 1 0\n0 0 1 0\n' });
  assert.deepEqual(r.problems, []);
  const fromVhd = expectedFromReference(trafficExercise(), { id: 'v', kind: 'vectors', clock: 'clk', vectors: 'rst req done night | phase\n1 0 0 0\n0 1 0 0\n0 0 1 0\n0 0 1 0\n' });
  assert.equal(r.text, fromVhd.text);
  // its problems
  assert.deepEqual(projectReference(sub({ project: { files: [] }, files: {} })), { reference: null, problems: ['the project has no design file'] });
  assert.deepEqual(projectReference(sub({ project: { files: [{ path: 'src/a.v', lang: 'verilog' }] }, files: {} })), { reference: null, problems: ['src/a.v: the file is not in the submission'] });
});
