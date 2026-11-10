// Automatic grading's synthesis tests for the page (#3216): core/grade-synth.js, the spec and numbers the server's
// grader and the page share (the synthesis alone, Place & Route for the slices; the numbers from a flow's result, its
// errors, its warnings, a note for the slices not checked), and server/grade-routes.js, the local server's route that
// grades one synthesis test of a project's exercise on the project as saved, in a grading process (Accepted, Resource /
// Timing Limit; refused: not an exercise, not a synthesis test, a path out of the project). In-process server on a
// random port; workspace and config in a scratch directory.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scratchEnv, startApp } from './server-helpers.js';
import { GRADE_DEVICE, synthesisSpec, synthesisNumbers } from '../core/grade-synth.js';
import { COUNTER_VHD, counterExercise } from './grade-fixtures.mjs';

let tmp, app, P;
before(async () => {
  tmp = await scratchEnv('silinx-grade-routes-');
  P = await import('../server/projects.js');
  app = await startApp();
});
after(async () => {
  await app.close();
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test('#3216 synthesisSpec: the synthesis alone; Place & Route for the slices, when the device has its graph and its slices can be checked', () => {
  const status = { part: 'xc3s250ecp132-4', device: 'xc3s250e', graph: 'xc3s250ecp132-4.json.gz' };
  const base = { top: 'counter4', part: 'xc3s250ecp132-4', device: 'xc3s250e', pkg: 'cp132', family: 'spartan3e', synthEffort: 'normal', synthGoal: 'fast', graph: status.graph };
  assert.deepEqual(synthesisSpec('counter4', { ffs: 4 }, GRADE_DEVICE, status), { ...base, steps: ['synth'] });
  assert.deepEqual(synthesisSpec('counter4', { slices: 4 }, GRADE_DEVICE, status, [{ name: 'Slices' }]), { ...base, steps: ['synth', 'translate', 'map', 'par'], resources: [{ name: 'Slices' }] });
  assert.deepEqual(synthesisSpec('counter4', { slices: 4 }, GRADE_DEVICE, { ...status, slicesReason: 'offline' }).steps, ['synth']);
  assert.deepEqual(synthesisSpec('counter4', { slices: 4 }, GRADE_DEVICE, { ...status, graph: null }).steps, ['synth']);
});

test('#3216 synthesisNumbers: the used resources, the warnings, the errors (the flow\'s lines, else its error), the slices\' note', () => {
  const report = { synthesis: { utilization: [{ name: 'Number of latches', used: 2 }], summary: { luts: { used: 3 }, ffs: { used: 4 } } }, map: { summary: { slices: { used: 2 } } } };
  assert.deepEqual(synthesisNumbers({ ok: true, report }, ['Synthesizing…', 'WARNING:Xst - x'], { slices: 4 }, {}),
    { errors: [], warnings: ['WARNING:Xst - x'], latches: 2, luts: 3, ffs: 4, slices: 2 });
  assert.deepEqual(synthesisNumbers({ ok: true, report: { synthesis: {} } }, [], { slices: 4 }, { slicesReason: 'why' }),
    { errors: [], warnings: [], latches: 0, luts: 0, ffs: 0, slices: null, notes: ['why'] });
  assert.deepEqual(synthesisNumbers({ ok: false, error: 'it failed' }, ['ERROR:Silinx - synthesis failed: x'], {}, {}), { errors: ['ERROR:Silinx - synthesis failed: x'] });
  assert.deepEqual(synthesisNumbers({ ok: false, error: 'it failed' }, [], {}, {}), { errors: ['it failed'] });
});

test('#3216 POST /projects/:name/grade/synthesis: one synthesis test on the project as saved, in a grading process; refused: not an exercise, no such synthesis test, a path out of the project', { timeout: 300000 }, async () => {
  const dir = P.projectDir('Cnt');
  const ex = counterExercise();
  ex.tests = [...ex.tests, { id: 'impl', visible: true, points: 10, kind: 'synthesis', latches: false, ffs: 4 }, { id: 'tight', visible: true, points: 5, kind: 'synthesis', ffs: 2 }];
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'src/counter4.vhd'), COUNTER_VHD);
  await fs.writeFile(path.join(dir, 'silinx.json'), JSON.stringify({ name: 'Cnt', top: 'counter4', files: [{ path: 'src/counter4.vhd', lang: 'vhdl', role: 'design' }] }));
  await fs.writeFile(path.join(dir, 'counter4.exercise.json'), JSON.stringify(ex));
  let r = await app.call('POST', '/projects/Cnt/grade/synthesis', { exercise: 'counter4.exercise.json', test: 'impl' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.result, { id: 'impl', title: 'impl', kind: 'synthesis', visible: true, max: 10, points: 10, verdict: 'AC', messages: [], used: { luts: 0, ffs: 4, slices: null, latches: 0 } });
  r = await app.call('POST', '/projects/Cnt/grade/synthesis', { exercise: 'counter4.exercise.json', test: 'tight' });
  assert.deepEqual([r.body.result.verdict, r.body.result.messages, r.body.result.points], ['RL', ['4 flip-flops, at most 2'], 0]);
  for (const [body, error] of [[{ exercise: 'silinx.json', test: 'impl' }, 'exercise: the project\'s .exercise.json'], [{ exercise: 'counter4.exercise.json', test: 'count' }, 'counter4.exercise.json has no synthesis test \'count\''],
    [{ exercise: '../x.exercise.json', test: 'impl' }, 'path escapes project'], [{}, 'exercise: the project\'s .exercise.json']]) {
    r = await app.call('POST', '/projects/Cnt/grade/synthesis', body);
    assert.deepEqual([r.status, r.body.error], [400, error]);
  }
});
