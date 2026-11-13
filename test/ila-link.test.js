// The logic analyzer's link to the board (#3176, core/ila-link.js): a capture run (arm, poll, read out) against the
// capture core's HDL itself, simulated in VHDL and Verilog (test/ila-lib.mjs hdlLink: the scans the PC sends, the words
// the core reads out): the commands as the protocol has them, the readout the model's window; and through the Digilent
// Adept USB over WebUSB (core/adept.js) to a simulated Basys2 and Nexys2 (test/fixtures/adept-sim.js: the FPGA's USER1
// register, the PROM in BYPASS) whose register is a model of the core: the samples, the polls the trigger takes, the
// errors (a capture that does not trigger, one not armed, a board with another core).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runCapture, adeptLink, USER1, captureLinkError } from '../core/ila-link.js';
import { CAPTURE_CMD } from '../core/ila-capture.js';
import { SimAdeptBoard } from './fixtures/adept-sim.js';
import { capSpec, cond, expectedCounts, probeOf, hdlLink, CoreModel, SAMPLES } from './ila-lib.mjs';

const fast = { pollMs: 0, sleep: async () => {} };

for (const lang of ['vhdl', 'verilog']) {
  test(`a capture run against the core's HDL (${lang}): armed, polled until complete, read out into the model's window`, async () => {
    const spec = capSpec({ lang, pre: 4, trigger: { combine: 'and', conditions: [cond('count', '=', 20)] } });
    const link = hdlLink(spec), log = [];
    const cap = await runCapture(link, spec, { ...fast, log: l => log.push(l) });
    // (arm and its status; a poll whose flags are still the arm's, the core's flags crossing on the scans' clocks; a
    // poll that reads the capture complete; the readout)
    const { status, arm, read, rewind } = CAPTURE_CMD;
    assert.deepEqual(link.sent, [arm, status, status, status, rewind, ...Array(16).fill(read), status]);
    assert.equal(cap.polls, 2);
    assert.deepEqual(cap.samples, expectedCounts(spec).map(c => probeOf(spec, c)));
    assert.equal(cap.trigger, 4);
    assert.deepEqual(log, ['Armed: 16 samples, 4 before the trigger.', 'Triggered (2 polls); reading 16 samples.']);
  });
}


for (const [board, opts] of [['Basys2', { fpga: 'xc3s250e', prom: 'xcf02s' }], ['Nexys2', { fpga: 'xc3s500e', prom: 'xcf04s', product: 'Nexys2' }]]) {
  test(`a capture over the Digilent Adept USB (WebUSB) of a simulated ${board}: USER1 selected, the PROM in BYPASS, the samples read back`, async () => {
    const spec = capSpec({ depth: 32, pre: 8 });
    const core = new CoreModel(spec, SAMPLES(spec), { fill: 4 });
    const sim = new SimAdeptBoard({ ...opts, user1: core });
    const log = [];
    const link = await adeptLink(sim, spec, { log: l => log.push(l) });
    try {
      assert.equal(sim.fpgaDev.ir, 0x09);   // (USER1 only at the first scan)
      const cap = await runCapture(link, spec, { ...fast, log: l => log.push(l) });
      assert.equal(sim.fpgaDev.ir, USER1);
      assert.deepEqual(cap.samples, SAMPLES(spec));
      assert.deepEqual(cap.probes.count.slice(0, 3), [100n, 101n, 102n]);
      assert.equal(cap.polls, 4);   // (the model complete 4 captures after the arm's)
      assert.deepEqual(log, [`Logic analyzer: Digilent ${board}, ${opts.fpga.toUpperCase()}'s USER1 register (18 bits).`, 'Armed: 32 samples, 8 before the trigger.',
        'Triggered (4 polls); reading 32 samples.']);
    } finally { await link.close(); }
    assert.equal(sim.claimed, false, 'the board released');
  });
}

test('a capture\'s errors: no trigger in the time given (the capture stays armed), not armed (no clock), another core on the board; arm: false waits again', async () => {
  const spec = capSpec({ depth: 16, pre: 2 });
  let t = 0;
  const clock = { pollMs: 100, now: () => t, sleep: async ms => { t += ms; } };
  const run = async (core, o = {}) => {
    const link = await adeptLink(new SimAdeptBoard({ user1: core }), spec);
    try { return await runCapture(link, spec, { ...clock, timeoutMs: 1000, ...o }); } finally { await link.close(); }
  };
  t = 0;
  await assert.rejects(run(new CoreModel(spec, SAMPLES(spec), { fill: Infinity })), { message: 'The trigger has not come in 1 s: the capture stays armed (run capture with arm: false to wait again).' });
  t = 0;
  await assert.rejects(run(new CoreModel(spec, SAMPLES(spec), { ack: false })), { message: 'The capture was not armed on the board in 1 s: is its clock running?' });
  await assert.rejects(run(new CoreModel(spec, SAMPLES(spec), { shape: { width: 12, depth: 64 } })),
    { message: 'The board\'s core is not this capture\'s: 12 bit(s) x 64 samples, not 9 x 16: Implement the design with its capture and program the board again.' });
  // (armed before, complete now: no arm, the readout)
  const armed = new CoreModel(spec, SAMPLES(spec), { fill: 2 });
  Object.assign(armed, { armT: 1, since: 0 });
  const cap = await run(armed, { arm: false });
  assert.deepEqual(cap.samples, SAMPLES(spec));
});

test('#3767 the boards the links read: the Spartan-3E\'s; a 7-series\' or Spartan-6\'s capture said to wait for their links (#3773)', () => {
  assert.equal(captureLinkError('spartan3e'), null);
  assert.equal(captureLinkError(undefined), null);
  for (const f of ['artix7', 'spartan6']) assert.equal(captureLinkError(f), 'reading a capture on the board: the Spartan-3E\'s boards only yet (Basys2, Nexys2: their Digilent Adept USB); the others\' JTAG links are to come (#3773)');
});
