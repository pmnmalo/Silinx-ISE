// The formal checks' time limit (#3261, core/verify-limit.js): Yosys's run stopped when the limit passes (its signal
// aborted), the clock cycles its log shows checked by then, the verdict 'timeout' of Verify Equivalence, Verify Assertions
// and Verify Property, and their messages: a warning when some cycles were checked, an error when none was; a limit out
// of range refused. Yosys stands in here (a run that never ends, its lines given); blinky's ASM chart stopped in the real
// Yosys (a worker thread terminated) in test/verify-props.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runLimited, cyclesChecked, timeLimitError, VERIFY_TIME_LIMIT, MAX_TIME_LIMIT } from '../core/verify-limit.js';
import { verifyEquivalence, verifyMessages, VERIFY_TIME_LIMIT as FROM_VERIFY } from '../core/verify.js';
import { verifyAssertions, assertMessages } from '../core/verify-assert.js';
import { verifyProperty, propertyMessages } from '../core/verify-props.js';

// a Yosys that writes its lines and never ends but when stopped (its signal: stops.length counts them)
const stops = [];
const hanging = (lines = []) => (args, files, onLine, _p, { signal } = {}) => new Promise((resolve, reject) => {
  lines.forEach(onLine);
  signal?.addEventListener('abort', () => { stops.push(args); reject(Object.assign(new Error('Yosys was stopped'), { aborted: true })); });
});
const LOG = ['** Trying induction with length 1 **', '[base case 1] Solving problem with 10 variables and 20 clauses..', '[induction step 1] Solving problem with 30 variables and 40 clauses..',
  'Induction step failed. Incrementing number of time steps.', '** Trying induction with length 2 **', '[base case 2] Solving problem with 50 variables and 60 clauses..',
  '[induction step 2] Solving problem with 70 variables and 80 clauses..', '** Trying induction with length 3 **', '[base case 3] Solving problem with 90 variables and 99 clauses..'];
const msgs = M => M.map(x => [x.kind, x.text.trim()]).filter(([, t]) => t);

const CNT = (name, step) => ({ path: `src/${name}.v`, lang: 'verilog', text: `module ${name}(input clk, input en, output reg [3:0] q);
  initial q = 0;
  always @(posedge clk) if (en) q <= q + ${step};
  always @(posedge clk) assert (q != 4'd9);
endmodule
` });

test('the cycles checked: the last base case solved (its induction step follows it)', () => {
  assert.equal(cyclesChecked([]), 0);
  assert.equal(cyclesChecked(LOG.slice(0, 2)), 0, 'base case 1 still solving');
  assert.equal(cyclesChecked(LOG.slice(0, 3)), 1);
  assert.equal(cyclesChecked(LOG.slice(0, 5)), 1, 'length 2 tried: 1 checked');
  assert.equal(cyclesChecked(LOG), 2);
});

test('runLimited: a run that finishes in time (its result), one stopped (its signal aborted), one that ignores the signal, an error', async () => {
  assert.equal(await runLimited(async () => ({ out: 1 }), [], {}, () => {}, 1), null);
  stops.length = 0;
  const t0 = Date.now();
  assert.deepEqual(await runLimited(hanging(), ['x'], {}, () => {}, 0.05), { timedOut: true });
  assert.ok(Date.now() - t0 < 1000);
  assert.deepEqual(stops, [['x']]);
  assert.deepEqual(await runLimited(() => new Promise(() => {}), [], {}, () => {}, 0.05), { timedOut: true });
  await assert.rejects(runLimited(async () => { throw new Error('Yosys failed (exit code 1)'); }, [], {}, () => {}, 1), /exit code 1/);
});

test('the limit: 60 s by default, from 1 to 3600 s', () => {
  assert.deepEqual([VERIFY_TIME_LIMIT, FROM_VERIFY, MAX_TIME_LIMIT], [60, 60, 3600]);
  assert.equal(timeLimitError(10), null);
  for (const bad of [0, -1, 3601, '10', NaN]) assert.equal(timeLimitError(bad), 'the time limit must be a number of seconds, more than 0 and at most 3600', String(bad));
});

test('Verify Equivalence and Verify Assertions stopped: timeout, the cycles checked, a warning (an error when none was)', async () => {
  const srcs = [CNT('cnt', 1), CNT('cnt_ref', 1)];
  const e = await verifyEquivalence(srcs, { top: 'cnt', reference: 'cnt_ref', timeLimit: 0.2, run: hanging(LOG) });
  assert.deepEqual([e.status, e.checked, e.timeLimit, e.errors], ['timeout', 2, 0.2, []]);
  assert.deepEqual(msgs(verifyMessages(e)).slice(2), [
    ['warn', 'WARNING:Verify - the check did not finish in 0.2 s (its time limit): no difference in the first 2 clock cycle(s), not checked beyond them: a larger time limit, or a smaller depth.'],
    ['ok', 'Process "Verify Equivalence" completed successfully with 1 warning(s)'],
  ]);
  const a = await verifyAssertions([CNT('cnt', 1)], { top: 'cnt', timeLimit: 0.2, run: hanging(LOG.slice(0, 3)) });
  assert.deepEqual([a.status, a.checked], ['timeout', 1]);
  assert.deepEqual(msgs(assertMessages(a)).slice(2), [
    ['warn', 'WARNING:Verify - the check did not finish in 0.2 s (its time limit): no assertion fails in the first 1 clock cycle(s), not checked beyond them: a larger time limit, or a smaller depth.'],
    ['ok', 'Process "Verify Assertions" completed successfully with 1 warning(s)'],
  ]);
  const z = await verifyAssertions([CNT('cnt', 1)], { top: 'cnt', timeLimit: 0.2, run: hanging() });
  assert.deepEqual(msgs(assertMessages(z)).slice(2), [
    ['err', 'ERROR:Verify - the check did not finish in 0.2 s (its time limit): no clock cycle checked; a larger time limit, or a smaller depth.'],
    ['err', 'Process "Verify Assertions" failed'],
  ]);
  const bad = await verifyEquivalence(srcs, { top: 'cnt', reference: 'cnt_ref', timeLimit: 0, run: hanging() });
  assert.deepEqual(msgs(verifyMessages(bad)), [['hdr', 'Started : "Verify Equivalence".'], ['err', 'ERROR:Verify - the time limit must be a number of seconds, more than 0 and at most 3600'], ['err', 'Process "Verify Equivalence" failed']]);
});

test('Verify Property stopped: what the cycles checked show (never, reach, exclusive)', async () => {
  const m = { version: 1, kind: 'fsm', name: 'xy', lang: 'verilog', clock: 'clk', reset: { name: 'rst', active: 'high', sync: true }, encoding: 'binary', style: '3process',
    inputs: [{ name: 'go', width: 1 }], outputs: [{ name: 'x', width: 1, default: '0' }, { name: 'y', width: 1, default: '0' }],
    states: [{ id: 's1', name: 'A', x: 0, y: 0, outputs: { x: '1' } }, { id: 's2', name: 'B', x: 200, y: 0, outputs: { y: '1' } }],
    transitions: [{ id: 't1', from: 's1', to: 's2', cond: 'go' }, { id: 't2', from: 's2', to: 's1', cond: '' }], initial: 's1' };
  const said = async property => {
    const r = await verifyProperty([], { drawing: m, property, timeLimit: 0.2, run: hanging(LOG) });
    assert.deepEqual([r.status, r.holds, r.checked], ['timeout', false, 2]);
    return msgs(propertyMessages(r)).slice(2);
  };
  const tail = what => [['warn', `WARNING:Verify - the check did not finish in 0.2 s (its time limit): ${what} in the first 2 clock cycle(s), not checked beyond them: a larger time limit, or a smaller depth.`],
    ['ok', 'Process "Verify Property" completed successfully with 1 warning(s)']];
  assert.deepEqual(await said({ kind: 'never', state: 'B' }), tail('\'xy\' never reaches state B'));
  assert.deepEqual(await said({ kind: 'reach', state: 'B' }), tail('\'xy\' does not reach state B'));
  assert.deepEqual(await said({ kind: 'exclusive', outputs: ['x', 'y'] }), tail('\'xy\' never has x and y both 1'));
});
