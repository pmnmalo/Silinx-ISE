// A pull's conflicts in drawings, resolved object by object (#3197, core/git-resolve.js), on the examples' drawings: the
// conflicts listed with what each side did (moved, changed and its fields, removed); resolved "mine" and "theirs", the
// drawing checked as Check Drawing checks it; a resolution that leaves an object pointing at nothing refused; and the
// HDL of every resolved drawing made, compiled and simulated in VHDL and in Verilog (the state diagram against its own
// model, cycle by cycle).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { drawingConflicts, resolveConflict, checkResolved } from '../core/git-resolve.js';
import { normalizeFsm, generateFsm } from '../core/fsm.js';
import { viewHdl } from '../core/view-hdl.js';
import { simulate } from '../core/compile.js';
import { randomVectors, runHdl, runModel } from './fsm-sim.js';

const ROOT = path.join(import.meta.dirname, '..');
const text = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const json = (o) => `${JSON.stringify(o, null, 2)}\n`;
const clone = (o) => structuredClone(o);

// a drawing's HDL in a language, compiled and run (no errors): its module elaborated, a few cycles simulated
function compiles(p, model, lang) {
  const r = viewHdl(p, JSON.stringify({ ...model, lang, generatedFile: undefined }), { lang });
  assert.deepEqual(r.errors, [], `${p} ${lang}`);
  const s = simulate([{ path: lang === 'vhdl' ? 'x.vhd' : 'x.v', text: r.text }], r.module, { until: 100 });
  assert.deepEqual(s.errors, [], `${p} ${lang}: ${s.errors.join('; ')}`);
  return r;
}

test('a state diagram\'s conflicts: listed with what each side did; resolved mine and theirs, each simulating as its model in VHDL and Verilog', async () => {
  const p = 'src/traffic.fsm.json';
  const base = JSON.parse(text('examples', 'traffic', p));
  const mine = clone(base), theirs = clone(base);
  mine.states[0].x += 60;                           // s1 moved here
  theirs.states[0].comment = 'theirs';              // and changed there
  mine.transitions[0].cond = 'night and req';       // t1: two different conditions
  theirs.transitions[0].cond = 'not night';
  theirs.states[2].x += 10;                         // only theirs: taken, no conflict
  const c = drawingConflicts(p, json(base), json(mine), json(theirs));
  assert.deepEqual(c, { path: p, kind: 'fsm', conflicts: [
    { id: 'states/s1', label: 'states CARS', mine: 'moved', theirs: 'changed (comment)' },
    { id: 'transitions/t1', label: 'transitions t1', mine: 'changed (cond)', theirs: 'changed (cond)' },
  ] });
  await assert.rejects(resolveConflict(p, json(base), json(mine), json(theirs), { 'states/s1': 'mine' }), { message: `${p}: not every conflict is resolved: transitions/t1`, status: 400 });
  for (const side of ['mine', 'theirs']) {
    const r = await resolveConflict(p, json(base), json(mine), json(theirs), { 'states/s1': side, 'transitions/t1': side });
    const want = side === 'mine' ? mine : theirs;
    assert.deepEqual(r.model.states[0], want.states[0]);
    assert.equal(r.model.transitions[0].cond, want.transitions[0].cond);
    assert.equal(r.model.states[2].x, theirs.states[2].x);
    assert.equal(r.text, json(r.model));
    assert.deepEqual(await checkResolved('fsm', r.model), []);
    const m = normalizeFsm(r.model);
    const vectors = randomVectors(m, 80, side === 'mine' ? 7 : 9);
    for (const lang of ['vhdl', 'verilog']) assert.deepEqual(runHdl(generateFsm(m, lang).code, lang, m, vectors), runModel(m, vectors), `${side} ${lang}`);
  }
});

test('a resolution that leaves a transition pointing at a removed state is refused, as Check Drawing would', async () => {
  const p = 'src/traffic.fsm.json';
  const base = JSON.parse(text('examples', 'traffic', p));
  const mine = clone(base), theirs = clone(base);
  // mine removed s2 and its transitions; theirs changed s2 and added a transition to it
  mine.states = mine.states.filter((s) => s.id !== 's2');
  mine.transitions = mine.transitions.filter((t) => t.from !== 's2' && t.to !== 's2');
  theirs.states.find((s) => s.id === 's2').comment = 'kept';
  theirs.transitions.push({ id: 't99', from: 's1', to: 's2', cond: 'req', outputs: {} });
  assert.deepEqual(drawingConflicts(p, json(base), json(mine), json(theirs)).conflicts, [{ id: 'states/s2', label: 'states CARS_YELLOW', mine: 'removed', theirs: 'changed (comment)' }]);
  await assert.rejects(resolveConflict(p, json(base), json(mine), json(theirs), { 'states/s2': 'mine' }),
    (e) => { assert.equal(e.status, 422); assert.match(e.message, /^src\/traffic\.fsm\.json: the resolution is not a valid drawing: transitions t99: points at s2, which the resolution left out/); return true; });
  const kept = await resolveConflict(p, json(base), json(mine), json(theirs), { 'states/s2': 'theirs' });
  assert.ok(kept.model.states.some((s) => s.id === 's2') && kept.model.transitions.some((t) => t.id === 't99'));
});

test('an ASM chart and a schematic: a conflict resolved both ways, the HDL compiled and simulated in VHDL and Verilog', async () => {
  const cases = [
    { p: 'src/speed_ctrl.asm.json', dir: 'blinky', kind: 'asm', edit: (m, side) => { m.nodes[0].x += side === 'mine' ? 40 : -40; } },
    { p: 'src/gates.sch.json', dir: 'gates', kind: 'sch', edit: (m, side) => { m.symbols[0].x += side === 'mine' ? 20 : 40; } },
  ];
  for (const { p, dir, kind, edit } of cases) {
    const base = JSON.parse(text('examples', dir, p));
    const mine = clone(base), theirs = clone(base);
    edit(mine, 'mine'); edit(theirs, 'theirs');
    const c = drawingConflicts(p, json(base), json(mine), json(theirs));
    assert.equal(c.kind, kind);
    assert.deepEqual(c.conflicts.map((x) => [x.id, x.mine, x.theirs]), [[`${kind === 'asm' ? 'nodes' : 'symbols'}/${(kind === 'asm' ? base.nodes : base.symbols)[0].id}`, 'moved', 'moved']]);
    for (const side of ['mine', 'theirs']) {
      const r = await resolveConflict(p, json(base), json(mine), json(theirs), { [c.conflicts[0].id]: side });
      assert.deepEqual(await checkResolved(kind, r.model), []);
      for (const lang of ['vhdl', 'verilog']) compiles(p, r.model, lang);
    }
  }
});

test('not a drawing, or a version that is none: no conflicts of objects (a file\'s conflict)', async () => {
  assert.equal(drawingConflicts('src/top.vhd', 'a', 'b', 'c'), null);
  assert.equal(drawingConflicts('src/x.fsm.json', '{}', '{', '{}'), null);
  assert.equal(drawingConflicts('src/x.fsm.json', '{}', '[]', '{}'), null);
  // (a drawing both sides added: its base is none)
  assert.deepEqual(drawingConflicts('src/x.fsm.json', null, json({ name: 'a' }), json({ name: 'b' })).conflicts, [{ id: '.name', label: 'name', mine: 'changed', theirs: 'changed' }]);
  await assert.rejects(resolveConflict('src/top.vhd', 'a', 'b', 'c', {}), { message: '\'src/top.vhd\' is no drawing whose conflicts can be resolved object by object' });
});
