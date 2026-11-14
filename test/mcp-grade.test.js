// The MCP server's grade tool (server/mcp-grade.js, #3192, #2674): an exercise of a project checked, its ports taken
// from the project's top, run on the project itself (a student's run, its visible tests) and on submissions of the
// exchange folder (a teacher's: the CSV written there), the student's copy written; its wrong arguments; an exercise
// authored from the project (#3831: its reference the project's design, a vectors test's outputs filled from it); its
// Classroom template written to the exchange folder (#3841).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { COUNTER_V, VECTORS, counterExercise } from './grade-fixtures.mjs';

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
  await err({ project: 'w', action: 'fly' }, 'grade: action: one of run, check, ports, reference, expected, student_copy, template, new');
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

test('#3831 grade reference and expected: the exercise\'s reference the project\'s design, a vectors test\'s outputs filled from it (in the exercise, in its file)', { timeout: 120000 }, async () => {
  await counterProject('teach', COUNTER_V);
  await ok('grade', { project: 'teach', action: 'new' });
  const ref = await ok('grade', { project: 'teach', action: 'reference' });
  assert.equal(ref.text, 'counter4.exercise.json: the reference, the project\'s design: src/counter4.v');
  const read = async () => JSON.parse((await ok('read_file', { project: 'teach', path: 'counter4.exercise.json' })).text);
  assert.deepEqual((await read()).reference, { files: [{ path: 'src/counter4.v', file: 'src/counter4.v' }] });
  // the teacher writes the inputs only
  const ex = await read();
  ex.tests[0].vectors = 'rst en | q\n1 0\n0 1\n0 1\n0 0\n';
  ex.tests.push({ id: 'more', visible: true, points: 5, kind: 'vectors', clock: 'clk', file: 'tests/more.vec' });
  await ok('write_file', { project: 'teach', path: 'counter4.exercise.json', text: JSON.stringify(ex) });
  await ok('write_file', { project: 'teach', path: 'tests/more.vec', text: 'rst en | q\n1 1 | 0x0\n0 1\n' });
  const exp = await ok('grade', { project: 'teach', action: 'expected', test: 'vectors' });
  assert.equal(exp.text, 'counter4.exercise.json: test vectors, the expected outputs of its 4 row(s) from the reference\nrst en | q\n1 0 | 0\n0 1 | 1\n0 1 | 2\n0 0 | 2\n');
  assert.equal((await read()).tests[0].vectors, 'rst en | q\n1 0 | 0\n0 1 | 1\n0 1 | 2\n0 0 | 2\n');
  const more = await ok('grade', { project: 'teach', action: 'expected', test: 'more' });
  assert.equal(more.data.file, 'tests/more.vec');
  assert.equal((await ok('read_file', { project: 'teach', path: 'tests/more.vec' })).text, 'rst en | q\n1 1 | 0x0\n0 1 | 0x1\n');
  // the exercise then graded on the project: every test Accepted, no warning
  const run = await ok('grade', { project: 'teach' });
  assert.equal(run.text, 'counter4\nteach: 15 / 15 points (Accepted)\n  + vectors (Vectors): AC Accepted, 10 / 10\n  + more: AC Accepted, 5 / 5\n');
  // its wrong arguments
  const err = async (args, text) => { const x = await call('grade', args); assert.deepEqual([x.isError, x.text], [true, text]); };
  await err({ project: 'teach', action: 'expected' }, 'grade: test: counter4.exercise.json has 2 vectors tests (vectors, more): give one');
  await err({ project: 'teach', action: 'expected', test: 'nope' }, 'grade: test: \'nope\' is not a vectors test of counter4.exercise.json (vectors, more)');
  await ok('write_file', { project: 'teach', path: 'counter4.exercise.json', text: JSON.stringify({ ...ex, reference: undefined }) });
  await err({ project: 'teach', action: 'expected', test: 'vectors' }, 'grade: test vectors: the exercise has no reference design (Reference from the Project makes it of the project\'s)');
  await ok('write_file', { project: 'teach', path: 'src/counter4.v', text: 'module counter4(' });
  await ok('grade', { project: 'teach', action: 'reference' });
  await err({ project: 'teach', action: 'expected', test: 'vectors' }, 'grade: test vectors: the reference: "src/counter4.v" Line 1: expected identifier but found \'eof\'\ntest vectors: the reference: "" Line 1: top module \'counter4\' not found');
});

test('#3841 grade template: the Classroom template in a new folder of the exchange folder, its starter from the statement in the project\'s language; graded as the workflow grades it', { timeout: 120000 }, async () => {
  await counterProject('tpl', COUNTER_V);
  const ex = counterExercise();
  ex.tests[0] = { ...ex.tests[0], vectors: undefined, file: 'tests/count.vec' };
  await ok('write_file', { project: 'tpl', path: 'counter4.exercise.json', text: JSON.stringify(ex) });
  await ok('write_file', { project: 'tpl', path: 'tests/count.vec', text: VECTORS });
  const r = await ok('grade', { project: 'tpl', action: 'template', folder: 'tpl-template' });
  const dir = path.join(xchg, 'tpl-template');
  assert.equal(r.text, `<exchange folder>/tpl-template: the template of counter4.exercise.json (7 files: the starter project in VHDL, the visible tests, README.md, the workflow)`);
  assert.deepEqual(r.data.files, ['silinx.json', 'src/counter4.vhd', 'tests/count.vec', 'counter4.exercise.json', 'README.md', '.gitignore', '.github/workflows/silinx-grade.yml']);
  assert.equal(fs.readFileSync(path.join(dir, 'tests/count.vec'), 'utf8'), VECTORS);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8')).board, 'basys2');
  assert.doesNotMatch(fs.readdirSync(dir, { recursive: true }).map(f => fs.statSync(path.join(dir, f)).isFile() ? fs.readFileSync(path.join(dir, f), 'utf8') : '').join('\n'), /tb_counter4|"seed"|"reference"/);
  // (the workflow's run on the template: the starter's visible test a Wrong Answer, no Compile Error)
  const { gradeAll } = await import('../server/grade.js');
  const g = await gradeAll(path.join(dir, 'counter4.exercise.json'), [dir], { visible: true, expand: false });
  assert.deepEqual(g.results.map(x => [x.verdict, x.tests.map(t => t.verdict)]), [['WA', ['WA']]]);
  // Verilog asked; the wrong arguments
  const v = await ok('grade', { project: 'tpl', action: 'template', folder: 'tpl-v', starter_language: 'verilog' });
  assert.ok(v.data.files.includes('src/counter4.v'));
  const err = async (args, text) => { const x = await call('grade', args); assert.deepEqual([x.isError, x.text], [true, text]); };
  await err({ project: 'tpl', action: 'template' }, 'grade: folder: the new folder of the exchange folder for the template');
  await err({ project: 'tpl', action: 'template', folder: 'tpl-template' }, 'grade: \'tpl-template\' is not a new folder: give another');
  await err({ project: 'tpl', action: 'template', folder: '../x' }, `grade: folder: '../x' is outside the exchange folder (SILINX_MCP_FOLDER sets another)`);
});
