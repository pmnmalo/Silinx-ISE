// The MCP server's grade tool (server/mcp-grade.js, #3192, #2674): an exercise of a project checked, its ports taken
// from the project's top, run on the project itself (a student's run, its visible tests) and on submissions of the
// exchange folder (a teacher's: the CSV written there), the student's copy written; its wrong arguments.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { COUNTER_V, counterExercise } from './grade-fixtures.mjs';

let tmp, xchg;
before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-mcp-grade-'));
  xchg = path.join(tmp, 'exchange');
  fs.mkdirSync(xchg);
  process.env.SILINX_MCP_FOLDER = xchg;
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

async function counterProject(name, text) {
  await ok('new_project', { name, board: 'basys2' });
  await ok('write_file', { project: name, path: 'src/counter4.v', text });
  await ok('set_top', { project: name, top: 'counter4' });
}

test('grade: an exercise checked, its ports from the top, run on the project (its visible tests), on submissions of the exchange folder (the CSV there), the student\'s copy', { timeout: 120000 }, async () => {
  await counterProject('c', COUNTER_V);
  // a teacher's exercise with no ports yet: its problems, then the ports from the top
  const ex = counterExercise();
  await ok('write_file', { project: 'c', path: 'counter4.exercise.json', text: JSON.stringify({ ...ex, ports: [] }) });
  const chk = await ok('grade', { project: 'c', action: 'check' });
  assert.equal(chk.text, 'counter4.exercise.json: "ports": a list of { "name", "dir": "in" | "out" | "inout", "width" }');
  const ports = await ok('grade', { project: 'c', action: 'ports' });
  assert.equal(ports.text, 'counter4.exercise.json: the top counter4, clk (in, 1), rst (in, 1), en (in, 1), q (out, 4)');
  assert.deepEqual(ports.data.ports, ex.ports);
  assert.deepEqual((await ok('grade', { project: 'c', action: 'check' })).data.problems, []);
  // the student's run: the visible tests on the project
  const vis = await ok('grade', { project: 'c', visible: true });
  assert.equal(vis.text, '4-bit counter (the visible tests)\nc: 30 / 30 points (Accepted), the visible tests\n  + count (Counting): AC Accepted, 30 / 30\n');
  assert.deepEqual(vis.data.results.map(r => [r.verdict, r.points, r.max]), [['AC', 30, 30]]);
  const all = await ok('grade', { project: 'c', language: 'pt' });
  assert.deepEqual(all.data.results.map(r => [r.verdict, r.points, r.max]), [['AC', 100, 100]]);
  assert.match(all.text, /^Contador de 4 bits\n/);
  // the teacher's run over the exchange folder's submissions: the CSV written there
  for (const [n, t] of [['ana', COUNTER_V], ['rui', COUNTER_V.replace("q + 4'd1", "q + 4'd2")]]) {
    fs.mkdirSync(path.join(xchg, 'subs', n, 'src'), { recursive: true });
    fs.writeFileSync(path.join(xchg, 'subs', n, 'src/counter4.v'), t);
    fs.writeFileSync(path.join(xchg, 'subs', n, 'silinx.json'), JSON.stringify({ name: n, top: 'counter4', files: [{ path: 'src/counter4.v', lang: 'verilog' }] }));
  }
  const many = await ok('grade', { project: 'c', submissions: ['subs'], csv: 'grades.csv' });
  assert.deepEqual(many.data.results.map(r => [r.submission, r.verdict, r.points]), [['ana', 'AC', 100], ['rui', 'WA', 0]]);
  assert.equal(fs.readFileSync(path.join(xchg, 'grades.csv'), 'utf8'), 'submission,points,max,verdict,count,count points,random,random points,bench,bench points\nana,100,100,AC,AC,30,AC,40,AC,30\nrui,0,100,WA,WA,0,WA,0,WA,0\n');
  assert.match(many.text, /\nCSV: .*grades\.csv$/);
  // (a CSV that exists is never replaced)
  assert.equal((await call('grade', { project: 'c', submissions: ['subs'], csv: 'grades.csv' })).text, 'grade: \'grades.csv\' exists: give another file');
  // the student's copy
  const copy = await ok('grade', { project: 'c', action: 'student_copy', file: 'student.exercise.json' });
  assert.deepEqual(copy.data.tests, ['count']);
  const sc = JSON.parse(fs.readFileSync(path.join(xchg, 'student.exercise.json'), 'utf8'));
  assert.equal('reference' in sc, false);
  assert.doesNotMatch(JSON.stringify(sc), /tb_counter4|"seed"/);
});

test('grade: a wrong submission\'s first difference; wrong arguments', { timeout: 120000 }, async () => {
  await counterProject('w', COUNTER_V.replace('else if (en) q', 'else q'));
  await ok('write_file', { project: 'w', path: 'counter4.exercise.json', text: JSON.stringify(counterExercise()) });
  const r = await ok('grade', { project: 'w', visible: true });
  assert.equal(r.text.split('\n').slice(1, 5).join('\n'), 'w: 0 / 30 points (Wrong Answer), the visible tests\n  WARNING: "src/counter4.v" Line 1: Input <en> is never used.\n  - count (Counting): WA Wrong Answer, 0 / 30\n      cycle 3 (vectors line 6): q is 0011, expected 0010');
  const err = async (args, text) => { const x = await call('grade', args); assert.deepEqual([x.isError, x.text], [true, text]); };
  await err({ project: 'nope' }, 'grade: no project \'nope\' in the workspace');
  await err({ project: 'w', action: 'fly' }, 'grade: action: one of run, check, ports, student_copy, new');
  await err({ project: 'w', exercise: 'x.json' }, 'grade: exercise: \'x.json\' is not a .exercise.json');
  await err({ project: 'w', action: 'student_copy' }, 'grade: file: the new file of the exchange folder for the student\'s copy');
  await err({ project: 'w', submissions: ['../../etc'] }, `grade: submissions: '../../etc' is outside the exchange folder (SILINX_MCP_FOLDER sets another)`);
  await ok('write_file', { project: 'w', path: 'other.exercise.json', text: '{}' });
  await err({ project: 'w' }, 'grade: exercise: the project \'w\' has 2 exercises (counter4.exercise.json, other.exercise.json): give one');
  const bad = await ok('grade', { project: 'w', exercise: 'other.exercise.json', action: 'check' });
  assert.match(bad.text, /^other\.exercise\.json: "silinxExercise": 1 expected\n/);
});

test('#3217 grade: an equivalence test on the project, proved; the student\'s copy leaves it out', { timeout: 120000 }, async () => {
  await counterProject('eqv', COUNTER_V);
  const ex = counterExercise();
  ex.tests = [{ id: 'same', visible: true, points: 20, kind: 'equivalence', depth: 10 }];
  await ok('write_file', { project: 'eqv', path: 'counter4.exercise.json', text: JSON.stringify(ex) });
  const r = await ok('grade', { project: 'eqv' });
  assert.equal(r.text, '4-bit counter\neqv: 20 / 20 points (Accepted)\n  + same: AC Accepted, 20 / 20\n      equivalent to the reference for every input sequence (proved by induction over 1 clock cycle(s))\n');
  const copy = await ok('grade', { project: 'eqv', action: 'student_copy', file: 'eqv-student.exercise.json' });
  assert.deepEqual(copy.data.tests, []);
});
