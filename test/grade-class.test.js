// The class's results (#3864, core/grade-class.js): five students' results of the counter exercise, graded for real
// (right in Verilog and VHDL, two wrong, one that does not compile), summed up per test and per student against the
// numbers counted by hand; the CSV, the text; a results file checked (not results, too big, two exercises).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseResults, classSummary, classCsv, classText } from '../core/grade-class.js';
import { gradeTests, summarize, referenceVectors } from '../core/grade.js';
import { csvReport } from '../core/grade-report.js';
import { COUNTER_V, COUNTER_VHD, counterExercise, hdl } from './grade-fixtures.mjs';

const ex = counterExercise();
const vectors = { random: referenceVectors(ex, ex.tests[1]) };
const SUBS = { 'rui 10': hdl(COUNTER_V.replace("q + 4'd1", "q + 4'd2")), ana: hdl(COUNTER_V), 'rui 2': hdl(COUNTER_V.replace('else if (en) q', 'else q')), eva: hdl('module counter4('), joe: hdl(COUNTER_VHD, 'src/counter4.vhd') };
const results = [];
for (const [n, s] of Object.entries(SUBS)) results.push(summarize(ex, n, await gradeTests(ex, { ...s, files: new Map(Object.entries(s.files)) }, { vectors })));

test('#3864 the class\'s summary: each test\'s Accepted and its most frequent other verdict, the weakest first; the students by name; the mean', () => {
  const { results: read, exercise, problems } = parseResults(JSON.stringify(results, null, 2), 'grades.json');
  assert.deepEqual([problems, exercise, read.length], [[], 'counter4', 5]);
  const s = classSummary(read, ex);
  // (counted by hand: ana and joe right, rui 2 only the bench's, rui 10 none, eva a Compile Error)
  assert.deepEqual(s.tests.map(t => [t.id, t.title, t.visible, t.max, t.graded, t.accepted, t.rate, t.other, t.counts]), [
    ['count', 'Counting', true, 30, 5, 2, 0.4, 'WA', { WA: 2, AC: 2, CE: 1 }],
    ['random', 'random', false, 40, 5, 2, 0.4, 'WA', { WA: 2, AC: 2, CE: 1 }],
    ['bench', 'bench', false, 30, 5, 3, 0.6, 'WA', { WA: 1, AC: 3, CE: 1 }]]);
  assert.deepEqual(s.weakest.map(t => t.id), ['count', 'random', 'bench']);
  assert.deepEqual(s.students.map(x => [x.submission, x.points, x.max, x.verdict, x.tests.count.verdict, x.tests.bench.points]), [
    ['ana', 100, 100, 'AC', 'AC', 30], ['eva', 0, 100, 'CE', 'CE', 0], ['joe', 100, 100, 'AC', 'AC', 30], ['rui 2', 30, 100, 'WA', 'WA', 30], ['rui 10', 0, 100, 'WA', 'WA', 0]]);
  assert.deepEqual([s.count, s.accepted, s.mean, s.max], [5, 2, 46, 100]);
  // the CSV: --csv's
  assert.equal(classCsv(read, s), csvReport(results, ex));
  assert.equal(classText(s, '4-bit counter'), `4-bit counter: 5 student(s), 2 Accepted, mean 46 / 100 points
The tests, the weakest first:
  count (Counting): 2 / 5 Accepted (40%), most often WA Wrong Answer (2)
  random: 2 / 5 Accepted (40%), most often WA Wrong Answer (2) [hidden]
  bench: 3 / 5 Accepted (60%), most often WA Wrong Answer (1) [hidden]
The students:
  ana: 100 / 100 (AC) count=AC random=AC bench=AC
  eva: 0 / 100 (CE) count=CE random=CE bench=CE
  joe: 100 / 100 (AC) count=AC random=AC bench=AC
  rui 2: 30 / 100 (WA) count=WA random=WA bench=AC
  rui 10: 0 / 100 (WA) count=WA random=WA bench=WA
`);
});

test('#3864 the summary with no exercise: the tests as the results list them; a test some students lack; a test not run; the weakest\'s ties in order', () => {
  const r = (submission, tests) => ({ submission, exercise: 'x', points: tests.reduce((a, t) => a + t.points, 0), max: 20, verdict: tests.every(t => t.verdict === 'AC') ? 'AC' : 'WA', tests: tests.map(t => ({ max: 10, ...t })) });
  const s = classSummary([r('b', [{ id: 'one', verdict: 'AC', points: 10 }, { id: 'two', verdict: null, points: 0 }]), r('a', [{ id: 'one', verdict: 'TLE', points: 0 }])]);
  assert.deepEqual(s.tests.map(t => [t.id, t.graded, t.accepted, t.rate, t.other, t.counts]), [['one', 2, 1, 0.5, 'TLE', { AC: 1, TLE: 1 }], ['two', 1, 0, 0, '-', { '-': 1 }]]);
  assert.deepEqual(s.weakest.map(t => t.id), ['two', 'one']);
  assert.deepEqual(s.students.map(x => x.submission), ['a', 'b']);
  assert.equal(s.mean, 5);
  assert.match(classText(s), /^2 student\(s\), 0 Accepted, mean 5 \/ 20 points\n[^]*  two: 0 \/ 1 Accepted \(0%\), most often - not run \(1\) \[hidden\]\n/);
});

test('#3864 a results file checked: not JSON, not results, two exercises, a wrong verdict', () => {
  const bad = (text, m) => assert.deepEqual(parseResults(text, 'g.json').problems, [m]);
  bad('{', 'g.json: not JSON (Expected property name or \'}\' in JSON at position 1 (line 1 column 2))');
  bad('{"results": []}', 'g.json: not a list of results (silinx grade --json writes one)');
  bad('[]', 'g.json: no result');
  bad(JSON.stringify([{ ...results[0], submission: '' }]), 'g.json: result 1: "submission": a name');
  bad(JSON.stringify([{ ...results[0], points: -1 }]), 'g.json: result 1: "points" and "max": numbers from 0');
  bad(JSON.stringify([{ ...results[0], verdict: 'OK' }]), 'g.json: result 1: "verdict": one of AC, WA, CE, IE, NS, LI, TLE, MLE, RE, RL, GE');
  bad(JSON.stringify([{ ...results[0], tests: [{ id: 'x', verdict: '<b>', points: 0, max: 1 }] }]), 'g.json: result 1: test 1: { "id", "verdict", "points", "max" }');
  bad(JSON.stringify([results[0], { ...results[1], exercise: 'other' }]), 'g.json: the results of more than one exercise (counter4, other)');
  bad(JSON.stringify(Array(5001).fill(results[0])), 'g.json: more than 5000 results');
});
