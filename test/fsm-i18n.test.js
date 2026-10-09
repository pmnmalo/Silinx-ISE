// The plain-language messages of the FSM state diagrams (core/fsm.js validation, tables, the
// editor's texts with names in them) have Portuguese translations (web/js/i18n-fsm.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFsm, validateFsm, encodedTable, truthTablesOf } from '../core/fsm.js';

Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (k === 'silinx.lang' ? 'pt' : null), setItem() {}, removeItem() {} }, configurable: true, writable: true });
const { t, LOCALES } = await import('../web/js/i18n.js');
const { FSM_PT } = await import('../web/js/i18n-fsm.js');

/** Models that produce every kind of message. */
function models() {
  return [
    normalizeFsm({
      name: 'my fsm', inputs: [{ name: 'x', width: 1 }, { name: 'X', width: 1 }, { name: 'begin', width: 1 }, { name: 'd', width: 40 }, { name: '', width: 1 }],
      outputs: [{ name: 'z', width: 1, default: 'x' }, { name: 'q', width: 1, default: '3' }],
      states: [{ id: 'a', name: 'A', outputs: { k: '1', z: 'x', q: '5' } }, { id: 'b', name: 'a' }, { id: 'c', name: '2nd' }],
      transitions: [
        { id: 't1', from: 'a', to: 'b', cond: 'x &&' }, { id: 't2', from: 'a', to: 'c', cond: 'foo' },
        { id: 't3', from: 'b', to: 'a', cond: 'z', outputs: { z: '1' } }, { id: 't4', from: 'b', to: 'zz' }, { id: 't5', from: 'c', to: 'a', cond: 'x[3]' },
      ],
      initial: 'a',
    }),
    normalizeFsm({ states: [] }),
    normalizeFsm({ clock: 'end', reset: { name: 'rst' }, states: [{ id: 'a', name: '' }] }),
    normalizeFsm({
      type: 'mealy', inputs: [{ name: 'go', width: 1 }, { name: 'op', width: 2 }, { name: 'w', width: 12 }, { name: 'v', width: 12 }], outputs: [{ name: 'z', width: 1 }, { name: 'n', width: 1 }],
      states: [{ id: 'i', name: 'IDLE' }, { id: 'r', name: 'RUN' }, { id: 'w', name: 'WAIT' }, { id: 'l', name: 'LOST' }, { id: 'e', name: 'END' }],
      transitions: [
        { id: 't1', from: 'i', to: 'r', cond: 'go && op != 0', outputs: { z: '1' } }, { id: 't2', from: 'i', to: 'w', cond: 'go' },
        { id: 't3', from: 'w', to: 'i', cond: '' }, { id: 't4', from: 'w', to: 'r', cond: 'go' }, { id: 't5', from: 'r', to: 'e', cond: 'w == v' },
        { id: 't6', from: 'r', to: 'l', cond: 'go && !go' }, { id: 't7', from: 'l', to: 'i', cond: '' },
      ],
      initial: 'i',
    }),
  ];
}

test('every validation message of core/fsm.js has a Portuguese translation', () => {
  const msgs = new Set();
  for (const m of models()) for (const d of validateFsm(m)) msgs.add(d.message);
  // every kind of message is produced
  for (const re of [/has no name/, /is not a valid name/, /reserved word/, /used twice/, /the width must be/, /default value 'x' must be a constant/,
    /default value 3 does not fit/, /no states/, /Two states/, /is not an output$/, /must be a constant/, /does not fit in/, /does not exist/,
    /is not valid \(/, /is an output; conditions/, /is not an input/, /Moore machine/, /never true/, /always taken first/, /cannot be reached/,
    /has no exit/, /both true when/, /no transition is true when/, /random combinations/, /is never set/, /: 'x' has 1 bit/]) {
    assert.ok([...msgs].some((x) => re.test(x)), `${re} produced`);
  }
  const missing = [...msgs].filter((x) => t(x) === x);
  assert.deepEqual(missing, []);
  // names, conditions and values are kept
  assert.equal(t('Transition A → 2nd: \'foo\' in the condition \'foo\' is not an input'), "Transição A → 2nd: 'foo' na condição 'foo' não é uma entrada");
  assert.equal(t('State IDLE: no transition is true when go=0, op=00 (and 3 other combination(s)); the machine stays in IDLE'),
    'Estado IDLE: nenhuma transição é verdadeira quando go=0, op=00 (e mais 3 combinação(ões)); a máquina fica em IDLE');
  assert.equal(t("Input 'begin' is a reserved word in Verilog and VHDL"), "A entrada 'begin' é uma palavra reservada em Verilog e VHDL");
});

test('table messages, editor texts with names and the out-of-sync reasons are translated; the dictionary does not change other translations', () => {
  const m = models()[3];
  for (const s of [encodedTable({ ...m, encoding: 'onehot' }).error, encodedTable(m).error, truthTablesOf(normalizeFsm({ inputs: [{ name: 'a', width: 6 }], states: [{ id: 's', name: 'S' }, { id: 'q', name: 'Q' }] })).error,
    '5 state(s), 7 transition(s) · Mealy', 'State S3 added', 'The diagram has 2 error(s): see Problems', 'Code: 01 (binary)', 'Transitions out of S0 (the first true condition is taken)',
    'Priority 1 of 2 in S0', 'Next state, for the inputs x y_1', 'Outputs z w', 'q1 q0: present state (flip-flop outputs), d1 d0: next state (D flip-flop inputs). Unused codes: X (don\'t care).',
    'next clock edge → S1', 'no transition is true: stays in S0', "— the diagram cannot show it: process at line 40 is not part of the state machine (it drives 'cnt')",
    '— the state diagram has errors: Two states are named \'a\'', "'det' cannot be shown as a state diagram:\n\nno clocked process found"]) {
    assert.ok(s, 'message');
    assert.notEqual(t(s), s, s);
  }
  // only new keys are added to the dictionary: existing translations stay as they were
  assert.equal(LOCALES.pt.strings.Default, 'Predefinida');
  for (const [k, v] of Object.entries(FSM_PT)) assert.ok(LOCALES.pt.strings[k] === v || LOCALES.pt.strings[k], k);
});
