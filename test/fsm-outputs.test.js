// A state's or a transition's outputs as a table of the machine's outputs (core/fsm-outputs.js, #3814): the rows (one
// per output, its width, its default or the state's value for an empty one), a value checked (a constant, its width),
// set and cleared (the model the Outputs text box wrote: an output not set left out), several at once, an output
// renamed or removed (its values follow); the HDL generated the same, in VHDL and in Verilog, as from the text box.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeFsm, parseOutputs, generateFsm, validateFsm } from '../core/fsm.js';
import { outputRows, outputValueProblem, setOutputValue, setOutputValues, renameOutputValues, dropOutputValues, outputsWhere } from '../core/fsm-outputs.js';

const OUTS = [{ name: 'z', width: 1, default: '0' }, { name: 'y', width: 2, default: "2'b01" }, { name: 'n', width: 4, default: '0' }];
const machine = () => normalizeFsm({
  inputs: [{ name: 'x', width: 1 }], outputs: OUTS,
  states: [{ id: 'a', name: 'A', outputs: { y: "2'b10" } }, { id: 'b', name: 'B', outputs: { z: '1', n: '9' } }],
  transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'x' }, { id: 't2', from: 'b', to: 'a', cond: '', outputs: { z: '0' } }], initial: 'a',
});

test('the rows: one per output of the machine, in its order, its width and value; an empty one: its default, or the state\'s value', () => {
  const m = machine();
  assert.deepEqual(outputRows(m, m.states[0].outputs), [
    { name: 'z', width: 1, default: '0', value: '', placeholder: '0' },
    { name: 'y', width: 2, default: "2'b01", value: "2'b10", placeholder: "2'b01" },
    { name: 'n', width: 4, default: '0', value: '', placeholder: '0' }]);
  // a transition's: an empty value stands for its state's
  assert.deepEqual(outputRows(m, m.transitions[1].outputs, m.states[1].outputs).map((r) => [r.name, r.value, r.placeholder]),
    [['z', '0', '1'], ['y', '', "2'b01"], ['n', '', '9']]);
  // no outputs, no rows; an output the machine does not have (an old file's) not listed
  assert.deepEqual(outputRows(normalizeFsm({ outputs: [] }), { z: '1' }), []);
  assert.deepEqual(outputRows(m, { q: '1', z: '1' }).map((r) => r.value), ['1', '', '']);
});

test('a value checked against its output: empty (the default), a constant that fits in its width; the messages Check\'s', () => {
  const [z, y, n] = OUTS;
  for (const [v, o] of [['', z], ['  ', z], ['0', z], ['1', z], ["1'b1", z], ['3', y], ["2'b11", y], ["2'd2", y], ['15', n], ["4'hF", n], ["4'b1010", n], ['0', n]]) assert.equal(outputValueProblem(v, o), null, `${v} ${o.name}`);
  assert.equal(outputValueProblem('2', z), 'the value 2 of z does not fit in 1 bit(s)');
  assert.equal(outputValueProblem("2'b10", z), "the value 2'b10 of z does not fit in 1 bit(s)");
  assert.equal(outputValueProblem('4', y), 'the value 4 of y does not fit in 2 bit(s)');
  assert.equal(outputValueProblem('16', n), 'the value 16 of n does not fit in 4 bit(s)');
  assert.equal(outputValueProblem('x', z), "the value 'x' of z must be a constant (e.g. 0, 1, 4'b1010, 5)");
  assert.equal(outputValueProblem("2'b", y), "the value '2'b' of y must be a constant (e.g. 0, 1, 4'b1010, 5)");
  assert.equal(outputValueProblem('1z=1', z), "the value '1z=1' of z must be a constant (e.g. 0, 1, 4'b1010, 5)");
  // (a value that does not fit: what Check warns of, its words)
  const w = validateFsm(normalizeFsm({ ...machine(), states: [{ id: 'a', name: 'A', outputs: { y: '4' } }] })).filter((d) => d.severity === 'warning').map((d) => d.message);
  assert.ok(w.includes('State A: the value 4 of y does not fit in 2 bit(s)'), w.join('\n'));
});

test('a value set and cleared: the model the text box wrote (an output not set left out), the others in their order', () => {
  const m = machine(), s = m.states[1];
  assert.deepEqual(setOutputValue(s.outputs, 'n', ' 3 ', OUTS), { outputs: { z: '1', n: '3' } });
  assert.deepEqual(setOutputValue(s.outputs, 'y', "2'b11", OUTS), { outputs: { z: '1', n: '9', y: "2'b11" } });
  assert.deepEqual(setOutputValue(s.outputs, 'z', '', OUTS), { outputs: { n: '9' } });
  assert.deepEqual(setOutputValue({}, 'z', '', OUTS), { outputs: {} });
  assert.deepEqual(s.outputs, { z: '1', n: '9' });   // (not changed: a new object)
  // refused: not an output, not a constant, too wide
  assert.deepEqual(setOutputValue(s.outputs, 'q', '1', OUTS), { error: "'q' is not an output" });
  assert.deepEqual(setOutputValue(s.outputs, 'z', 'x', OUTS), { error: "the value 'x' of z must be a constant (e.g. 0, 1, 4'b1010, 5)" });
  assert.deepEqual(setOutputValue(s.outputs, 'n', '16', OUTS), { error: 'the value 16 of n does not fit in 4 bit(s)' });
  // the same as the text box's for the same values (parseOutputs)
  for (const text of ['z=1', "z=1, y=2'b10", 'n=15, z=0', '']) {
    const want = parseOutputs(text, OUTS).outputs;
    let got = {};
    for (const [k, v] of Object.entries(want)) got = setOutputValue(got, k, v, OUTS).outputs;
    assert.deepEqual(got, want, text);
  }
});

test('several values at once (the MCP\'s): set, cleared, the first refused one refuses them all', () => {
  assert.deepEqual(setOutputValues({ z: '1', n: '9' }, { n: '', y: '3' }, OUTS), { outputs: { z: '1', y: '3' } });
  assert.deepEqual(setOutputValues({ z: '1' }, {}, OUTS), { outputs: { z: '1' } });
  assert.deepEqual(setOutputValues({ z: '1' }, { y: '3', z: '2' }, OUTS), { error: 'the value 2 of z does not fit in 1 bit(s)' });
  assert.deepEqual(setOutputValues({}, { w: '0' }, OUTS), { error: "'w' is not an output" });
});

test('an output renamed: its values follow (not to an empty name or another output\'s); removed: its values gone', () => {
  const m = machine();
  m.outputs[2].name = 'cnt';
  assert.equal(renameOutputValues(m, 'n', 'cnt'), 1);
  assert.deepEqual(m.states.map((s) => s.outputs), [{ y: "2'b10" }, { z: '1', cnt: '9' }]);
  assert.equal(renameOutputValues(m, 'cnt', ''), 0);
  m.outputs[2].name = 'z';   // (the name of another output: left as it is)
  assert.equal(renameOutputValues(m, 'cnt', 'z'), 0);
  assert.deepEqual(m.states[1].outputs, { z: '1', cnt: '9' });
  assert.equal(dropOutputValues(m, 'z'), 2);
  assert.deepEqual([...m.states, ...m.transitions].map((x) => x.outputs), [{ y: "2'b10" }, { cnt: '9' }, {}, {}]);
  assert.equal(dropOutputValues(m, 'q'), 0);
});

test('where: a state and a transition named as Check names them', () => {
  const m = machine();
  assert.equal(outputsWhere(m, { type: 'state', id: 'b' }), 'State B');
  assert.equal(outputsWhere(m, { type: 'trans', id: 't2' }), 'Transition B → A');
  assert.equal(outputsWhere(m, { type: 'trans', id: 'gone' }), 'Transition ? → ?');
});

test('the traffic example: its values set in the table as in the text box, the HDL generated the same in VHDL and Verilog', () => {
  const src = JSON.parse(fs.readFileSync(new URL('../examples/traffic/src/traffic.fsm.json', import.meta.url), 'utf8'));
  const byTable = normalizeFsm(src), byText = normalizeFsm(src);
  // NIGHT: phase 7 (the table) and "phase=7" (the text box); WALK cleared (its default) and "" in the text box
  const at = (m, n) => m.states.find((s) => s.name === n);
  at(byTable, 'NIGHT').outputs = setOutputValue(at(byTable, 'NIGHT').outputs, 'phase', '7', byTable.outputs).outputs;
  at(byTable, 'WALK').outputs = setOutputValue(at(byTable, 'WALK').outputs, 'phase', '', byTable.outputs).outputs;
  at(byText, 'NIGHT').outputs = parseOutputs('phase=7', byText.outputs).outputs;
  at(byText, 'WALK').outputs = parseOutputs('', byText.outputs).outputs;
  assert.equal(JSON.stringify(byTable), JSON.stringify(byText));
  assert.deepEqual(setOutputValue(at(byTable, 'NIGHT').outputs, 'phase', '8', byTable.outputs), { error: 'the value 8 of phase does not fit in 3 bit(s)' });
  for (const lang of ['vhdl', 'verilog']) {
    const a = generateFsm(byTable, lang), b = generateFsm(byText, lang);
    assert.equal(a.code, b.code, lang);
    assert.match(a.code, lang === 'vhdl' ? /when S_NIGHT =>\n\s+phase <= "111";/ : /S_NIGHT: phase = 3'd7;/);
    assert.doesNotMatch(a.code, lang === 'vhdl' ? /when S_WALK =>\n\s+phase/ : /S_WALK: phase/);
  }
});
