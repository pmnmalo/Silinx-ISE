// The 7-series' best of 3 seeds (#3825): Process Properties' option (impl.xc7Seeds, the family's profile), nextpnr placing and
// routing with seeds 1, 2 and 3, the best Fmax kept (a tie: the lowest seed; a failed seed left out; all failed: the first's
// error, as one seed's), the seeds in the reports and the timing report; only the kept run's warnings; apart and at once
// where nextpnr's io runs apart (the local server's), else one after another (the browser's worker). The back end mounted
// alone on a fake nextpnr.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XC7, xc7BestRun, xc7SeedsOfRuns, xc7SeedsLine, xc7TimingText } from '../packages/silinx-fpga/src/open-flow-xc7.js';
import { xc7SeedsOf } from '../packages/silinx-fpga/src/parts.js';
import { xc7Parallel } from '../packages/silinx-fpga/src/nextpnr-xc7-node.js';
import { StepError } from '../packages/silinx-fpga/src/open-flow-core.js';
import { familyProfile } from '../core/family-profile.js';

test('xc7BestRun: the best Fmax; a tie to the lowest seed; a failed run left out; none when all failed', () => {
  const r = (seed, fmax) => ({ seed, fmax });
  assert.equal(xc7BestRun([r(1, 240.1), r(2, 251.3), r(3, 230)]).seed, 2);
  assert.equal(xc7BestRun([r(1, 240), r(2, 250), r(3, 250)]).seed, 2);
  assert.equal(xc7BestRun([r(3, 250), r(2, 250), r(1, 250)]).seed, 1);   // (whatever the order)
  assert.equal(xc7BestRun([r(1, null), r(2, null), r(3, null)]).seed, 1);   // (no clock: all equal)
  assert.equal(xc7BestRun([{ seed: 1, error: new Error('x') }, r(2, 200), r(3, 210)]).seed, 3);
  assert.equal(xc7BestRun([{ seed: 1, error: new Error('x') }, { seed: 2, error: new Error('y') }, r(3, 90)]).seed, 3);
  assert.equal(xc7BestRun([{ seed: 1, error: new Error('x') }, { seed: 2, error: new Error('y') }]), null);
  assert.equal(xc7BestRun([r(1, 100)]).seed, 1);
});

test('the seeds\' reports and the timing report\'s sentence: the seed kept, the others\' Fmax, a failed one said', () => {
  const runs = [{ seed: 1, fmax: 240.1 }, { seed: 2, fmax: 251.3 }, { seed: 3, error: new Error('x') }];
  const seeds = xc7SeedsOfRuns(runs, runs[1]);
  assert.deepEqual(seeds, [{ seed: 1, fmaxMHz: 240.1 }, { seed: 2, fmaxMHz: 251.3, kept: true }, { seed: 3, fmaxMHz: null, failed: true }]);
  assert.equal(xc7SeedsLine(seeds), 'Best of 3 seeds (nextpnr\'s estimate of the slowest clock): seed 2 kept (251.3 MHz); seed 1: 240.1 MHz, seed 3: nextpnr failed.');
  assert.equal(xc7SeedsLine([{ seed: 1, fmaxMHz: null, kept: true }, { seed: 2, fmaxMHz: null }, { seed: 3, fmaxMHz: null }]),
    'Best of 3 seeds (nextpnr\'s estimate of the slowest clock): seed 1 kept (no clock timed); seed 2: no clock timed, seed 3: no clock timed.');
  const text = xc7TimingText(null, 'xc7a35tcpg236-1', seeds).split('\n');
  assert.equal(text[3], xc7SeedsLine(seeds));
  assert.ok(!xc7TimingText(null, 'xc7a35tcpg236-1').includes('seeds'));
});

test('the option: impl.xc7Seeds 3, else one seed; the 7-series\' profile offers it, no other family\'s; parallel runs on a large computer', () => {
  assert.deepEqual([xc7SeedsOf(undefined), xc7SeedsOf({}), xc7SeedsOf({ xc7Seeds: 1 }), xc7SeedsOf({ xc7Seeds: '3' }), xc7SeedsOf({ xc7Seeds: 3 })], [1, 1, 1, 1, 3]);
  assert.equal(familyProfile('artix7').seedsChoice, true);
  for (const f of ['spartan3e', 'spartan6', 'ice40', 'ecp5', 'gowin', 'nope']) assert.equal(familyProfile(f).seedsChoice, undefined, f);
  const GB = 2 ** 30;
  assert.deepEqual([xc7Parallel(16 * GB, 8), xc7Parallel(8 * GB, 4), xc7Parallel(4 * GB, 8), xc7Parallel(16 * GB, 2)], [3, 3, 1, 1]);
});

// the back end's Place & Route on a fake nextpnr: each seed's Fmax (null: fails, with an ERROR: line), its warning
const NETLIST = JSON.stringify({ modules: { top: { attributes: { top: 1 }, ports: { clk: { direction: 'input', bits: [2] }, led: { direction: 'output', bits: [3] } }, cells: {} } } });
const MODEL = { assignments: { clk: { loc: 'W5' }, led: { loc: 'U16' } }, clocks: [{ net: 'clk', period: 10 }] };
function backEnd(fmax, { xc7Seeds, apart = false } = {}) {
  const lines = [], files = {}, calls = [], report = { files: {} };
  let running = 0, most = 0;
  const run = async (args, f, onLine) => {
    const seed = +args[args.indexOf('--seed') + 1];
    calls.push(seed);
    running++; most = Math.max(most, running);
    await new Promise(r => setTimeout(r, 5));
    running--;
    onLine(`Warning: seed ${seed}'s own warning`);
    if (fmax[seed] === null) { onLine('ERROR: no route'); throw new Error(`nextpnr exited with code ${seed}`); }
    return { 'report.json': JSON.stringify({ fmax: { clk: { achieved: fmax[seed], constraint: 100 } }, utilization: {} }), 'routed.fasm': `# seed ${seed}\n` };
  };
  const nextpnr = { router: 'router2', chipdb: async () => new Uint8Array(1), run, ...(apart && { runApart: run, parallel: 3 }) };
  const io = { nextpnr: { xc7: nextpnr }, bitDb: () => ({}), write: (n, d) => { files[n] = d; return `build/${n}`; }, read: n => files[n] ?? null };
  const ctx = { io, spec: { part: 'xc7a35tcpg236-1', device: 'xc7a35t', seed: 1, ...(xc7Seeds && { xc7Seeds }) }, log: l => lines.push(l), report, top: 'top',
    ms: () => '0.1 s', now: () => 0, constraints: () => MODEL, netlistText: () => NETLIST, StepError, util: (name, used, total) => ({ name, used, total, percent: 0 }) };
  const { steps } = XC7.mount(ctx);
  return { steps, lines, files, calls, report, most: () => most };
}
const said = lines => lines.filter(l => /WARNING|ERROR|^Seed|kept|places and routes/.test(l));

test('one seed, the default: nextpnr once with seed 1, as before; its warning; no seeds in the reports', async () => {
  const b = backEnd({ 1: 240 });
  await b.steps.par();
  assert.deepEqual(b.calls, [1]);
  assert.deepEqual(said(b.lines), ['nextpnr-himbaechel (xilinx) places and routes <top> on the xc7a35tcpg236-1 (router2).', 'WARNING:Place - seed 1\'s own warning']);
  assert.equal(b.report.par.seed, 1);
  assert.equal(b.report.par.seeds, undefined);
  assert.equal(b.files['open/routed.fasm'], '# seed 1\n');
  assert.ok(!b.files['open/timing.txt'].includes('seeds'));
});

for (const apart of [false, true]) {
  test(`the best of 3 seeds ${apart ? 'apart, at once (the local server)' : 'one after another (the browser\'s worker)'}: the best Fmax kept, its FASM, only its warning, the others' Fmax reported`, async () => {
    const b = backEnd({ 1: 240.1, 2: 251.3, 3: 230 }, { xc7Seeds: 3, apart });
    await b.steps.par();
    assert.deepEqual(b.calls, [1, 2, 3]);
    assert.equal(b.most(), apart ? 3 : 1);
    assert.deepEqual(said(b.lines), ['nextpnr-himbaechel (xilinx) places and routes <top> on the xc7a35tcpg236-1 (router2; seeds 1, 2, 3, the best kept).',
      'Seed 1: 240.1 MHz (nextpnr\'s estimate).', 'Seed 2: 251.3 MHz (nextpnr\'s estimate), kept.', 'Seed 3: 230 MHz (nextpnr\'s estimate).',
      'WARNING:Place - seed 2\'s own warning']);
    assert.equal(b.files['open/routed.fasm'], '# seed 2\n');
    assert.equal(b.report.par.seed, 2);
    assert.deepEqual(b.report.par.seeds, [{ seed: 1, fmaxMHz: 240.1 }, { seed: 2, fmaxMHz: 251.3, kept: true }, { seed: 3, fmaxMHz: 230 }]);
    assert.equal(b.report.timing.maxFreqMHz, 251.3);
    const line = 'Best of 3 seeds (nextpnr\'s estimate of the slowest clock): seed 2 kept (251.3 MHz); seed 1: 240.1 MHz, seed 3: 230 MHz.';
    assert.ok(b.files['open/timing.txt'].includes(line));
    // (the timing step alone, from the files: the seeds still said)
    const again = backEnd({}, { xc7Seeds: 3 });
    Object.assign(again.files, b.files);
    again.steps.trce();
    assert.ok(again.files['open/timing.txt'].includes(line));
  });
}

test('the best of 3 seeds: a tie to the lowest seed; a failed seed left out (no warning of it); all failed: the first\'s error, as one seed\'s', async () => {
  const tie = backEnd({ 1: 200, 2: 250, 3: 250 }, { xc7Seeds: 3 });
  await tie.steps.par();
  assert.equal(tie.report.par.seed, 2);
  const one = backEnd({ 1: null, 2: 210, 3: 200 }, { xc7Seeds: 3, apart: true });
  await one.steps.par();
  assert.deepEqual(said(one.lines).slice(1), ['Seed 1: nextpnr failed (nextpnr exited with code 1).', 'Seed 2: 210 MHz (nextpnr\'s estimate), kept.', 'Seed 3: 200 MHz (nextpnr\'s estimate).',
    'WARNING:Place - seed 2\'s own warning']);
  assert.deepEqual(one.report.par.seeds, [{ seed: 1, fmaxMHz: null, failed: true }, { seed: 2, fmaxMHz: 210, kept: true }, { seed: 3, fmaxMHz: 200 }]);
  for (const xc7Seeds of [3, undefined]) {
    const all = backEnd({ 1: null, 2: null, 3: null }, { xc7Seeds });
    await assert.rejects(all.steps.par(), e => e instanceof StepError && e.message === 'nextpnr failed: nextpnr exited with code 1' && e.list.join() === 'ERROR: no route');
    assert.deepEqual(Object.keys(all.files), []);   // (nothing written)
    assert.deepEqual(said(all.lines).slice(1), []);
  }
});
