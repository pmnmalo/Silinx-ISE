// Automatic grading (#3192) on this machine (server/grade.js, server/grade-cli.js): the exercise's files beside it,
// kept inside its folder; a submission read from a folder or a zip within its limits (no symbolic link, no file too
// large); a folder of submissions; each graded in a process of its own, Node's permission model reading Silinx's
// files only, a test past its time Time Limit Exceeded (the process killed, the next test in a new one), past its
// heap Memory Limit Exceeded; the CSV; `silinx grade`'s exit status, --json, --csv, --student-copy; the synthesis tests
// (Accepted, Latch Inferred, Resource / Timing Limit, Not Synthesizable) through the open synthesis.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { loadExercise, readSubmission, expandSubmissions, gradeAll, gradeSubmission, synthesisStatus, processFlags, MAX_FILE } from '../server/grade.js';
import { slicesChipdb, GRADE_DEVICE } from '../server/grade-synth.js';
import { gradeCommand } from '../server/grade-cli.js';
import { createZip } from '../core/zip.js';
import { COUNTER_V, COUNTER_VHD, counterExercise } from './grade-fixtures.mjs';
import { MAX_ITERATIONS } from '../packages/silinx-hdl/src/util.js';

let tmp;
before(() => { tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-grade-'))); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); return file; };
function project(dir, text, file = 'src/counter4.v') {
  write(path.join(dir, file), text);
  write(path.join(dir, 'silinx.json'), JSON.stringify({ name: path.basename(dir), top: 'counter4', files: [{ path: file, lang: /\.vhd$/.test(file) ? 'vhdl' : 'verilog', role: 'design' }] }));
  return dir;
}
// the counter's exercise in a folder: its reference and its test bench in files beside it
function exercise(dir, extra = {}) {
  const ex = counterExercise(extra);
  write(path.join(dir, 'ref/counter4.vhd'), COUNTER_VHD);
  write(path.join(dir, 'tb/tb_counter4.v'), ex.tests[2].files[0].text);
  ex.reference = { files: [{ path: 'ref/counter4.vhd', file: 'ref/counter4.vhd' }] };
  ex.tests[2] = { ...ex.tests[2], files: [{ path: 'tb/tb_counter4.v', file: 'tb/tb_counter4.v' }] };
  return write(path.join(dir, 'counter4.exercise.json'), JSON.stringify(ex, null, 2));
}
const verdicts = r => Object.fromEntries(r.tests.map(t => [t.id, t.verdict]));
// (no loop past the interpreter's iteration limit, which is a Time Limit Exceeded of its own: its time only)
// a hang at the first clock edge: past the loop budget of one process run (#3630: Time Limit Exceeded, the budget's
// reason, at once); SLOW: each edge within the budget (about 4M iterations, a second or more), the test's time limit
const HANG = `module counter4(input clk, input rst, input en, output reg [3:0] q);
  integer i, j;
  always @(posedge clk) for (i = 0; i < 100000; i = i + 1) for (j = 0; j < 100000; j = j + 1) q = q + 4'd1;
endmodule
`;
const SLOW = HANG.replace(/100000/g, '2000');

test('#3192 loadExercise: the files beside it read; one outside its folder, or missing, refused', () => {
  const dir = path.join(tmp, 'ex1');
  const file = exercise(dir);
  const { exercise: ex, problems } = loadExercise(file);
  assert.deepEqual(problems, []);
  assert.equal(ex.reference.files[0].text, COUNTER_VHD);
  assert.match(ex.tests[2].files[0].text, /module tb_counter4/);
  write(path.join(dir, 'tests/count.vec'), 'rst en | q\n1 0 | 0\n');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.tests[0] = { id: 'count', kind: 'vectors', clock: 'clk', file: 'tests/count.vec' };
  assert.equal(loadExercise(write(path.join(dir, 'v.exercise.json'), JSON.stringify(raw))).exercise.tests[0].vectors, 'rst en | q\n1 0 | 0\n');
  write(path.join(tmp, 'secret.v'), 'module s; endmodule');
  raw.tests[0] = { id: 'count', kind: 'vectors', clock: 'clk', file: '../secret.v' };
  raw.reference.files[0].file = 'ref/none.vhd';
  assert.deepEqual(loadExercise(write(path.join(dir, 'bad.exercise.json'), JSON.stringify(raw))).problems, ['bad.exercise.json: no file ref/none.vhd beside it', 'bad.exercise.json: ../secret.v is not inside the exercise\'s folder']);
  if (process.platform !== 'win32') {   // (a symbolic link: Windows' needs a privilege)
    fs.symlinkSync(path.join(tmp, 'secret.v'), path.join(dir, 'link.v'));
    raw.reference.files[0].file = 'link.v';
    raw.tests[0] = counterExercise().tests[0];
    assert.deepEqual(loadExercise(write(path.join(dir, 'bad.exercise.json'), JSON.stringify(raw))).problems, ['bad.exercise.json: link.v is not inside the exercise\'s folder']);
  }
  assert.deepEqual(loadExercise(path.join(dir, 'none.exercise.json')).problems, ['none.exercise.json: no such file']);
});

test('#3192 readSubmission: a folder, a zip (its project at its root or in its one folder); refused: a symbolic link, a file too large, no project', async () => {
  const a = project(path.join(tmp, 'subs1/alice'), COUNTER_V);
  write(path.join(a, 'build/x.bit'), 'no');
  write(path.join(a, '.git/config'), 'no');
  const sa = await readSubmission(a);
  assert.deepEqual([sa.name, [...sa.files.keys()].sort(), sa.project.top], ['alice', ['silinx.json', 'src/counter4.v'], 'counter4']);
  const codec = { deflate: d => zlib.deflateRawSync(d) };
  const enc = t => new TextEncoder().encode(t);
  const zip = await createZip([{ path: 'bob/silinx.json', data: enc(fs.readFileSync(path.join(a, 'silinx.json'), 'utf8')) }, { path: 'bob/src/counter4.v', data: enc(COUNTER_V) }], codec);
  fs.writeFileSync(path.join(tmp, 'subs1/bob.zip'), zip);
  const sb = await readSubmission(path.join(tmp, 'subs1/bob.zip'));
  assert.deepEqual([sb.name, [...sb.files.keys()].sort()], ['bob', ['silinx.json', 'src/counter4.v']]);
  const c = project(path.join(tmp, 'subs1/carol'), COUNTER_V);
  if (process.platform !== 'win32') {
    fs.symlinkSync('counter4.v', path.join(c, 'src/hosts.v'));
    assert.deepEqual(await readSubmission(c), { name: 'carol', error: 'the submission cannot be read: src/hosts.v is a symbolic link' });
  } else fs.writeFileSync(path.join(c, 'silinx.json'), '{');
  const d = project(path.join(tmp, 'subs1/dave'), COUNTER_V);
  write(path.join(d, 'src/big.v'), 'x'.repeat(MAX_FILE + 1));
  assert.deepEqual(await readSubmission(d), { name: 'dave', error: 'the submission cannot be read: src/big.v is larger than 2 MB' });
  write(path.join(tmp, 'subs1/erin/notes.txt'), 'hello');
  assert.deepEqual(await readSubmission(path.join(tmp, 'subs1/erin')), { name: 'erin', error: 'no Silinx project (silinx.json not found)' });
  fs.writeFileSync(path.join(tmp, 'subs1/frank.zip'), 'PK not a zip');
  assert.deepEqual(await readSubmission(path.join(tmp, 'subs1/frank.zip')), { name: 'frank', error: 'the submission cannot be read: not a zip file' });
  assert.deepEqual(expandSubmissions([path.join(tmp, 'subs1')]).map(p => path.basename(p)), ['alice', 'bob.zip', 'carol', 'dave', 'erin', 'frank.zip']);
  assert.deepEqual(await readSubmission(path.join(tmp, 'subs1/none')), { name: 'none', error: 'no such file or folder' });
  assert.deepEqual(expandSubmissions([a]), [a]);
});

test('#3192 the grading process: its heap limited, Node\'s permission model reading Silinx\'s files only', { skip: !process.allowedNodeEnvironmentFlags.has('--permission') && 'no permission model in this Node' }, () => {
  const flags = processFlags(128);
  assert.equal(flags[0], '--max-old-space-size=128');
  assert.ok(flags.includes('--permission'));
  assert.ok(!flags.some(f => /allow-(fs-write|child-process|worker|addons)/.test(f)), flags.join(' '));
  // (a file outside Silinx's folders: not readable by it)
  const secret = write(path.join(tmp, 'hidden.exercise.json'), '{"secret":1}');
  const r = spawnSync(process.execPath, [...flags, '-e', `require('fs').readFileSync(${JSON.stringify(secret)})`], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /ERR_ACCESS_DENIED/);
});

test('#3192 gradeAll over a folder: Accepted, Wrong Answer, Compile Error, a submission that cannot be read; a hang Time Limit Exceeded, test by test; the CSV', { timeout: 120000 }, async () => {
  const ex = exercise(path.join(tmp, 'ex2'), { limits: { seconds: 3 } });
  const subs = path.join(tmp, 'subs2');
  project(path.join(subs, 'a-verilog'), COUNTER_V);
  project(path.join(subs, 'b-vhdl'), COUNTER_VHD, 'src/counter4.vhd');
  project(path.join(subs, 'c-wrong'), COUNTER_V.replace("q + 4'd1", "q + 4'd2"));
  project(path.join(subs, 'd-syntax'), COUNTER_V.replace("q + 4'd1", 'q +'));
  project(path.join(subs, 'e-hang'), HANG);
  project(path.join(subs, 'e-slow'), SLOW);
  write(path.join(subs, 'f-empty/readme.txt'), 'nothing');
  const seen = [];
  const t0 = Date.now();
  const { results, problems } = await gradeAll(ex, [subs], { onResult: r => seen.push(r.submission) });
  assert.deepEqual(problems, []);
  assert.deepEqual(seen, ['a-verilog', 'b-vhdl', 'c-wrong', 'd-syntax', 'e-hang', 'e-slow', 'f-empty']);
  assert.deepEqual(results.map(r => [r.submission, r.verdict, r.points]), [['a-verilog', 'AC', 100], ['b-vhdl', 'AC', 100], ['c-wrong', 'WA', 0], ['d-syntax', 'CE', 0], ['e-hang', 'TLE', 0], ['e-slow', 'TLE', 0], ['f-empty', 'CE', 0]]);
  for (const k of [4, 5]) assert.deepEqual(verdicts(results[k]), { count: 'TLE', random: 'TLE', bench: 'TLE' });
  // (the hang: the loop budget's reason or the test's time limit, whichever the machine reaches first: the budget's
  // 4M iterations take less than 3 s on one machine, more on another)
  const budget = inst => `loop iteration limit exceeded: more than ${MAX_ITERATIONS} iterations and calls in one evaluation (a constant, or a process until it waits) (in ${inst}/always_3)`;
  results[4].tests.forEach((t, k) => {
    assert.equal(t.messages.length, 1, String(t.messages));
    const m = t.messages[0];
    if (m !== 'the test took more than 3 s') {
      assert.match(m, / at \d+ ns \(src\/counter4\.v line 3\)$/);
      assert.equal(m.replace(/ at \d+ ns \(src\/counter4\.v line 3\)$/, ''), budget(k === 2 ? 'tb_counter4.uut' : 'counter4'));
    }
  });
  assert.deepEqual(results[5].tests.map(t => t.messages), [['the test took more than 3 s'], ['the test took more than 3 s'], ['the test took more than 3 s']]);
  for (const k of [4, 5]) assert.deepEqual(results[k].design.warnings, ['"src/counter4.v" Line 1: Input <rst> is never used.', '"src/counter4.v" Line 1: Input <en> is never used.',
    '"src/counter4.v" Line 3: Blocking assignment (=) to <q> in a clocked always block; use a non-blocking assignment (<=).']);
  assert.ok(Date.now() - t0 < 60000, `${Date.now() - t0} ms`);
  assert.deepEqual(results[6].design, { verdict: 'CE', messages: ['no Silinx project (silinx.json not found)'], warnings: [] });
  for (const r of results.slice(0, 2)) assert.deepEqual(r.design, { verdict: null, messages: [], warnings: [] });
  // --visible: the visible test alone
  const vis = await gradeAll(ex, [path.join(subs, 'c-wrong')], { visible: true });
  assert.deepEqual(vis.results.map(r => [r.verdict, r.points, r.max, r.tests.map(t => t.id)]), [['WA', 0, 30, ['count']]]);
  assert.deepEqual(vis.results[0].tests[0].messages, ['cycle 1 (vectors line 4): q is 0010, expected 0001']);
});

test('#3192 Memory Limit Exceeded: a design past the heap of its process (every test\'s)', { timeout: 120000 }, async () => {
  const ex = exercise(path.join(tmp, 'ex3'), { limits: { memoryMb: 64, seconds: 20 } });
  // (4M elements of 4 bits: within an object's limits, #3555, its values past 64 MB)
  const hog = project(path.join(tmp, 'subs3/hog'), `module counter4(input clk, input rst, input en, output reg [3:0] q);
  reg [3:0] mem [0:4000000];
  always @(posedge clk) if (rst) q <= 4'd0; else if (en) q <= q + mem[q];
endmodule
`);
  const { results } = await gradeAll(ex, [hog]);
  assert.deepEqual([results[0].verdict, results[0].design.messages], ['MLE', ['compiling the design needed more than 64 MB']]);
  assert.deepEqual(verdicts(results[0]), { count: 'MLE', random: 'MLE', bench: 'MLE' });
});

test('#3192 silinx grade: the report, --json, --csv, the exit status; --student-copy; wrong arguments', { timeout: 120000 }, async () => {
  const ex = exercise(path.join(tmp, 'ex4'));
  const good = project(path.join(tmp, 'subs4/good'), COUNTER_V), bad = project(path.join(tmp, 'subs4/bad'), COUNTER_V.replace("q + 4'd1", "q + 4'd2"));
  const run = async args => { let out = '', err = ''; const code = await gradeCommand(args, { out: t => { out += t; }, err: t => { err += t; } }); return { code, out, err }; };
  const ok = await run([ex, good, '--visible']);
  assert.deepEqual([ok.code, ok.err], [0, '']);
  assert.equal(ok.out, 'good: 30 / 30 points (Accepted), the visible tests\n  + count (Counting): AC Accepted, 30 / 30\n1 of 1 submission(s) Accepted\n');
  const json = path.join(tmp, 'r.json'), csv = path.join(tmp, 'r.csv');
  const both = await run([ex, path.join(tmp, 'subs4'), '--json', json, '--csv', csv, '--quiet']);
  assert.deepEqual([both.code, both.out], [2, '1 of 2 submission(s) Accepted\n']);
  assert.deepEqual(JSON.parse(fs.readFileSync(json, 'utf8')).map(r => [r.submission, r.verdict, r.points, r.max]), [['bad', 'WA', 0, 100], ['good', 'AC', 100, 100]]);
  assert.equal(fs.readFileSync(csv, 'utf8'), 'submission,points,max,verdict,count,count points,random,random points,bench,bench points\nbad,0,100,WA,WA,0,WA,0,WA,0\ngood,100,100,AC,AC,30,AC,40,AC,30\n');
  const copy = path.join(tmp, 'student.exercise.json');
  const c = await run([ex, '--student-copy', copy]);
  assert.deepEqual([c.code, c.out], [0, `${copy}: counter4 with its 1 visible test(s), no hidden test and no reference\n`]);
  const sc = JSON.parse(fs.readFileSync(copy, 'utf8'));
  assert.deepEqual([sc.tests.map(t => t.id), 'reference' in sc], [['count'], false]);
  assert.doesNotMatch(fs.readFileSync(copy, 'utf8'), /tb_counter4|COUNTER|architecture/);
  assert.deepEqual(await run([]), { code: 1, out: '', err: 'silinx grade: give the exercise (a .exercise.json) and the submissions\n' });
  assert.deepEqual(await run([ex]), { code: 1, out: '', err: 'silinx grade: give the submissions (project folders, zips, or a folder of them)\n' });
  assert.deepEqual(await run([ex, good, '--fast']), { code: 1, out: '', err: 'silinx grade: unknown option --fast\n' });
  assert.deepEqual(await run([ex, good, '--csv']), { code: 1, out: '', err: 'silinx grade: --csv needs a file\n' });
  assert.deepEqual(await run([path.join(tmp, 'none.exercise.json'), good]), { code: 1, out: '', err: 'none.exercise.json: no such file\n' });
  // (bin/silinx.js runs it)
  const r = spawnSync(process.execPath, [path.join(import.meta.dirname, '..', 'bin', 'silinx.js'), 'grade', ex, good, '--visible'], { encoding: 'utf8' });
  assert.deepEqual([r.status, r.stdout.split('\n').at(-2)], [0, '1 of 1 submission(s) Accepted']);
});

test('#3192 the synthesis tests: Accepted (the numbers used), Latch Inferred, Resource / Timing Limit, Not Synthesizable', { timeout: 600000 }, async () => {
  const dir = path.join(tmp, 'ex5');
  const ex = counterExercise();
  ex.tests = [{ id: 'impl', visible: true, points: 10, kind: 'synthesis', latches: false, luts: 4, ffs: 4, slices: 4 }];
  const file = write(path.join(dir, 'syn.exercise.json'), JSON.stringify(ex));
  const subs = path.join(tmp, 'subs5');
  project(path.join(subs, 'a-ok'), COUNTER_V);
  project(path.join(subs, 'b-latch'), `module counter4(input clk, input rst, input en, output reg [3:0] q);
  always @* if (en) q = {clk, rst, clk, rst};
endmodule
`);
  project(path.join(subs, 'c-big'), COUNTER_V.replace('reg [3:0] q', 'reg [3:0] q, output reg [3:0] r').replace('endmodule', "  always @(posedge clk) r <= q;\nendmodule"));
  project(path.join(subs, 'd-wait'), COUNTER_V.replace("else if (en) q <= q + 4'd1;", "else begin wait (en); q <= q + 4'd1; end"));
  // (c-big's extra port: the statement's ports for it)
  const big = JSON.parse(fs.readFileSync(file, 'utf8'));
  big.ports = [...big.ports, { name: 'r', dir: 'out', width: 4 }];
  const fileBig = write(path.join(dir, 'big.exercise.json'), JSON.stringify(big));
  const { results } = await gradeAll(file, [path.join(subs, 'a-ok'), path.join(subs, 'b-latch'), path.join(subs, 'd-wait')]);
  assert.deepEqual(results.map(r => [r.submission, r.tests[0].verdict]), [['a-ok', 'AC'], ['b-latch', 'LI'], ['d-wait', 'NS']], JSON.stringify(results.map(r => r.tests[0].messages)));
  // (the slices are Place & Route's packing, nextpnr's: 2 or 3 by its version)
  const { slices, ...used } = results[0].tests[0].used;
  assert.deepEqual(used, { luts: 0, ffs: 4, latches: 0 });
  assert.ok(slices >= 2 && slices <= 4, `${slices} slices`);
  assert.deepEqual(results[1].tests[0].messages, ['"src/counter4.v" Line 2: Found 4-bit latch for signal <q>. Latches may be generated from incomplete case or if statements.', 'the synthesis inferred 2 latches']);
  assert.deepEqual(results[2].tests[0].messages, ['ERROR:Silinx - synthesis failed: \'wait\' cannot be synthesized here (only one clock edge or sensitivity list per process) (line 4)']);
  const r = await gradeAll(fileBig, [path.join(subs, 'c-big')]);
  assert.deepEqual([r.results[0].tests[0].verdict, r.results[0].tests[0].messages], ['RL', ['8 flip-flops, at most 4']]);
});

test('#3215 the slices\' chip database got by the grader: an installation with it reads its own; offline, the slices not checked, said so', { timeout: 300000 }, async () => {
  // (a full installation: the package's own database, no folder of downloads to read)
  assert.deepEqual(await slicesChipdb(GRADE_DEVICE), { chipdbDir: null });
  // (the release zip's, offline: Place & Route's fetch fails as it says)
  const offline = { chipdb: async part => { throw new Error(`nextpnr's chip database of ${part} is not in this installation (the release zip leaves it out, #2329) and could not be downloaded from https://github.com/x/chipdb-xc3s250e.bin.gz (fetch failed): connect to the Internet once, or choose the Silinx engine (Process Properties ▸ Place & Route Engine)`); } };
  const why = 'the slices are not checked here: nextpnr\'s chip database of xc3s250e is not in this installation and could not be downloaded (fetch failed)';
  assert.deepEqual(await slicesChipdb(GRADE_DEVICE, { nextpnr: offline }), { chipdbDir: null, slicesReason: why });
  const dir = path.join(tmp, 'ex6');
  const ex = counterExercise();
  ex.tests = [{ id: 'impl', visible: true, points: 10, kind: 'synthesis', latches: false, luts: 4, ffs: 4, slices: 4 }, { id: 'luts', visible: true, points: 1, kind: 'synthesis', luts: 4 }];
  const file = write(path.join(dir, 'syn.exercise.json'), JSON.stringify(ex));
  const loaded = loadExercise(file).exercise;
  // (no test of the slices: no chip database asked for)
  let asked = 0;
  const counting = { chipdb: async () => { asked++; } };
  assert.equal((await synthesisStatus({ ...loaded, tests: [loaded.tests[1]] }, { nextpnr: counting })).slicesReason, undefined);
  assert.equal(asked, 0);
  const synthesis = await synthesisStatus(loaded, { nextpnr: offline });
  assert.equal(synthesis.slicesReason, why);
  const r = await gradeSubmission(loaded, await readSubmission(project(path.join(tmp, 'subs6', 'a-ok'), COUNTER_V)), { synthesis });
  assert.deepEqual(r.tests.map(t => [t.verdict, t.messages, t.used]), [['AC', [why], { luts: 0, ffs: 4, slices: null, latches: 0 }], ['AC', [], { luts: 0, ffs: 4, slices: null, latches: 0 }]]);
});
