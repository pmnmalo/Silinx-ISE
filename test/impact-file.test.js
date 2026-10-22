// Program FPGA's programming file (#1024, web/js/impact-file.js): its state from the implementation processes'
// (S.status), and the question asked when it is not up to date (implement the design first, then program it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { programFileState, implementFirstText } from '../web/js/impact-file.js';

test('programFileState: built and up to date, not built, older than the sources, failed, being built', () => {
  // built: Generate Programming File done (with warnings or not), the steps before it done
  assert.equal(programFileState({ synth: 'ok', translate: 'ok', map: 'ok', par: 'ok', bitgen: 'ok' }), 'ok');
  assert.equal(programFileState({ synth: 'warn', translate: 'ok', map: 'warn', par: 'warn', bitgen: 'warn' }), 'ok');
  // (ISE's reports of an older build: only the bitstream known)
  assert.equal(programFileState({ bitgen: 'ok' }), 'ok');
  // not built: nothing run, or the implementation stopped before Generate Programming File
  assert.equal(programFileState({}), 'none');
  assert.equal(programFileState(), 'none');
  assert.equal(programFileState({ synth: 'ok', translate: 'ok', map: 'ok', par: 'ok' }), 'none');
  assert.equal(programFileState({ synth: 'ok', bitgen: null }), 'none');
  // the sources changed since (every process marked out of date)
  assert.equal(programFileState({ synth: 'stale', translate: 'stale', map: 'stale', par: 'stale', bitgen: 'stale' }), 'stale');
  assert.equal(programFileState({ synth: 'stale', bitgen: 'ok' }), 'stale');
  // a step failed: the last implementation, whatever the file's state before
  assert.equal(programFileState({ synth: 'ok', translate: 'ok', map: 'ok', par: 'err' }), 'err');
  assert.equal(programFileState({ synth: 'err', bitgen: 'stale' }), 'err');
  // being built (before a failure or an out of date step)
  assert.equal(programFileState({ synth: 'ok', translate: 'running', bitgen: 'err' }), 'running');
  // the processes that are not Implement Top Module's (the open synthesis, the simulation models, Check Syntax)
  assert.equal(programFileState({ 'synth-open': 'err', check: 'err', postsynth: 'stale', bitgen: 'ok' }), 'ok');
});

test('implementFirstText: why, then the question; nothing to ask for a file up to date or being built', () => {
  const Q = 'Implement the design first? When it ends without errors, the FPGA is programmed.';
  assert.deepEqual(implementFirstText('none', 'top'), ["There is no programming file of 'top' yet.", Q]);
  assert.deepEqual(implementFirstText('stale', 'top'), ["The programming file of 'top' is older than the sources.", Q]);
  assert.deepEqual(implementFirstText('err', 'counter_top'), ["The last implementation of 'counter_top' failed.", Q]);
  assert.equal(implementFirstText('ok', 'top'), null);
  assert.equal(implementFirstText('running', 'top'), null);
});
