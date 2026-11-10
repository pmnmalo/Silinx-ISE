// Automatic grading (#3192), the core: the exercise's format and its problems (core/grade-format.js), the vectors, the
// student's copy, then every verdict on hand-written submissions in Verilog, in VHDL and as a drawing (the traffic
// example's state machine), graded in this process (core/grade.js gradeTests; server/grade.js's processes and limits
// are test/grade-server.test.js's), with the exact warnings of each; a reference test against the vectors it gives;
// the text report and the CSV.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeTests, summarize, referenceVectors, VERDICTS } from '../core/grade.js';
import { exerciseProblems, parseExercise, parseVectors, valueBits, visibleCopy, limitsOf, vectorsText, localize, withFileTexts, newExercise, exerciseFileOf, DEFAULT_LIMITS } from '../core/grade-format.js';
import { exerciseUnitNames, submissionSources } from '../core/grade-design.js';
import { runVectors, seededRandom, randomRows } from '../core/grade-sim.js';
import { textReport, csvReport } from '../core/grade-report.js';
import { compile, elaborate } from '../core/compile.js';
import { COUNTER_V, COUNTER_VHD, VECTORS, PORTS, counterExercise, hdl, trafficExercise, drawing } from './grade-fixtures.mjs';

async function grade(ex, sub, opts = {}) {
  const vectors = Object.fromEntries(ex.tests.filter(t => t.kind === 'reference').map(t => [t.id, referenceVectors(ex, t)]));
  for (const v of Object.values(vectors)) assert.deepEqual(v.problems, []);
  return summarize(ex, 'student', await gradeTests(ex, sub, { vectors, exerciseUnits: exerciseUnitNames(ex), ...opts }), opts);
}
const verdicts = r => Object.fromEntries(r.tests.map(t => [t.id, t.verdict]));
const messages = r => Object.fromEntries(r.tests.map(t => [t.id, t.messages]));

// ---------------------------------------------------------------- the format
test('#3192 the exercise: a right one has no problem; each kind of wrong one says what is wrong', () => {
  assert.deepEqual(exerciseProblems(counterExercise()), []);
  assert.deepEqual(exerciseProblems(trafficExercise()), []);
  assert.deepEqual(exerciseProblems([]), ['the exercise: not an exercise (a JSON object)']);
  // (wrong ports: the tests are not checked against them)
  const bad = counterExercise({ silinxExercise: 2, id: 'a b', top: '1x', allow: { languages: ['c'], drawings: ['xy'], primitives: 'no' }, limits: { seconds: 0, cpu: 1 },
    ports: [...PORTS, { name: 'q', dir: 'out', width: 4 }, { name: 'z', dir: 'up', width: 0 }] });
  assert.deepEqual(exerciseProblems(bad, 'e.exercise.json'), [
    'e.exercise.json: "silinxExercise": 1 expected',
    'e.exercise.json: "id": letters, digits, - and _ (at most 64)',
    'e.exercise.json: "top": the name of the module the submission makes',
    'e.exercise.json: port q: given twice',
    'e.exercise.json: port z: "dir": in, out or inout',
    'e.exercise.json: port z: "width": a whole number from 1 to 1024',
    'e.exercise.json: "allow.languages": a list of vhdl, verilog',
    'e.exercise.json: "allow.drawings": a list of sch, asm, fsm, tt, pn',
    'e.exercise.json: "allow.primitives": true or false',
    'e.exercise.json: "limits.seconds": a number from 0 to 600',
    'e.exercise.json: "limits": no limit \'cpu\' (simNs, steps, seconds, memoryMb)',
  ]);
  const tests = counterExercise();
  tests.tests = [{ id: 'count', kind: 'vectors', clock: 'nope', vectors: 'rst | q\n1 | 77\n' }, { id: 'count', kind: 'reference', cycles: 0 },
    { id: 't', kind: 'testbench', files: [] }, { id: 's', kind: 'synthesis', luts: -1, latches: 'no' }, { id: 'x', kind: 'what' }];
  assert.deepEqual(exerciseProblems(tests, 'e.exercise.json'), [
    'e.exercise.json: test 1: "clock": \'nope\' is not an input of counter4',
    'e.exercise.json: test 1: vectors line 2: \'77\' is not a value of q (4 bits)',
    'e.exercise.json: test 2: the id \'count\' is another test\'s',
    'e.exercise.json: test 2: "cycles": a whole number from 1 to 100000',
    'e.exercise.json: test 3: "top": the test bench\'s module',
    'e.exercise.json: test 3: "files": a list of { "path", "text" } (or { "path", "file" })',
    'e.exercise.json: test 4: "luts": a whole number from 0',
    'e.exercise.json: test 4: "latches": true or false',
    'e.exercise.json: test 5: "kind": one of vectors, reference, testbench, synthesis, check',
  ]);
  const checks = counterExercise();
  checks.tests = [{ id: 'c', kind: 'check' }, { id: 'd', kind: 'check', checks: [{ check: 'fly' }, { check: 'syntax', warnings: ['/[/'] }] }, { id: 't', kind: 'testbench', top: 'tb', files: [{ path: 'tb.v', text: '' }], done: '/(/' }];
  assert.deepEqual(exerciseProblems(checks, 'e.exercise.json'), [
    'e.exercise.json: test 1: "checks": a list of the guided labs\' checks (project, file, module, syntax, simulate)',
    'e.exercise.json: test 2: check 1: "check": one of project, file, module, syntax, simulate',
    'e.exercise.json: test 2: check 2 (syntax): "warnings": \'/[/\' is not a regular expression',
    'e.exercise.json: test 3: "done": a message the test bench prints at its end (a text, or "/regex/flags")',
  ]);
  assert.deepEqual(parseExercise('{', 'x.exercise.json').problems, ['x.exercise.json: not JSON (Expected property name or \'}\' in JSON at position 1 (line 1 column 2))']);
  assert.equal(parseExercise(JSON.stringify(counterExercise())).exercise.id, 'counter4');
  assert.equal(localize(counterExercise().title, 'pt'), 'Contador de 4 bits');
  assert.equal(localize(counterExercise().title, 'fr'), '4-bit counter');
});

test('#3192 the limits: the defaults, the exercise\'s, a test\'s own; a synthesis test\'s at least its own defaults', () => {
  const ex = counterExercise({ limits: { seconds: 3 } });
  assert.deepEqual(limitsOf(ex, ex.tests[0]), { ...DEFAULT_LIMITS, seconds: 3 });
  assert.deepEqual(limitsOf(ex, { kind: 'vectors', limits: { steps: 10 } }), { ...DEFAULT_LIMITS, seconds: 3, steps: 10 });
  assert.deepEqual(limitsOf(ex, { kind: 'synthesis' }), { ...DEFAULT_LIMITS, seconds: 120, memoryMb: 1024 });
  assert.deepEqual(limitsOf(ex, { kind: 'synthesis', limits: { seconds: 30 } }), { ...DEFAULT_LIMITS, seconds: 30, memoryMb: 1024 });
});

test('#3192 the vectors: values in binary, hex, decimal, don\'t care; each wrong line said', () => {
  assert.equal(valueBits('0101', 4), '0101');
  assert.equal(valueBits('0x3', 4), '0011');
  assert.equal(valueBits('0b11', 4), '0011');
  assert.equal(valueBits('10', 4), '1010');   // (not four binary digits: a decimal number)
  assert.equal(valueBits('-1', 4), '1111');
  assert.equal(valueBits('-', 3), '---');
  assert.equal(valueBits('1x-z', 4), '1X-Z');
  assert.equal(valueBits('16', 4), null);
  assert.equal(valueBits('0xg', 4), null);
  const v = parseVectors(VECTORS, PORTS, { clock: 'clk' });
  assert.deepEqual(v.problems, []);
  assert.deepEqual([v.inputs.map(p => p.name), v.outputs.map(p => p.name)], [['rst', 'en'], ['q']]);
  assert.deepEqual(v.rows.map(r => [r.line, ...r.in, ...r.out]), [[3, '1', '0', '0000'], [4, '0', '1', '0001'], [5, '0', '1', '0010'], [6, '0', '0', '0010'],
    [7, '0', '1', '0011'], [8, '1', '1', '0000'], [9, '0', '1', '0001']]);
  assert.equal(vectorsText(v.inputs, v.outputs, v.rows.slice(0, 2)), 'rst en | q\n1 0 | 0000\n0 1 | 0001\n');
  assert.deepEqual(parseVectors('', PORTS).problems, ['the vectors are empty']);
  assert.deepEqual(parseVectors('rst q\n1 0\n', PORTS).problems, ['vectors line 1: the inputs\' names, a \'|\', the outputs\' names']);
  assert.deepEqual(parseVectors('clk x q | rst\n1 1 | 0\n0 1 1 | 0 0\n', PORTS, { clock: 'clk' }).problems, [
    'vectors line 1: \'clk\' is the clock (the grader drives it)', 'vectors line 1: \'x\' is not a port', 'vectors line 1: \'q\' is an output',
    'vectors line 1: \'rst\' is an input', 'vectors line 1: no output to compare', 'vectors line 2: 0 input value(s), a \'|\', 0 output value(s)',
    'vectors line 3: 0 input value(s), a \'|\', 0 output value(s)']);
  assert.deepEqual(parseVectors('rst | q\n', PORTS).problems, ['the vectors have no row']);
});

test('#3192 the student\'s copy: no hidden test, no reference; the visible tests as they are', () => {
  const ex = counterExercise();
  const copy = visibleCopy(ex);
  assert.deepEqual(copy.tests, [ex.tests[0]]);
  assert.equal('reference' in copy, false);
  assert.doesNotMatch(JSON.stringify(copy), /tb_counter4|architecture rtl|"seed"/);
  assert.deepEqual(exerciseProblems(copy), []);
  // (a visible reference test needs the reference: not in the copy either)
  assert.deepEqual(visibleCopy(trafficExercise()).tests, []);
});

test('#3192 the files beside an exercise read (inside its folder only); a new exercise of a top', async () => {
  const files = { 'ex/tests/a.vec': 'rst en | q\n1 0 | 0\n', 'ex/ref/r.vhd': 'R', 'secret.v': 'S' };
  const read = async p => { if (!(p in files)) throw new Error('none'); return files[p]; };
  const ex = { ...counterExercise(), reference: { files: [{ path: 'ref/r.vhd', file: 'ref/r.vhd' }] } };
  ex.tests = [{ id: 'a', kind: 'vectors', clock: 'clk', file: 'tests/a.vec' }, { id: 'b', kind: 'testbench', top: 'tb', files: [{ path: 'tb.v', file: '../secret.v' }, { path: 'x.v', file: 'none.v' }] }];
  const r = await withFileTexts(ex, read, 'ex');
  assert.deepEqual(r.problems, ['../secret.v is not inside the exercise\'s folder', 'no file none.v beside the exercise']);
  assert.deepEqual([r.exercise.tests[0].vectors, 'file' in r.exercise.tests[0], r.exercise.reference.files[0].text], ['rst en | q\n1 0 | 0\n', false, 'R']);
  assert.deepEqual((await withFileTexts(ex, read, '')).problems.slice(0, 1), ['no file ref/r.vhd beside the exercise']);
  const n = newExercise({ top: 'Counter4', ports: PORTS });
  assert.deepEqual(exerciseProblems(n), ['the exercise: test 1: the vectors have no row']);
  assert.deepEqual([n.id, n.tests[0].clock, n.tests[0].vectors], ['counter4', 'clk', 'rst en | q\n']);
  assert.equal(exerciseFileOf('c', ['c.exercise.json', 'c-2.exercise.json']), 'c-3.exercise.json');
});

test('#3192 seeded random inputs: the same on every run, held and fixed inputs as given', () => {
  const a = seededRandom(7), b = seededRandom(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  const r = randomRows(PORTS, { clock: 'clk', cycles: 6, seed: 7, hold: { rst: ['1', '1'] }, fixed: { RST: '0' } }, valueBits);
  assert.deepEqual(r.inputs.map(p => p.name), ['rst', 'en']);
  assert.deepEqual(r.rows.map(x => x.in[0]), ['1', '1', '0', '0', '0', '0']);
  assert.ok(new Set(r.rows.map(x => x.in[1])).size === 2, 'en takes both values');
  assert.deepEqual(r, randomRows(PORTS, { clock: 'clk', cycles: 6, seed: 7, hold: { rst: ['1', '1'] }, fixed: { RST: '0' } }, valueBits));
});

// ---------------------------------------------------------------- the verdicts
test('#3192 Accepted: the counter in Verilog and in VHDL, every test, no warning', async () => {
  for (const sub of [hdl(COUNTER_V), hdl(COUNTER_VHD, 'src/counter4.vhd')]) {
    const r = await grade(counterExercise(), sub);
    assert.deepEqual([r.verdict, r.verdictName, r.points, r.max], ['AC', 'Accepted', 100, 100]);
    assert.deepEqual(verdicts(r), { count: 'AC', random: 'AC', bench: 'AC' });
    assert.deepEqual(r.design, { verdict: null, messages: [], warnings: [] });
    assert.deepEqual(messages(r), { count: [], random: [], bench: [] });
  }
});

test('#3192 Accepted: the traffic example\'s state machine as a drawing, its HDL made again from it (a stale file ignored)', async () => {
  const r = await grade(trafficExercise(), drawing());
  assert.deepEqual([r.verdict, r.points, r.design], ['AC', 10, { verdict: null, messages: [], warnings: [] }]);
  const s = submissionSources(drawing());
  assert.deepEqual(s.sources.map(x => [x.path, x.lang, x.drawing]), [['src/traffic.vhd', 'vhdl', 'src/traffic.fsm.json']]);
  assert.match(s.sources[0].text, /entity traffic is/);
  assert.deepEqual([...s.used.drawings], ['fsm']);
});

test('#3192 Wrong Answer: the first difference (its cycle, signal, expected and obtained, the rows around it); a test bench\'s assertion', async () => {
  const r = await grade(counterExercise(), hdl(COUNTER_V.replace('else if (en) q', 'else q')));
  assert.deepEqual([r.verdict, r.points], ['WA', 30]);
  assert.deepEqual(verdicts(r), { count: 'WA', random: 'WA', bench: 'AC' });
  assert.deepEqual(r.design.warnings, ['"src/counter4.v" Line 1: Input <en> is never used.']);
  assert.deepEqual(r.tests[0].messages, ['cycle 3 (vectors line 6): q is 0011, expected 0010']);
  const d = r.tests[0].detail;
  assert.deepEqual([d.cycle, d.line, d.signal, d.expected, d.obtained], [3, 6, 'q', '0010', '0011']);
  assert.deepEqual(d.window.rows.map(x => [x.cycle, x.in.join(''), x.expected[0], x.obtained[0]]), [[0, '10', '0000', '0000'], [1, '01', '0001', '0001'], [2, '01', '0010', '0010'], [3, '00', '0010', '0011'], [4, '01', '0011', '0100']]);
  assert.deepEqual(r.tests[1].messages, ['cycle 3 (vectors line 4): q is 0001, expected 0000']);
  // counting by two: the test bench's $error is its Wrong Answer
  const two = await grade(counterExercise(), hdl(COUNTER_V.replace("q + 4'd1", "q + 4'd2")));
  assert.deepEqual(verdicts(two), { count: 'WA', random: 'WA', bench: 'WA' });
  assert.deepEqual(two.tests[2].messages, ['after ten counts q is 4 at 112 ns (tb/tb_counter4.v line 9)']);
  assert.deepEqual(two.design.warnings, []);
});

test('#3192 Wrong Answer: the state machine drawn with a wrong transition', async () => {
  const r = await grade(trafficExercise(), drawing(m => ({ ...m, transitions: m.transitions.map((t, i) => (i === 0 ? { ...t, cond: 'req' } : t)) })));
  assert.deepEqual([r.verdict, r.tests[0].messages, r.design.warnings], ['WA', ['cycle 6 (vectors line 7): phase is 000, expected 110'], []]);
});

test('#3192 Wrong Answer: a design that stops the simulation ($finish) before the test bench\'s end, or before the vectors\' last row', async () => {
  const r = await grade(counterExercise(), hdl(COUNTER_V.replace("else if (en) q <= q + 4'd1;", "else if (en) begin q <= q + 4'd1; if (q == 4'd2) $finish; end")));
  assert.deepEqual(verdicts(r), { count: 'WA', random: 'WA', bench: 'WA' });
  assert.deepEqual(messages(r), { count: ['the design stopped the simulation at 90 ns, before cycle 4'], random: ['the design stopped the simulation at 310 ns, before cycle 15'],
    bench: ['the design stopped the simulation at 35 ns (src/counter4.v line 2)'] });
  // (a test bench that never prints its end: its Wrong Answer)
  const ex = counterExercise();
  ex.tests[2] = { ...ex.tests[2], done: 'ALL GOOD' };
  assert.deepEqual((await grade(ex, hdl(COUNTER_V))).tests[2].messages, ['the test bench did not reach its end (\'ALL GOOD\') in 1000000 ns']);
});

test('#3192 Compile Error: a syntax error in Verilog, in VHDL, a drawing with errors, a file silinx.json lists but is not there; every test\'s', async () => {
  const v = await grade(counterExercise(), hdl(COUNTER_V.replace("q + 4'd1", 'q +')));
  assert.deepEqual([v.verdict, v.points, v.design], ['CE', 0, { verdict: 'CE', messages: ['"src/counter4.v" Line 4: unexpected \';\' in expression'], warnings: [] }]);
  assert.deepEqual(verdicts(v), { count: 'CE', random: 'CE', bench: 'CE' });
  const vhd = await grade(counterExercise(), hdl(COUNTER_VHD.replace('c <= c + 1;', 'c <= c + ;'), 'src/counter4.vhd'));
  assert.equal(vhd.design.verdict, 'CE');
  assert.equal(vhd.design.messages.length, 1);
  assert.match(vhd.design.messages[0], /^"src\/counter4\.vhd" Line 15: /);
  const d = await grade(trafficExercise(), drawing(m => ({ ...m, transitions: m.transitions.map((t, i) => (i === 0 ? { ...t, to: 'nowhere' } : t)) })));
  assert.deepEqual(d.design.messages, ['src/traffic.fsm.json: A transition starts or ends at a state that does not exist']);
  const gone = await grade(counterExercise(), { project: { files: [{ path: 'src/c.v', lang: 'verilog' }] }, files: {} });
  assert.deepEqual(gone.design.messages, ['src/c.v: the file is not in the submission']);
  const none = await grade(counterExercise(), { project: { files: [] }, files: {} });
  assert.deepEqual(none.design.messages, ['the submission has no HDL source and no drawing']);
  // (the test benches of the submission are not graded: a broken one does not matter)
  const tb = hdl(COUNTER_V, 'src/counter4.v', { project: { files: [{ path: 'src/counter4.v', lang: 'verilog' }, { path: 'sim/tb.v', lang: 'verilog', role: 'sim' }] }, files: { 'sim/tb.v': 'module broken(' } });
  assert.equal((await grade(counterExercise(), tb)).verdict, 'AC');
});

test('#3192 Interface Error: ports not as the statement says, no such module, what the exercise does not allow, a name of the exercise\'s own', async () => {
  const ie = async (ex, sub) => { const r = await grade(ex, sub); assert.deepEqual(verdicts(r), Object.fromEntries(ex.tests.map(t => [t.id, 'IE']))); return r.design.messages; };
  const ex = counterExercise();
  assert.deepEqual(await ie(ex, hdl(COUNTER_V.replace('[3:0] q', '[4:0] q'))), ['port q of counter4 is 5 bits wide, not 4']);
  assert.deepEqual(await ie(ex, hdl(COUNTER_V.replace('input en,', 'input enable,').replace('(en)', '(enable)'))), ['counter4 has no port en', 'counter4 has a port enable the statement does not have']);
  assert.deepEqual(await ie(ex, hdl(COUNTER_V.replace('input rst', 'output rst').replace('if (rst)', 'if (en)'))), ['port rst of counter4 is an output, not an input']);
  assert.deepEqual(await ie(ex, hdl(COUNTER_V.replace('counter4(', 'counter(')), 'src/counter.v'), ['the submission has no module counter4']);
  assert.deepEqual(await ie({ ...ex, allow: { languages: ['vhdl'] } }, hdl(COUNTER_V)), ['Verilog is not allowed in this exercise']);
  assert.deepEqual(await ie(trafficExercise({ allow: { drawings: ['asm'] } }), drawing()), ['a drawing of kind \'fsm\' is not allowed in this exercise']);
  assert.deepEqual(await ie({ ...ex, allow: { primitives: false } }, hdl(COUNTER_V.replace('endmodule', '  wire t;\n  BUF b0(.I(clk), .O(t));\nendmodule'))), ['the FPGA\'s primitives (UNISIM) are not allowed in this exercise']);
  // (a module of the test bench's name would replace it: refused)
  assert.deepEqual(await ie(ex, hdl(`${COUNTER_V}module tb_counter4;\n  initial $display("TB DONE");\nendmodule\n`)), ['the submission defines tb_counter4, a name of the exercise\'s own']);
  assert.deepEqual([...exerciseUnitNames(ex)], ['tb_counter4']);
});

test('#3192 Time Limit Exceeded: the step limit, the delta cycle limit (a combinational loop)', async () => {
  const loop = await grade(counterExercise(), hdl(`module counter4(input clk, input rst, input en, output reg [3:0] q);
  initial q = 4'd0;
  always @(q or en) if (en) q <= ~q;
endmodule
`));
  assert.deepEqual(verdicts(loop), { count: 'TLE', random: 'TLE', bench: 'TLE' });
  assert.deepEqual(loop.tests[0].messages, ['delta cycle limit (10000) exceeded at 20 ns: combinational loop? (the delta cycle limit)']);
  assert.deepEqual(loop.design.warnings, ['"src/counter4.v" Line 3: Found 4-bit latch for signal <q>. Latches may be generated from incomplete case or if statements.',
    '"src/counter4.v" Line 1: Input <clk> is never used.', '"src/counter4.v" Line 1: Input <rst> is never used.',
    '"src/counter4.v" Line 3: Non-blocking assignment (<=) to <q> in a combinational always block; use a blocking assignment (=).']);
  const ex = counterExercise();
  ex.tests = ex.tests.map(t => (t.kind === 'reference' ? t : { ...t, limits: { steps: 20 } }));
  const slow = await grade(ex, hdl(COUNTER_V));
  assert.deepEqual(verdicts(slow), { count: 'TLE', random: 'AC', bench: 'TLE' });
  assert.deepEqual(messages(slow), { count: ['the simulation took more than 20 steps (at 130 ns)'], random: [], bench: ['the simulation took more than 20 steps (at 95 ns)'] });
});

test('#3192 Runtime Error: the design\'s own error stops the simulation', async () => {
  const r = await grade(counterExercise(), hdl(COUNTER_V.replace("else if (en) q <= q + 4'd1;", "else if (en) begin q <= q + 4'd1; if (q == 4'd2) $fatal(1, \"two\"); end")));
  assert.deepEqual(verdicts(r), { count: 'RE', random: 'RE', bench: 'RE' });
  assert.deepEqual(messages(r), { count: ['two at 90 ns (src/counter4.v line 4)'], random: ['two at 310 ns (src/counter4.v line 4)'], bench: ['two at 35 ns (src/counter4.v line 4)'] });
});

test('#3192 the reference: its rows are the vectors the hand-written ones are, the submission compared with them; an X of it not compared', async () => {
  const ex = counterExercise();
  const ref = referenceVectors(ex, ex.tests[1]);
  assert.deepEqual(ref.problems, []);
  assert.equal(ref.rows.length, 60);
  // the reference's rows, given as a vectors test, grade as the reference test does
  const asVectors = { ...ex, tests: [{ id: 'v', kind: 'vectors', clock: 'clk', vectors: vectorsText(ref.inputs, ref.outputs, ref.rows) }] };
  assert.deepEqual(exerciseProblems(asVectors), []);
  for (const [text, want] of [[COUNTER_V, 'AC'], [COUNTER_V.replace('else if (en) q', 'else q'), 'WA']]) {
    assert.equal((await grade(asVectors, hdl(text))).verdict, want);
    assert.equal((await grade(ex, hdl(text))).tests[1].verdict, want);
  }
  // a reference with no reset of its counter: its outputs X until... never known: none compared, Accepted
  const lib = compile([{ path: 'c.v', text: COUNTER_V }]);
  const noReset = { inputs: ref.inputs, outputs: ref.outputs, rows: ref.rows.map(r => ({ ...r, out: ['----'] })) };
  assert.equal(runVectors(elaborate(lib, 'counter4'), noReset, { clock: 'clk', periodNs: 20, limits: DEFAULT_LIMITS }).verdict, 'AC');
  const broken = counterExercise({ reference: { files: [{ path: 'ref/c.v', text: 'module counter4(input clk); endmodule' }] } });
  assert.deepEqual(referenceVectors(broken, broken.tests[1]).problems, ['the reference: counter4 has no port rst', 'the reference: counter4 has no port en', 'the reference: counter4 has no port q']);
  const wrong = counterExercise({ reference: { files: [{ path: 'ref/c.v', text: 'module counter4(input clk, input rst, input en, output [3:0] q);\n  assign q = x;\nendmodule\n' }] } });
  assert.deepEqual(referenceVectors(wrong, wrong.tests[1]).problems, ['the reference: "ref/c.v" Line 2: \'x\' is not declared']);
});

test('#3192 a check test: the guided labs\' checks on the submission (#3179), its reasons a Wrong Answer', async () => {
  const ex = counterExercise();
  ex.tests = [{ id: 'lab', visible: true, points: 5, kind: 'check', checks: [{ check: 'syntax' }, { check: 'module', name: 'counter4', ports: [{ name: 'q', dir: 'out', width: 4 }] }, { check: 'file', path: 'src/counter4.v', contains: ['/posedge clk/'] }] }];
  assert.deepEqual(exerciseProblems(ex), []);
  const ok = await grade(ex, hdl(COUNTER_V));
  assert.deepEqual([ok.verdict, ok.points, ok.tests[0].messages], ['AC', 5, []]);
  const wrong = await grade(ex, hdl(COUNTER_V.replace('else if (en) q', 'else q').replace('posedge clk', 'negedge clk')));
  assert.deepEqual([wrong.verdict, wrong.tests[0].messages], ['WA', ['a warning of Check Syntax: "src/counter4.v" Line 1: Input <en> is never used.', 'src/counter4.v has nothing like \'/posedge clk/\'']]);
  // (the drawing's HDL, made again from it, is what the checks read)
  const fsm = trafficExercise();
  fsm.tests = [{ id: 'lab', points: 1, kind: 'check', checks: [{ check: 'syntax', top: 'traffic' }] }];
  assert.equal((await grade(fsm, drawing())).verdict, 'AC');
});

test('#3192 Grading Error: a synthesis the grader cannot run (a read Node\'s permission model refuses: its path said), never no verdict', async () => {
  const ex = counterExercise();
  ex.tests = [{ id: 'impl', points: 1, kind: 'synthesis', latches: false }];
  const synthesize = async () => { throw Object.assign(new Error('Access to this API has been restricted'), { code: 'ERR_ACCESS_DENIED', permission: 'FileSystemRead', resource: '/tmp/x' }); };
  const r = await grade(ex, hdl(COUNTER_V), { synthesize });
  assert.deepEqual([r.verdict, r.verdictName, r.tests[0].messages], ['GE', 'Grading Error', ['the synthesis could not run: Access to this API has been restricted (FileSystemRead /tmp/x)']]);
});

test('#3215 a synthesis test\'s slices not checked (no chip database): the other limits\' verdict, said why', async () => {
  const ex = counterExercise();
  ex.tests = [{ id: 'impl', points: 1, kind: 'synthesis', luts: 4, ffs: 4, slices: 2 }];
  const why = 'the slices are not checked here: nextpnr\'s chip database of xc3s250e is not in this installation and could not be downloaded (fetch failed)';
  const synthesize = async () => ({ errors: [], warnings: [], latches: 0, luts: 0, ffs: 4, slices: null, notes: [why] });
  const ok = await grade(ex, hdl(COUNTER_V), { synthesize });
  assert.deepEqual([ok.verdict, ok.tests[0].messages, ok.tests[0].used], ['AC', [why], { luts: 0, ffs: 4, slices: null, latches: 0 }]);
  const over = await grade(ex, hdl(COUNTER_V), { synthesize: async () => ({ ...(await synthesize()), ffs: 8 }) });
  assert.deepEqual([over.verdict, over.tests[0].messages], ['RL', ['8 flip-flops, at most 4', why]]);
});

test('#3192 --visible: the visible tests only, the maximum theirs', async () => {
  const r = await grade(counterExercise(), hdl(COUNTER_V), { visible: true });
  assert.deepEqual([r.visible, r.points, r.max, r.tests.map(t => t.id)], [true, 30, 30, ['count']]);
});

test('#3192 the text report: the total, a line per test, a visible test\'s first difference, a hidden test\'s verdict only', async () => {
  const r = await grade(counterExercise(), hdl(COUNTER_V.replace('else if (en) q', 'else q')));
  assert.equal(textReport(r), [
    'student: 30 / 100 points (Wrong Answer)',
    '  WARNING: "src/counter4.v" Line 1: Input <en> is never used.',
    '  - count (Counting): WA Wrong Answer, 0 / 30',
    '      cycle 3 (vectors line 6): q is 0011, expected 0010',
    '      cycle  rst  en  q (expected / obtained)',
    '          0  1  0  0000 / 0000',
    '          1  0  1  0001 / 0001',
    '          2  0  1  0010 / 0010',
    '          3  0  0  0010 / 0011 <',
    '          4  0  1  0011 / 0100 <',
    '  - random: WA Wrong Answer, 0 / 40 [hidden]',
    '  + bench: AC Accepted, 30 / 30 [hidden]',
    '',
  ].join('\n'));
  const ce = await grade(counterExercise(), hdl('module counter4(;'));
  assert.equal(textReport(ce).split('\n').slice(0, 3).join('\n'), 'student: 0 / 100 points (Compile Error)\n  Compile Error:\n    "src/counter4.v" Line 1: expected identifier but found \';\'');
});

test('#3192 the CSV: a row per submission, each test\'s verdict and points; a cell that would be a formula quoted', async () => {
  const ex = counterExercise();
  const a = await grade(ex, hdl(COUNTER_V)), b = await grade(ex, hdl(COUNTER_V.replace('else if (en) q', 'else q')));
  b.submission = '=HYPERLINK("x")';
  assert.equal(csvReport([a, b], ex), [
    'submission,points,max,verdict,count,count points,random,random points,bench,bench points',
    'student,100,100,AC,AC,30,AC,40,AC,30',
    '"\'=HYPERLINK(""x"")",30,100,WA,WA,0,WA,0,AC,30',
    '',
  ].join('\n'));
  assert.deepEqual(Object.keys(VERDICTS), ['AC', 'WA', 'CE', 'IE', 'NS', 'LI', 'TLE', 'MLE', 'RE', 'RL', 'GE']);
});
