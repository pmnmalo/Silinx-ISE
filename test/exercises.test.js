// The shipped exercises (#3192, exercises/): each one's problems none, graded by `silinx grade`'s functions
// (server/grade.js) on its starter project (what a student starts from: Wrong Answer, but the tests it passes) and on its
// reference as a submission (Accepted, every test, no warning); its student's copy without its hidden tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadExercise, gradeAll } from '../server/grade.js';
import { visibleCopy } from '../core/grade-format.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'exercises/counter4');

test('#3192 exercises/counter4: no problem; the starter project 10 / 100, the reference 100 / 100, no warning', { timeout: 300000 }, async () => {
  const file = path.join(DIR, 'counter4.exercise.json');
  const { exercise: ex, problems } = loadExercise(file);
  assert.deepEqual(problems, []);
  assert.deepEqual(ex.tests.map(t => [t.id, t.kind, !!t.visible, t.points]), [['count', 'vectors', true, 30], ['random', 'reference', false, 40], ['bench', 'testbench', false, 20], ['impl', 'synthesis', true, 10]]);
  assert.deepEqual(visibleCopy(ex).tests.map(t => t.id), ['count', 'impl']);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-exercises-'));
  try {
    const solved = path.join(tmp, 'solved');
    fs.cpSync(path.join(DIR, 'starter'), solved, { recursive: true });
    fs.copyFileSync(path.join(DIR, 'ref/counter4.vhd'), path.join(solved, 'src/counter4.vhd'));
    const { results } = await gradeAll(file, [path.join(DIR, 'starter'), solved]);
    assert.deepEqual(results.map(r => [r.submission, r.verdict, r.points, r.max]), [['starter', 'WA', 10, 100], ['solved', 'AC', 100, 100]]);
    assert.deepEqual(results.map(r => r.tests.map(t => t.verdict)), [['WA', 'WA', 'WA', 'AC'], ['AC', 'AC', 'AC', 'AC']]);
    assert.deepEqual(results[0].design.warnings, ['"src/counter4.vhd" Line 8: Input <clk> is never used.', '"src/counter4.vhd" Line 9: Input <rst> is never used.', '"src/counter4.vhd" Line 10: Input <en> is never used.']);
    assert.deepEqual(results[0].tests[0].messages, ['cycle 1 (vectors line 4): q is 0000, expected 0001']);
    assert.deepEqual(results[0].tests[2].messages, ['after 5 counts q is not 0101 at 111 ns (tb/tb_counter4.vhd line 25)']);
    assert.deepEqual(results[1].design.warnings, []);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
