// Tests for the kind of a state machine (#2728): Moore or Mealy follows from where its outputs are (fsmKind of
// core/fsm.js), not from a stored `type`. The repository's state machines (the test designs, the examples, the KISS2
// corpus, the FSM wizard's templates) give the same VHDL and Verilog whatever kind they store, compiled, elaborated
// and simulated in both languages; a stored kind that contradicts the outputs gives way to them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fsmKind, newFsm, normalizeFsm, validateFsm, generateFsm, FSM_ENCODINGS, FSM_STYLES } from '../core/fsm.js';
import { fromKiss2 } from '../core/kiss2.js';
import { FSM_TEMPLATES, fsmTemplate, templateDefaults } from '../core/chart-templates.js';
import { fsmFromSpec } from '../core/chart-wizard.js';
import { randomVectors, runHdl, runModel } from './fsm-sim.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** The repository's state machines: [name, model as stored]. */
function corpus() {
  const files = execFileSync('git', ['ls-files', '*.fsm.json'], { cwd: ROOT }).toString().trim().split('\n');
  const kiss = fs.readdirSync(path.join(ROOT, 'test/diagram-corpus/fsm')).filter((f) => f.endsWith('.kiss2')).sort();
  return [
    ...files.map((f) => [f, JSON.parse(read(f))]),
    ...kiss.map((f) => [f, fromKiss2(read(`test/diagram-corpus/fsm/${f}`), { name: f.replace('.kiss2', '') })]),
    ...FSM_TEMPLATES.flatMap((t) => (t.id === 'detector' ? ['moore', 'mealy'] : [undefined]).map((type) =>
      [`template ${t.id}${type ? ` ${type}` : ''}`, fsmFromSpec({ name: t.id, lang: 'vhdl', ...fsmTemplate(t.id, { ...templateDefaults('fsm', t.id), ...(type ? { type } : {}) }) })])),
  ];
}

/** A Moore machine: z = 1 in S1 (after a 1 on x). */
const moore = (extra = {}) => ({
  name: 'k', inputs: [{ name: 'x', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }],
  states: [{ id: 'a', name: 'S0' }, { id: 'b', name: 'S1', outputs: { z: '1' } }],
  transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'x' }, { id: 't2', from: 'b', to: 'a', cond: '!x' }],
  initial: 'a', ...extra,
});

test('#2728 fsmKind: Mealy when a transition sets an output, Moore otherwise; normalizeFsm writes it as the type', () => {
  assert.equal(fsmKind(newFsm('n')), 'moore');
  assert.equal(newFsm('n').type, 'moore');
  assert.equal(fsmKind(normalizeFsm(moore())), 'moore');
  assert.equal(fsmKind(normalizeFsm({ states: [] })), 'moore');
  const m = moore();
  m.transitions[1].outputs = { z: '1' };
  assert.equal(fsmKind(normalizeFsm(m)), 'mealy');
  // an empty outputs list on a transition is no output
  assert.equal(normalizeFsm(moore({ transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'x', outputs: {} }] })).type, 'moore');
  // the stored type is not read
  assert.equal(normalizeFsm({ ...moore(), type: 'mealy' }).type, 'moore');
  assert.equal(normalizeFsm({ ...m, type: 'moore' }).type, 'mealy');
});

test('#2728 a stored kind that contradicts the outputs: the outputs win (no error, the HDL the derived kind\'s)', () => {
  // stored Moore, an output on a transition: no longer an error, a Mealy machine
  const m = moore({ type: 'moore' });
  m.transitions[1].outputs = { z: '1' };
  assert.deepEqual(validateFsm(m).map((d) => `${d.severity}: ${d.message}`),
    ['info: State S0: no transition is true when x=0; the machine stays in S0', 'info: State S1: no transition is true when x=1; the machine stays in S1']);
  for (const lang of ['vhdl', 'verilog']) {
    const code = generateFsm(m, lang).code;
    assert.match(code, /Description : Mealy finite state machine/);
    assert.match(code, /Transitions \(state : condition -> next state \/ Mealy outputs\)/);
    const vectors = randomVectors(normalizeFsm(m), 60, 7);
    assert.deepEqual(runHdl(code, lang, normalizeFsm(m), vectors), runModel(normalizeFsm(m), vectors), lang);
  }
  // stored Mealy, outputs on the states only: a Moore machine, the same HDL as the Moore one (its logic was already)
  for (const lang of ['vhdl', 'verilog']) {
    const code = generateFsm(moore({ type: 'mealy' }), lang).code;
    assert.equal(code, generateFsm(moore(), lang).code);
    assert.match(code, /Description : Moore finite state machine/);
    assert.match(code, /States and codes \(Moore outputs\):/);
  }
});

test('#2728 the repository\'s state machines: their stored kind the derived one, the same HDL whatever kind they store', () => {
  const all = corpus();
  assert.ok(all.length >= 20, `${all.length} machines`);
  const kinds = { moore: 0, mealy: 0 };
  for (const [name, stored] of all) {
    const m = normalizeFsm(stored);
    if (stored.type) assert.equal(stored.type, fsmKind(m), `${name}: its stored kind`);
    kinds[m.type]++;
    for (const encoding of FSM_ENCODINGS) for (const style of FSM_STYLES) for (const lang of ['vhdl', 'verilog']) {
      const code = generateFsm({ ...stored, encoding, style }, lang).code;
      for (const type of [undefined, 'moore', 'mealy']) {
        const other = { ...stored, encoding, style, type };
        if (type === undefined) delete other.type;
        assert.equal(generateFsm(other, lang).code, code, `${name} ${encoding} ${style} ${lang} stored ${type}`);
      }
    }
  }
  assert.ok(kinds.moore > 0 && kinds.mealy > 0, JSON.stringify(kinds));
});

test('#2728 the repository\'s state machines: their HDL compiled, elaborated and simulated in VHDL and Verilog, as the diagram', () => {
  let n = 0;
  for (const [name, stored] of corpus()) {
    const m = normalizeFsm(stored);
    if (!m.outputs.length) continue;   // (the empty template: nothing to see)
    if (validateFsm(m).some((d) => d.severity === 'error')) assert.fail(`${name}: errors`);
    const vectors = randomVectors(m, 80, 17 + n);
    const want = runModel(m, vectors);
    for (const lang of ['vhdl', 'verilog']) assert.deepEqual(runHdl(generateFsm(m, lang).code, lang, m, vectors), want, `${name} ${lang}`);
    n++;
  }
  assert.ok(n >= 20, `${n} machines`);
});
