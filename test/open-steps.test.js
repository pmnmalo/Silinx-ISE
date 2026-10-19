// The steps of a run of the Silinx toolchain (core/open-steps.js, #404): one rule for the server's
// openSteps and the browser edition's browserSteps, which agree on every set of steps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui/core-hooks.js';
import { OPEN_STEPS, OPEN_CHAIN, orderOpenSteps } from '../core/open-steps.js';
import { openSteps, OPEN_STEPS as SERVER_STEPS } from '../server/open-flow.js';

const { browserSteps } = await import('../web/js/open-flow-browser.js');

test('server and browser: the same order for every set of the Silinx toolchain\'s steps', () => {
  assert.equal(SERVER_STEPS, OPEN_STEPS);
  let n = 0;
  for (let mask = 0; mask < 1 << OPEN_STEPS.length; mask++) {
    const steps = OPEN_STEPS.filter((_, i) => mask & (1 << i));
    for (const synthUpToDate of [false, true]) {
      const s = openSteps(steps, { synthUpToDate }), b = browserSteps(steps, { synthUpToDate });
      assert.deepEqual(b, s, `${steps.join(',')} synthUpToDate=${synthUpToDate}`);
      // every step asked for is run, once, in the order of OPEN_STEPS (the FPGA view last)
      for (const x of steps) assert.ok(s.includes(x), `${steps} -> ${s}: ${x}`);
      assert.equal(new Set(s).size, s.length);
      const rank = x => (x === 'fpgaview' ? 99 : OPEN_STEPS.indexOf(x));
      assert.deepEqual([...s].sort((p, q) => rank(p) - rank(q)), s, `${steps} -> ${s}`);
      // the chain without a gap, from the synthesis (from Translate when it is up to date and not asked
      // for); a step that needs the placement has Place & Route and its timing before it
      const chain = s.filter(x => OPEN_CHAIN.includes(x));
      const from = OPEN_CHAIN.indexOf(chain[0]);
      // (none: the post-synthesis model alone, from the netlist there)
      if (chain.length) assert.ok(from === 0 || (from === 1 && synthUpToDate && !steps.includes('synth')), `${steps} -> ${s}`);
      else assert.deepEqual(s, steps.length ? ['postsynth'] : OPEN_CHAIN);
      assert.deepEqual(chain, OPEN_CHAIN.slice(from, from + chain.length), `${steps} -> ${s}`);
      for (const x of ['pin2ucf', 'xpwr', 'fpgaview']) if (s.includes(x)) assert.ok(s.indexOf('trce') >= 0 && s.indexOf('trce') < s.indexOf(x), `${steps} -> ${s}`);
      if (s.includes('postsynth')) assert.ok(!s.includes('synth') || s.indexOf('synth') < s.indexOf('postsynth'), `${steps} -> ${s}`);
      // the post-translate and post-map models (#121): right after Translate and Map
      for (const [m, after] of [['posttrans', 'translate'], ['postmap', 'map']]) if (s.includes(m)) assert.equal(s[s.indexOf(m) - 1], after, `${steps} -> ${s}`);
      n++;
    }
  }
  assert.equal(n, 2 * 2 ** 13);
});

test('the order of a run: examples', () => {
  const full = ['synth', 'translate', 'map', 'par', 'trce', 'bitgen', 'prombit'];
  assert.deepEqual(orderOpenSteps([]), full);
  assert.deepEqual(orderOpenSteps(['map']), ['synth', 'translate', 'map']);
  assert.deepEqual(orderOpenSteps(['par']), ['synth', 'translate', 'map', 'par', 'trce']);
  assert.deepEqual(orderOpenSteps(['bitgen', 'pin2ucf', 'xpwr']), ['synth', 'translate', 'map', 'par', 'trce', 'pin2ucf', 'xpwr', 'bitgen', 'prombit']);
  assert.deepEqual(orderOpenSteps(['postsynth', 'fpgaview']), ['synth', 'postsynth', 'translate', 'map', 'par', 'trce', 'fpgaview']);
  // the post-translate and post-map models (#121): the chain to Translate / Map, each right after its step
  assert.deepEqual(orderOpenSteps(['posttrans']), ['synth', 'translate', 'posttrans']);
  assert.deepEqual(orderOpenSteps(['postmap']), ['synth', 'translate', 'map', 'postmap']);
  assert.deepEqual(orderOpenSteps(['postmap', 'posttrans', 'postsynth', 'bitgen']), ['synth', 'postsynth', 'translate', 'posttrans', 'map', 'postmap', 'par', 'trce', 'bitgen', 'prombit']);
  assert.deepEqual(orderOpenSteps(['postmap'], { synthUpToDate: true }), ['translate', 'map', 'postmap']);
  // the synthesis up to date, not asked for: from Translate on (#280); asked for: from it
  assert.deepEqual(orderOpenSteps(['bitgen'], { synthUpToDate: true }), full.slice(1));
  assert.deepEqual(orderOpenSteps(['synth', 'bitgen'], { synthUpToDate: true }), full);
  assert.deepEqual(orderOpenSteps(['postsynth'], { synthUpToDate: true }), ['postsynth']);   // (from the netlist there)
  // (before #404, counting the post-synthesis model as a chain step: no synthesis; and Map twice)
  assert.deepEqual(orderOpenSteps(['map', 'pin2ucf'], { synthUpToDate: true }), ['translate', 'map', 'par', 'trce', 'pin2ucf']);
});

test('each side names the steps its own way and says its own error', () => {
  // the browser's aliases (Implement Design), the server's (normalizeSteps)
  assert.deepEqual(browserSteps(['implement']), openSteps(['par']));
  assert.deepEqual(openSteps(['power']), browserSteps(['xpwr']));
  assert.throws(() => openSteps(['ngdanno']), /unknown step 'ngdanno'/);
  assert.throws(() => browserSteps(['ngdanno']), /^Error: not available in the Silinx toolchain \(they need Xilinx ISE, in the full application\): ngdanno$/);
});
