// The charts of the FSM and ASM wizards of New Source (#2082, core/chart-wizard.js): the ports, the states and the
// transitions given, the chart valid (the warnings asserted), its HDL generated and elaborated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fsmFromSpec, asmFromSpec } from '../core/chart-wizard.js';
import { validateFsm, generateFsm } from '../core/fsm.js';
import { validate as validateAsm, generate as generateAsm } from '../core/asm.js';
import { compile, elaborate } from '../core/compile.js';

// the HDL compiled and elaborated: its errors and warnings
const diagsOf = (g, top) => {
  const lib = compile([{ path: g.filename || (g.lang === 'vhdl' ? 'x.vhd' : 'x.v'), lang: g.lang, text: g.code }]);
  return [...lib.errors, ...elaborate(lib, top).diags].map((d) => `${d.severity}: ${d.message}`);
};

const ports = [{ name: 'x', dir: 'in', width: 1 }, { name: 'n', dir: 'in', width: 4 }, { name: 'z', dir: 'out', width: 1 }, { name: 'q', dir: 'out', width: 3 }];

test('#2082 fsmFromSpec: the ports, the states (the first the initial one), the transitions by name, laid out in rows of 4', () => {
  const m = fsmFromSpec({ name: 'det', lang: 'verilog', type: 'mealy', clock: 'ck', reset: 'clr', description: ' A detector. ', ports,
    states: ['IDLE', 'A', 'B', 'C', 'D'], transitions: [{ from: 'IDLE', to: 'A', cond: 'x' }, { from: 'A', to: 'IDLE', cond: '' }, { from: 'D', to: 'D', cond: '1' }] });
  assert.equal(m.kind, 'fsm');
  assert.deepEqual([m.name, m.lang, m.type, m.clock, m.reset, m.description], ['det', 'verilog', 'mealy', 'ck', { name: 'clr', active: 'high', sync: false }, 'A detector.']);
  assert.deepEqual(m.inputs, [{ name: 'x', width: 1 }, { name: 'n', width: 4 }]);
  assert.deepEqual(m.outputs, [{ name: 'z', width: 1, default: '0' }, { name: 'q', width: 3, default: '0' }]);
  assert.deepEqual(m.states.map((s) => [s.id, s.name, s.x, s.y]), [['s1', 'IDLE', 120, 160], ['s2', 'A', 320, 160], ['s3', 'B', 520, 160], ['s4', 'C', 720, 160], ['s5', 'D', 120, 360]]);
  assert.deepEqual(m.transitions.map((t) => [t.id, t.from, t.to, t.cond]), [['t1', 's1', 's2', 'x'], ['t2', 's2', 's1', ''], ['t3', 's5', 's5', '']]);
  assert.equal(m.initial, 's1');
});

test('#2082 fsmFromSpec: a valid diagram, its warnings exactly those of the outputs never set and the states with no way out', () => {
  const m = fsmFromSpec({ name: 'det', lang: 'vhdl', ports: [ports[0], ports[2]], states: ['S0', 'S1'], transitions: [{ from: 'S0', to: 'S1', cond: 'x' }, { from: 'S1', to: 'S0', cond: '' }] });
  assert.deepEqual(validateFsm(m).map((d) => `${d.severity}: ${d.message}`), [
    'info: State S0: no transition is true when x=0; the machine stays in S0',
    "warning: Output 'z' is never set: it always keeps its default value 0",
  ]);
  for (const lang of ['vhdl', 'verilog']) {
    assert.deepEqual(diagsOf({ lang, ...generateFsm({ ...m, lang }, lang) }, 'det'), [], lang);
  }
});

test('#2082 fsmFromSpec: the errors of the states left to the diagram\'s validation (two states of a name, no states)', () => {
  assert.deepEqual(validateFsm(fsmFromSpec({ name: 'f', lang: 'vhdl', ports, states: ['A', 'a'] })).filter((d) => d.severity === 'error').map((d) => d.message),
    ["Two states are named 'a' (letter case does not count)"]);
  const empty = fsmFromSpec({ name: 'f', lang: 'vhdl', ports, states: [] });
  assert.equal(empty.initial, '');
  assert.match(validateFsm(empty).find((d) => d.severity === 'error').message, /no states/);
});

test('#2082 asmFromSpec: a state box per state, top to bottom, each followed by the next and the last by the first', () => {
  const m = asmFromSpec({ name: 'ctl', lang: 'vhdl', ports, states: ['IDLE', 'RUN', 'DONE'] });
  assert.deepEqual(m.nodes.map((n) => [n.id, n.type, n.name, n.x, n.y, n.actions]), [['s1', 'state', 'IDLE', 200, 80, []], ['s2', 'state', 'RUN', 200, 210, []], ['s3', 'state', 'DONE', 200, 340, []]]);
  assert.deepEqual(m.edges.map((e) => [e.from, e.to, e.port]), [['s1', 's2', 'next'], ['s2', 's3', 'next'], ['s3', 's1', 'next']]);
  assert.deepEqual(m.outputs, [{ name: 'z', width: 1, default: '0', registered: false }, { name: 'q', width: 3, default: '0', registered: false }]);
  assert.equal(m.initial, 's1');
  assert.deepEqual(m.reset, { name: 'rst', active: 'high', sync: false });
  assert.deepEqual(validateAsm(m), []);   // no warnings
  for (const lang of ['vhdl', 'verilog']) {
    assert.deepEqual(diagsOf({ lang, ...generateAsm({ ...m, lang }, lang) }, 'ctl'), [], lang);
  }
  // one state: it follows itself
  assert.deepEqual(asmFromSpec({ name: 'one', lang: 'vhdl', ports, states: ['S'] }).edges.map((e) => [e.from, e.to]), [['s1', 's1']]);
});
