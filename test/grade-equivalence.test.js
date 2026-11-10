// Automatic grading's equivalence tests (#3217, core/grade.js runEquivalence): the submission's top proved equivalent
// to the exercise's reference by Verify Equivalence (core/verify.js, Yosys's SAT), the two compiled apart (their modules
// have the same names). The format (a reference needed, the depth, never in the student's copy, the synthesis's
// limits); Accepted in Verilog and VHDL against a VHDL reference, and a drawing (the traffic example's state machine)
// against its HDL; Wrong Answer with the first differing cycle and the inputs that lead to it; no difference within the
// depth, not proved; Not Synthesizable (a design the check cannot translate); a Grading Error when Yosys fails or gives
// no result; not run without Yosys; in the grading process (server/grade.js), the hidden test's verdict only in the report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeTests, summarize } from '../core/grade.js';
import { exerciseProblems, visibleCopy, limitsOf, SYNTH_LIMITS } from '../core/grade-format.js';
import { exerciseUnitNames } from '../core/grade-design.js';
import { textReport } from '../core/grade-report.js';
import { gradeSubmission } from '../server/grade.js';
import { yosysNode } from '../packages/silinx-fpga/src/node.js';
import { COUNTER_V, COUNTER_VHD, counterExercise, hdl, trafficExercise, drawing } from './grade-fixtures.mjs';

const eq = (ex, extra = {}) => ({ ...ex, tests: [{ id: 'eq', points: 5, kind: 'equivalence', ...extra }] });
async function grade(ex, sub, yosys = yosysNode) {
  const r = summarize(ex, 'student', await gradeTests(ex, sub, { yosys, exerciseUnits: exerciseUnitNames(ex) }));
  return [r.tests[0].verdict, r.tests[0].messages];
}
const NO_ENABLE = COUNTER_V.replace('else if (en) q', 'else q');
const WRONG_FSM = drawing(m => ({ ...m, transitions: m.transitions.map((t, i) => (i === 0 ? { ...t, cond: 'req' } : t)) }));

test('#3217 the format: an equivalence test needs the reference, its depth from 1 to 1000; never in the student\'s copy; the synthesis\'s limits', () => {
  assert.deepEqual(exerciseProblems(eq(counterExercise(), { depth: 30 })), []);
  const { reference, ...noRef } = counterExercise();
  assert.deepEqual(exerciseProblems(eq(noRef, { depth: 0 })), ['the exercise: test 1: the exercise has no "reference"', 'the exercise: test 1: "depth": a whole number of clock cycles from 1 to 1000']);
  assert.deepEqual(exerciseProblems(eq(counterExercise(), { depth: 1.5 })), ['the exercise: test 1: "depth": a whole number of clock cycles from 1 to 1000']);
  const ex = counterExercise();
  ex.tests.push({ id: 'eq', visible: true, points: 5, kind: 'equivalence' });
  assert.deepEqual(visibleCopy(ex).tests.map(t => t.id), ['count']);
  assert.deepEqual(limitsOf(ex, ex.tests[3]), { ...limitsOf(ex), ...SYNTH_LIMITS });
});

test('#3217 Accepted: the counter in Verilog and in VHDL, the traffic state machine drawn, each proved equivalent to its reference', { timeout: 120000 }, async () => {
  const proved = n => ['AC', [`equivalent to the reference for every input sequence (proved by induction over ${n} clock cycle(s))`]];
  assert.deepEqual(await grade(eq(counterExercise()), hdl(COUNTER_V)), proved(1));
  assert.deepEqual(await grade(eq(counterExercise()), hdl(COUNTER_VHD, 'src/counter4.vhd')), proved(1));
  assert.deepEqual(await grade(eq(trafficExercise()), drawing()), proved(2));
});

test('#3217 Wrong Answer: the first cycle that differs, its outputs, the inputs that lead to it (the clock left out); a drawn state machine\'s', { timeout: 120000 }, async () => {
  assert.deepEqual(await grade(eq(counterExercise()), hdl(NO_ENABLE)), ['WA', ['cycle 2: q is 0001, expected 0000', 'the inputs, cycle by cycle: 1: rst=0 en=0; 2: rst=1 en=0']]);
  assert.deepEqual(await grade(eq(trafficExercise(), { depth: 5 }), WRONG_FSM),
    ['WA', ['cycle 2: phase is 110, expected 000', 'the inputs, cycle by cycle: 1: rst=0 req=1 done=0 night=0; 2: rst=0 req=0 done=0 night=0']]);
});

test('#3217 no difference within the depth, not proved: Accepted, said so; Not Synthesizable; a Grading Error from Yosys; not run without Yosys', { timeout: 120000 }, async () => {
  // (Yosys's log of a bounded check: no counterexample, no proof)
  const bounded = async (args, files, onLine) => { onLine('Reached maximum number of time steps -> proof failed.'); return {}; };
  assert.deepEqual(await grade(eq(counterExercise(), { depth: 7 }), hdl(COUNTER_V), bounded), ['AC', ['no difference from the reference in the first 7 clock cycle(s) (not proved beyond them)']]);
  assert.deepEqual(await grade(eq(counterExercise()), hdl(COUNTER_V.replace("else if (en) q <= q + 4'd1;", "else begin wait (en); q <= q + 4'd1; end"))),
    ['NS', ['\'counter4\' cannot be verified: \'wait\' cannot be synthesized here (only one clock edge or sensitivity list per process) (line 4)']]);
  assert.deepEqual(await grade(eq(counterExercise()), hdl(COUNTER_V), async () => { throw new Error('Yosys is not installed'); }), ['GE', ['the equivalence check could not run: Yosys is not installed']]);
  assert.deepEqual(await grade(eq(counterExercise()), hdl(COUNTER_V), async () => ({})), ['GE', ['the equivalence check could not run: Yosys gave no result (its log has neither a proof nor a counterexample)']]);
  assert.deepEqual(await grade(eq(counterExercise()), hdl(COUNTER_V), null), [null, ['the equivalence tests run where Yosys is (silinx grade, the server, the page)']]);
});

test('#3217 in the grading process: Accepted and Wrong Answer, the hidden test\'s verdict only in the report', { timeout: 300000 }, async () => {
  const ex = eq(counterExercise());
  const ok = await gradeSubmission(ex, { ...hdl(COUNTER_V), name: 'ok', files: Object.entries(hdl(COUNTER_V).files) });
  assert.deepEqual([ok.verdict, ok.tests[0].verdict, ok.tests[0].messages], ['AC', 'AC', ['equivalent to the reference for every input sequence (proved by induction over 1 clock cycle(s))']]);
  const wrong = await gradeSubmission(ex, { ...hdl(NO_ENABLE), name: 'wrong', files: Object.entries(hdl(NO_ENABLE).files) });
  assert.deepEqual([wrong.verdict, wrong.tests[0].messages], ['WA', ['cycle 2: q is 0001, expected 0000', 'the inputs, cycle by cycle: 1: rst=0 en=0; 2: rst=1 en=0']]);
  assert.equal(textReport(wrong), 'wrong: 0 / 5 points (Wrong Answer)\n  WARNING: "src/counter4.v" Line 1: Input <en> is never used.\n  - eq: WA Wrong Answer, 0 / 5 [hidden]\n');
});
