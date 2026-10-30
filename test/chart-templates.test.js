// The templates of the FSM, ASM and Petri net wizards (#2149, core/chart-templates.js): each one, with its parameters
// at their defaults and at their limits, makes a valid chart (its warnings asserted) whose HDL compiles and
// elaborates with no warnings in VHDL and Verilog; the counters count, the sequence detector finds its pattern (against
// a search of the bit string) and the Petri nets behave as said (their clock steps); the parameters' errors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FSM_TEMPLATES, ASM_TEMPLATES, PETRI_TEMPLATES, templateDefaults, templateError, templateOf, fsmTemplate, asmTemplate, petriTemplate } from '../core/chart-templates.js';
import { fsmFromSpec, asmFromSpec, petriFromPorts } from '../core/chart-wizard.js';
import { validateFsm, simulateFsm } from '../core/fsm.js';
import { generateFsm } from '../core/fsm-hdl.js';
import { validate as validateAsm, generate as generateAsm } from '../core/asm.js';
import { validatePetri, generatePetri, initialMarking, clockStep, outputsOf } from '../core/petri.js';
import { compile, elaborate } from '../core/compile.js';

const LANGS = ['vhdl', 'verilog'];
// the HDL compiled and elaborated: its errors and warnings
const hdlDiags = ({ code }, lang, top) => {
  const lib = compile([{ path: `${top}.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: code }]);
  return [...lib.errors, ...elaborate(lib, top).diags].map((d) => `${d.severity}: ${d.message}`);
};
const fsmOf = (id, params, lang = 'vhdl') => { const t = fsmTemplate(id, params); return fsmFromSpec({ name: 'f', lang, ...t }); };
const asmOf = (id, params, lang = 'vhdl') => { const t = asmTemplate(id, params); return asmFromSpec({ name: 'a', lang, ports: t.ports, states: t.states, template: id, params }); };
const petriOf = (id, params, lang = 'vhdl') => { const t = petriTemplate(id, params); return petriFromPorts({ name: 'p', lang, ...t }); };
const plain = (diags) => diags.filter((d) => d.severity !== 'info').map((d) => `${d.severity}: ${d.message}`);

// each template's parameters: the defaults and the limits
const variants = (list, kind) => list.flatMap((t) => {
  const def = templateDefaults(kind, t.id);
  const out = [def];
  for (const p of t.params || []) if (p.min != null) for (const v of [p.min, p.max]) if (!(kind === 'fsm' && t.id === 'johnson' && v % 2)) out.push({ ...def, [p.key]: v });
  if (t.id === 'detector') for (const overlap of ['yes', 'no']) for (const type of ['moore', 'mealy']) out.push({ ...def, overlap, type, pattern: '0110' });
  return out.map((params) => [t.id, params]);
});

test('#2149 every FSM template, its parameters at the defaults and the limits: valid, no warnings, its HDL compiling (VHDL, Verilog)', () => {
  for (const [id, params] of variants(FSM_TEMPLATES, 'fsm')) {
    const what = `${id} ${JSON.stringify(params)}`;
    assert.equal(templateError('fsm', id, params), null, what);
    for (const lang of LANGS) {
      const m = fsmOf(id, params, lang);
      // (the counter with enable and the traffic light stay in a state while their input is 0: said as info; the
      // empty diagram: its two states with no transitions yet)
      assert.deepEqual(plain(validateFsm(m)), id === 'empty' ? ['warning: State S1 cannot be reached from the initial state S0',
        'warning: State S0 has no exit: once there, the machine stays in it until a reset', 'warning: State S1 has no exit: once there, the machine stays in it until a reset'] : [], `${what} ${lang}`);
      if (id === 'empty') continue;   // (no outputs: nothing to generate yet)
      assert.deepEqual(hdlDiags(generateFsm(m, lang), lang, 'f'), [], `${what} ${lang}`);
    }
  }
});

test('#2149 every ASM template: valid, no warnings, its HDL compiling (VHDL, Verilog); renamed states keep the chart', () => {
  for (const [id, params] of variants(ASM_TEMPLATES, 'asm')) {
    const what = `${id} ${JSON.stringify(params)}`;
    assert.equal(templateError('asm', id, params), null, what);
    for (const lang of LANGS) {
      const m = asmOf(id, params, lang);
      assert.deepEqual(plain(validateAsm(m)), [], `${what} ${lang}`);
      if (id === 'empty') continue;
      assert.deepEqual(hdlDiags(generateAsm(m, lang), lang, 'a'), [], `${what} ${lang}`);
    }
  }
  // the start/done controller's states renamed: the same boxes and edges, the new names
  const t = asmTemplate('startdone', {});
  const m = asmFromSpec({ name: 'a', lang: 'vhdl', ports: t.ports, states: ['WAITING', 'WORKING', 'OVER'], template: 'startdone' });
  assert.deepEqual(m.nodes.filter((n) => n.type === 'state').map((n) => n.name), ['WAITING', 'WORKING', 'OVER']);
  assert.deepEqual(m.edges.map((e) => `${e.from}>${e.to}:${e.port}`), t.edges.map((e) => `${e.from}>${e.to}:${e.port}`));
  // the empty template: the states typed in, chained
  assert.deepEqual(asmFromSpec({ name: 'a', lang: 'vhdl', ports: [], states: ['A', 'B', 'C'] }).edges.map((e) => `${e.from}>${e.to}`), ['s1>s2', 's2>s3', 's3>s1']);
});

test('#2149 every Petri net template: valid, no warnings, its HDL compiling (VHDL, Verilog)', () => {
  for (const [id, params] of variants(PETRI_TEMPLATES, 'petri')) {
    const what = `${id} ${JSON.stringify(params)}`;
    assert.equal(templateError('petri', id, params), null, what);
    for (const lang of LANGS) {
      const m = petriOf(id, params, lang);
      assert.deepEqual(plain(validatePetri(m)), [], `${what} ${lang}`);
      if (id === 'empty') continue;
      assert.deepEqual(hdlDiags(generatePetri(m, lang), lang, 'p'), [], `${what} ${lang}`);
    }
  }
});

// the outputs of an FSM, cycle by cycle, for the inputs given
const run = (m, inputs) => simulateFsm(m, inputs).map((r) => r.outputs);

test('#2149 FSM counters: the count, up / down, the enable, one-hot, Johnson', () => {
  const q = (m, inputs) => run(m, inputs).map((o) => Number(o.q));
  assert.deepEqual(q(fsmOf('counter', { n: 5 }), Array(7).fill({})), [0, 1, 2, 3, 4, 0, 1]);
  assert.equal(fsmOf('counter', { n: 5 }).outputs[0].width, 3);
  assert.deepEqual(q(fsmOf('updown', { n: 4 }), [1, 1, 0, 0, 0, 1].map((up) => ({ up }))), [0, 1, 2, 1, 0, 3]);
  assert.deepEqual(q(fsmOf('enable', { n: 3 }), [1, 0, 1, 1, 1].map((en) => ({ en }))), [0, 1, 1, 2, 0]);
  assert.deepEqual(q(fsmOf('ring', { n: 4 }), Array(5).fill({})), [1, 2, 4, 8, 1]);
  assert.deepEqual(q(fsmOf('johnson', { n: 6 }), Array(7).fill({})), [0b000, 0b001, 0b011, 0b111, 0b110, 0b100, 0b000]);
  const t = fsmOf('traffic', {});
  assert.deepEqual(run(t, [0, 1, 1, 0, 1].map((x) => ({ t: x }))).map((o) => ['green', 'yellow', 'red'].filter((k) => Number(o[k])).join()), ['green', 'green', 'yellow', 'red', 'red']);
});

test('#2149 FSM sequence detector: z where the bits read end with the pattern (overlapping or not), Moore one cycle later than Mealy', () => {
  // the reference: a search of the bit string; not overlapping: a match starts after the end of the last one
  const matches = (bits, p, overlap) => {
    const z = [];
    let from = 0;
    for (let i = 0; i < bits.length; i++) {
      const s = i + 1 - p.length;
      const hit = s >= from && bits.slice(s, i + 1) === p;
      z.push(hit ? 1 : 0);
      if (hit && !overlap) from = i + 1;
    }
    return z;
  };
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
  const bits = Array.from({ length: 300 }, () => String(rnd() >> 16 & 1)).join('');
  for (const p of ['1', '0', '11', '101', '1011', '0110', '1001', '111', '10100']) {
    for (const overlap of [true, false]) {
      const want = matches(bits, p, overlap);
      const xs = [...bits].map((b) => ({ x: Number(b) }));
      const mealy = run(fsmOf('detector', { pattern: p, overlap: overlap ? 'yes' : 'no', type: 'mealy' }), xs).map((o) => Number(o.z));
      assert.deepEqual(mealy, want, `Mealy ${p} overlap ${overlap}`);
      // Moore: the output of the state reached, a cycle later
      const moore = run(fsmOf('detector', { pattern: p, overlap: overlap ? 'yes' : 'no', type: 'moore' }), xs).map((o) => Number(o.z));
      assert.deepEqual(moore.slice(1), want.slice(0, -1), `Moore ${p} overlap ${overlap}`);
    }
  }
  assert.equal(fsmTemplate('detector', { pattern: '1011', overlap: 'yes', type: 'moore' }).states.length, 5);
  assert.equal(fsmTemplate('detector', { pattern: '1011', overlap: 'yes', type: 'mealy' }).states.length, 4);
});

// a Petri net's outputs, clock step by clock step, for the inputs given
const steps = (m, inputs) => {
  let mk = initialMarking(m);
  return inputs.map((env) => { const r = clockStep(m, mk, Object.fromEntries(Object.entries(env).map(([k, v]) => [k, BigInt(v)]))); mk = r.marking; return Object.fromEntries(Object.entries(outputsOf(m, mk)).map(([k, v]) => [k, Number(v)])); });
};

test('#2149 Petri net templates behave as said: the cycle, the buffer, the mutual exclusion, fork/join, the semaphore', () => {
  assert.deepEqual(steps(petriOf('cycle', { n: 3 }), [1, 0, 1, 1, 1].map((go) => ({ go }))).map((o) => o.q), [1, 1, 2, 0, 1]);
  // a buffer of 2: two puts fill it (the third waits), two gets empty it
  const pc = steps(petriOf('prodcons', { n: 2 }), [{ put: 1, get: 0 }, { put: 1, get: 0 }, { put: 1, get: 0 }, { put: 0, get: 1 }, { put: 0, get: 1 }]);
  assert.deepEqual(pc.map((o) => `${o.can_put}${o.has_data}`), ['11', '01', '01', '11', '10']);
  // both ask at once: one granted, never both; the other when the first leaves
  const mx = steps(petriOf('mutex', {}), [{ req1: 1, req2: 1 }, { req1: 1, req2: 1 }, { req1: 0, req2: 1 }, { req1: 0, req2: 1 }, { req1: 1, req2: 0 }, { req1: 1, req2: 0 }]);
  assert.deepEqual(mx.map((o) => `${o.grant1}${o.grant2}`), ['10', '10', '00', '01', '00', '10']);
  const fj = steps(petriOf('forkjoin', {}), [{ go: 1 }, { a: 1 }, {}, { b: 1 }, {}]);
  assert.deepEqual(fj.map((o) => `${o.busy_a}${o.busy_b}`), ['11', '01', '01', '00', '00']);
  // 2 resources, 3 users: three requests, two get one
  const sem = petriOf('semaphore', { n: 2, m: 3 });
  let mk = initialMarking(sem);
  for (let i = 0; i < 3; i++) mk = clockStep(sem, mk, { req: 1n, rel: 0n }).marking;
  assert.deepEqual([mk.p1, mk.p2, mk.p3], [1, 0, 2]);
});

test('#2149 the templates\' parameters refused with their messages; an unknown template is the empty one', () => {
  assert.equal(templateError('fsm', 'counter', { n: 1 }), 'Number of states (N): a whole number from 2 to 64.');
  assert.equal(templateError('fsm', 'counter', { n: '4.5' }), 'Number of states (N): a whole number from 2 to 64.');
  assert.equal(templateError('fsm', 'johnson', { n: 5 }), 'A Johnson counter has an even number of states.');
  assert.equal(templateError('fsm', 'detector', { pattern: '102', overlap: 'yes', type: 'moore' }), 'Pattern: 1 to 16 bits, 0 and 1 only.');
  assert.equal(templateError('fsm', 'detector', { pattern: '', overlap: 'yes', type: 'moore' }), 'Pattern: 1 to 16 bits, 0 and 1 only.');
  assert.equal(templateError('fsm', 'detector', { pattern: '11', overlap: 'maybe', type: 'moore' }), 'Overlapping matches: choose one.');
  assert.equal(templateError('petri', 'semaphore', { n: 2, m: 0 }), 'Users (M): a whole number from 1 to 255.');
  assert.equal(templateOf('asm', 'nope').id, 'empty');
  assert.deepEqual(templateDefaults('petri', 'semaphore'), { n: 2, m: 3 });
});
