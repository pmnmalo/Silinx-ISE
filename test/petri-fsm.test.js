// The state machine of a Petri net (core/petri-fsm.js, #2696): its state space by the clock step, as an FSM; checked
// against the net's own clock step (core/petri.js), cycle by cycle, on random inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newPetri, normalizePetri, initialMarking, clockStep, outputsOf } from '../core/petri.js';
import { petriToFsm, MAX_GUARDS } from '../core/petri-fsm.js';
import { stepFsm, validateFsm } from '../core/fsm.js';
import { petriTemplate, templateDefaults, PETRI_TEMPLATES } from '../core/chart-templates.js';

const net = (d) => normalizePetri({ name: 'n', ...d });
const edges = (f) => f.transitions.map((t) => `${f.states.find((s) => s.id === t.from).name} -> ${f.states.find((s) => s.id === t.to).name} [${t.cond}]`);

// the net and its FSM run side by side: the same outputs before every clock edge
function sameRun(m, cycles = 300, seed = 7) {
  const { fsm } = petriToFsm(m);
  let r = seed;
  const rnd = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r; };
  let mk = initialMarking(m), fired = [], st = fsm.initial;
  for (let c = 0; c < cycles; c++) {
    const env = Object.fromEntries(m.inputs.map((i) => [i.name, BigInt(rnd() % (1 << i.width))]));
    const f = stepFsm(fsm, st, env);
    assert.deepEqual(f.outputs, outputsOf(m, mk, fired), `cycle ${c}`);
    const p = clockStep(m, mk, env);
    mk = p.marking; fired = p.fired; st = f.next;
  }
}
// the wizard's templates, with their guards' names declared as inputs
const template = (id) => {
  const m = petriTemplate(id, templateDefaults('petri', id));
  const names = [...new Set(m.transitions.flatMap((t) => t.guard.match(/[A-Za-z_]\w*/g) || []))];
  return normalizePetri({ ...m, inputs: names.map((name) => ({ name, width: 1 })) });
};

test('a new net: idle and work, go / !go, busy in work', () => {
  const r = petriToFsm(newPetri('ctl'));
  assert.equal(r.states, 2); assert.equal(r.truncated, false); assert.equal(r.error, undefined);
  assert.deepEqual(r.fsm.states.map((s) => [s.name, s.outputs, s.comment]), [['idle', {}, 'idle=1, work=0'], ['work', { busy: '1' }, 'idle=0, work=1']]);
  assert.deepEqual(edges(r.fsm), ['idle -> work [go]', 'work -> idle [!go]']);
  assert.equal(r.fsm.type, 'moore'); assert.equal(r.fsm.initial, 's0');
  assert.deepEqual(r.fsm.inputs, [{ name: 'go', width: 1 }]);
  assert.deepEqual(r.fsm.outputs, [{ name: 'busy', width: 1, default: '0' }]);
  sameRun(newPetri('ctl'));
});

test('mutual exclusion: the priority of req1 over req2 in the conditions', () => {
  const r = petriToFsm(template('mutex'));
  assert.deepEqual(edges(r.fsm), ['idle1 free idle2 -> idle1 cs2 [!req1 && req2]', 'idle1 free idle2 -> cs1 idle2 [req1]', 'idle1 cs2 -> idle1 free idle2 [!req2]', 'cs1 idle2 -> idle1 free idle2 [!req1]']);
});

test('fork/join: the two branches step together or apart; the join always fires', () => {
  const r = petriToFsm(template('forkjoin'));
  assert.deepEqual(edges(r.fsm), ['start -> a1 b1 [go]', 'a1 b1 -> a1 b2 [!a && b]', 'a1 b1 -> b1 a2 [a && !b]', 'a1 b1 -> a2 b2 [a && b]', 'a1 b2 -> a2 b2 [a]', 'b1 a2 -> a2 b2 [b]', 'a2 b2 -> start []']);
});

test('producer/consumer: a counter of items; put and get together keep it', () => {
  const r = petriToFsm(template('prodcons'));
  assert.deepEqual(r.fsm.states.map((s) => s.name), ['4·free', '3·free items', '2·free 2·items', 'free 3·items', '4·items']);
  assert.deepEqual(edges(r.fsm).slice(0, 3), ['4·free -> 3·free items [put]', '3·free items -> 4·free [!put && get]', '3·free items -> 2·free 2·items [put && !get]']);
});

test('every template of the wizard: the FSM runs as the net', () => {
  for (const { id } of PETRI_TEMPLATES) {
    const m = template(id);
    const r = petriToFsm(m);
    assert.equal(r.error, undefined, id);
    sameRun(m);
  }
});

test('pulse outputs: the state holds the transitions that fired (registered), as the HDL does', () => {
  const m = net({
    inputs: [{ name: 'x', width: 1 }], outputs: [{ name: 'on', width: 1 }, { name: 'tick', width: 1 }],
    places: [{ id: 'a', tokens: 1 }, { id: 'b', outputs: { on: '1' } }],
    transitions: [{ id: 'go', guard: 'x', outputs: { tick: '1' } }, { id: 'back', guard: '!x' }],
    arcs: [{ id: '1', from: 'a', to: 'go' }, { id: '2', from: 'go', to: 'b' }, { id: '3', from: 'b', to: 'back' }, { id: '4', from: 'back', to: 'a' }],
  });
  const r = petriToFsm(m);
  assert.deepEqual(r.fsm.states.map((s) => [s.name, s.outputs]), [['a', {}], ['b /go', { on: '1', tick: '1' }], ['b', { on: '1' }]]);
  assert.deepEqual(edges(r.fsm), ['a -> b /go [x]', 'b /go -> b [x]', 'b /go -> a [!x]', 'b -> a [!x]']);
  assert.match(r.fsm.states[1].comment, /fired go$/);
  sameRun(m);
});

test('multi-bit inputs and outputs, weights, an inhibitor arc, a capacity', () => {
  const m = net({
    inputs: [{ name: 'k', width: 2 }, { name: 'e', width: 1 }], outputs: [{ name: 'q', width: 3 }],
    places: [{ id: 'p', tokens: 2, capacity: 3, outputs: { q: '3' } }, { id: 'r', capacity: 2, outputs: { q: '4' } }, { id: 'z' }],
    transitions: [{ id: 'mv', guard: 'k == 2 || e' }, { id: 'up', guard: 'k[0]' }, { id: 'in', guard: '' }, { id: 'zz', guard: 'k == 3' }],
    arcs: [{ id: '1', from: 'p', to: 'mv', weight: 2 }, { id: '2', from: 'mv', to: 'r' }, { id: '3', from: 'r', to: 'up' }, { id: '4', from: 'up', to: 'p' },
      { id: '5', from: 'z', to: 'in', weight: 1, inhibitor: true }, { id: '6', from: 'in', to: 'z' }, { id: '7', from: 'z', to: 'zz' }],
  });
  const r = petriToFsm(m);
  assert.equal(r.error, undefined);
  assert.ok(r.states > 3);
  sameRun(m, 1000);
});

test('the combinations no input gives are don\'t cares: x and !x never both', () => {
  const m = net({
    inputs: [{ name: 'x', width: 1 }],
    places: [{ id: 'a', tokens: 1 }, 'b', 'c'].map((p) => (typeof p === 'string' ? { id: p } : p)),
    transitions: [{ id: 't1', guard: 'x' }, { id: 't2', guard: '!x' }],
    arcs: [{ id: '1', from: 'a', to: 't1' }, { id: '2', from: 't1', to: 'b' }, { id: '3', from: 'a', to: 't2' }, { id: '4', from: 't2', to: 'c' }],
  });
  assert.deepEqual(edges(petriToFsm(m).fsm), ['a -> c [!x]', 'a -> b [x]']);
  // a name no input declares: its values unknown, every combination of the guards kept (t1 first when both are true)
  assert.deepEqual(edges(petriToFsm(net({ ...m, inputs: [] })).fsm), ['a -> c [!x && !x]', 'a -> b [x]']);
});

test('a guard that does not parse never fires; one always true has no condition', () => {
  const m = net({
    places: [{ id: 'a', tokens: 1 }, { id: 'b' }],
    transitions: [{ id: 'bad', guard: 'x &&' }, { id: 'yes', guard: '' }],
    arcs: [{ id: '1', from: 'a', to: 'bad' }, { id: '2', from: 'bad', to: 'b' }, { id: '3', from: 'b', to: 'yes' }, { id: '4', from: 'a', to: 'yes' }, { id: '5', from: 'yes', to: 'a' }],
  });
  const r = petriToFsm(m);
  assert.deepEqual(r.fsm.states.map((s) => s.name), ['a']);
  assert.deepEqual(r.fsm.transitions, []);
});

test('the state space cut at maxStates; an empty net; too many guards at one marking', () => {
  const ring = template('cycle');
  const r = petriToFsm(ring, { maxStates: 2 });
  assert.equal(r.truncated, true); assert.equal(r.states, 2);
  assert.deepEqual(petriToFsm(net({})).fsm.states.map((s) => s.name), ['∅']);
  const n = MAX_GUARDS + 1;
  const wide = net({
    inputs: Array.from({ length: n }, (_, i) => ({ name: `i${i}`, width: 1 })),
    places: [{ id: 'p', tokens: 1 }],
    transitions: Array.from({ length: n }, (_, i) => ({ id: `t${i}`, guard: `i${i}` })),
    arcs: Array.from({ length: n }, (_, i) => ({ id: `a${i}`, from: 'p', to: `t${i}` })),
  });
  const w = petriToFsm(wide);
  assert.equal(w.fsm, null);
  assert.equal(w.error, `${n} guarded transitions may fire at one marking (at most ${MAX_GUARDS})`);
});

test('a state machine whose conditions are those of a valid FSM (their syntax)', () => {
  const r = petriToFsm(template('semaphore'));
  const condErrors = validateFsm(r.fsm).filter((d) => d.severity === 'error' && /condition/i.test(d.message));
  assert.deepEqual(condErrors, []);
});
