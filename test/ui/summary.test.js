// UI: the Design Summary's Device Utilization before an implementation: the target part's resources from
// the device model (packages/silinx-fpga/src/resources.js, #790), the family's own and their counts, in English and Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, writeWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the utilization table's rows: [resource, available]
const UTILIZATION = () => {
  const t = [...document.querySelectorAll('.summary-table')].find((x) => /^(Device Utilization Summary|Resumo da Utilização do Dispositivo)/.test(x.querySelector('caption')?.textContent || ''));
  return t ? [...t.querySelectorAll('tr')].slice(1).map((r) => [r.cells[0].textContent, r.cells[2].textContent]) : null;
};

const shown = async (page, name) => {
  await page.openProject(name);
  await page.waitFor(() => window.SilinxApp.findDoc('summary') && document.querySelector('.summary-table caption'));
  return page.eval(UTILIZATION);
};

uiTest('Design Summary, not yet implemented: a Spartan-3E part\'s resources, its 24 global clock buffers, in Portuguese too (#790)', E, async (page) => {
  await makeProject(env, { name: 'ResS3e', template: 'blinky', board: 'basys2', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' } });
  assert.deepEqual(await shown(page, 'ResS3e'), [['Number of Slice Flip Flops', '4896'], ['Number of 4 input LUTs', '4896'], ['Number of occupied Slices', '2448'],
    ['Number of bonded IOBs', '92'], ['Number of RAMB16s', '12'], ['Number of MULT18X18SIOs', '12'], ['Number of BUFGMUXs', '24'], ['Number of DCMs', '4']]);
  assert.ok(await page.eval(() => [...document.querySelectorAll('.summary-table caption')].some((c) => c.textContent === 'Device Utilization Summary (not yet implemented)')));
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.waitFor(() => /Número de BUFGMUXs/.test(document.querySelector('.doc:not([hidden])')?.innerText || ''), [], { what: 'the summary in Portuguese' });
    const pt = await page.eval(UTILIZATION);
    assert.deepEqual(pt.map((r) => r[0]), ['Número de Slice Flip Flops', 'Número de 4 input LUTs', 'Número de occupied Slices', 'Número de bonded IOBs',
      'Número de RAMB16s', 'Número de MULT18X18SIOs', 'Número de BUFGMUXs', 'Número de DCMs']);
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
});

uiTest('Design Summary, not yet implemented: a Spartan-6 part\'s own resources (block RAM halves, DSP, PLL, BUFIO2, BUFH, MCB), none of the Spartan-3E\'s (#790)', E, async (page) => {
  await makeProject(env, { name: 'ResS6', template: 'blinky', board: 'nexys3' });
  assert.deepEqual(await shown(page, 'ResS6'), [['Number of Slice Registers', '18224'], ['Number of Slice LUTs', '9112'], ['Number of occupied Slices', '2278'],
    ['Number of bonded IOBs', '232'], ['Number of RAMB16BWERs', '32'], ['Number of RAMB8BWERs', '64'], ['Number of DSP48A1s', '32'],
    ['Number of BUFG/BUFGMUXs', '16'], ['Number of BUFIO2/BUFIO2_2CLKs', '32'], ['Number of BUFHs', '128'], ['Number of DCM/DCM_CLKGENs', '4'],
    ['Number of PLL_ADVs', '2'], ['Number of MCBs', '2']]);
});

// the table's rows with their used and percent: [resource, used, available, percent, over 100 % (status-bad)]
const ROWS = () => {
  const t = [...document.querySelectorAll('.summary-table')].find((x) => /^(Device Utilization Summary|Resumo da Utilização do Dispositivo)/.test(x.querySelector('caption')?.textContent || ''));
  return [...t.querySelectorAll('tr')].slice(1).map((r) => [r.cells[0].textContent, r.cells[1].textContent, r.cells[2].textContent, r.cells[3].textContent, r.cells[3].classList.contains('status-bad')]);
};
const CAPTION = () => [...document.querySelectorAll('.summary-table caption')].map((c) => c.textContent).find((c) => /^(Device Utilization|Resumo da Utilização)/.test(c));
// a Silinx toolchain run's reports (build/reports.json, server/open-flow.js openReports): the synthesis of 5 block RAMs on
// the XC3S100E (test/resource-check.test.js), failed there; and with a MAP of 5 block RAMs and 5 multipliers, failed at MAP
const SYNTH = { tool: 'Yosys', cells: 47, warnings: 0, errors: 1, utilization: [
  { id: 'luts', name: 'Number of 4 input LUTs', used: 15, total: 1920, percent: 1 }, { id: 'ramb16', name: 'Number of RAMB16s', used: 5, total: 4, percent: 125 },
  { id: 'bufgmux', name: 'Number of GCLKs', used: 1, total: 24, percent: 4 }, { id: 'iob', name: 'Number of IOs', used: 26, total: 83, percent: 31 }] };
const MAP = { errors: 2, warnings: 0, utilization: [['ffs', 'Number of Slice Flip Flops', 0, 1920], ['luts', 'Number of 4 input LUTs', 20, 1920], ['slices', 'Number of occupied Slices', 10, 960],
  ['iob', 'Number of bonded IOBs', 47, 83], ['ramb16', 'Number of RAMB16s', 5, 4], ['mult18x18', 'Number of MULT18X18SIOs', 5, 4], ['bufgmux', 'Number of BUFGMUXs', 1, 24], ['dcm', 'Number of DCMs', 0, 2]]
  .map(([id, name, used, total]) => ({ id, name, used, total, percent: Math.round((100 * used) / total) })) };
const reports = (extra) => JSON.stringify({ source: 'open', top: 'top', synthesis: SYNTH, ...extra, simModels: {}, files: {}, summary: { synthesized: true, mapped: !!extra.map } });

uiTest('Design Summary after a synthesis over the XC3S100E\'s block RAMs: every resource used of available, the block RAMs over 100 % in red; in Portuguese too (#795)', E, async (page) => {
  await makeProject(env, { name: 'ResOver', template: 'blinky', board: 'basys2', device: { family: 'spartan3e', part: 'xc3s100e', package: 'cp132', speed: '-4' } });
  await writeWs(env, 'ResOver', 'build/reports.json', reports({}));
  await page.openProject('ResOver');
  await page.waitFor(() => window.SilinxApp.findDoc('summary') && /after synthesis/.test(document.querySelector('.doc:not([hidden])')?.innerText || ''), [], { what: 'the summary after synthesis' });
  assert.equal(await page.eval(CAPTION), 'Device Utilization Summary (after synthesis)');
  assert.deepEqual(await page.eval(ROWS), [['Number of Slice Flip Flops', '0', '1920', '0%', false], ['Number of 4 input LUTs', '15', '1920', '1%', false], ['Number of occupied Slices', '-', '960', '', false],
    ['Number of bonded IOBs', '26', '83', '31%', false], ['Number of RAMB16s', '5', '4', '125%', true], ['Number of MULT18X18SIOs', '0', '4', '0%', false],
    ['Number of BUFGMUXs', '1', '24', '4%', false], ['Number of DCMs', '0', '2', '0%', false]]);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.waitFor(() => /após a síntese/.test(document.querySelector('.doc:not([hidden])')?.innerText || ''), [], { what: 'the summary in Portuguese' });
    assert.equal(await page.eval(CAPTION), 'Resumo da Utilização do Dispositivo (após a síntese)');
    assert.deepEqual((await page.eval(ROWS)).find((r) => r[0] === 'Número de RAMB16s'), ['Número de RAMB16s', '5', '4', '125%', true]);
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
});

uiTest('Design Summary after a MAP over the XC3S100E\'s block RAMs and multipliers: MAP\'s rows, both over 100 % in red (#795)', E, async (page) => {
  await makeProject(env, { name: 'ResOverMap', template: 'blinky', board: 'basys2', device: { family: 'spartan3e', part: 'xc3s100e', package: 'cp132', speed: '-4' } });
  await writeWs(env, 'ResOverMap', 'build/reports.json', reports({ map: MAP }));
  await page.openProject('ResOverMap');
  await page.waitFor(() => window.SilinxApp.findDoc('summary') && /Silinx toolchain\)/.test(document.querySelector('.doc:not([hidden])')?.innerText || ''), [], { what: 'the summary after MAP' });
  assert.equal(await page.eval(CAPTION), 'Device Utilization Summary (Silinx toolchain)');
  assert.deepEqual(await page.eval(ROWS), [['Number of Slice Flip Flops', '0', '1920', '0%', false], ['Number of 4 input LUTs', '20', '1920', '1%', false], ['Number of occupied Slices', '10', '960', '1%', false],
    ['Number of bonded IOBs', '47', '83', '57%', false], ['Number of RAMB16s', '5', '4', '125%', true], ['Number of MULT18X18SIOs', '5', '4', '125%', true],
    ['Number of BUFGMUXs', '1', '24', '4%', false], ['Number of DCMs', '0', '2', '0%', false]]);
});

uiTest('Design Summary, not yet implemented: a Spartan-3 part\'s 8 global clock buffers (#821)', E, async (page) => {
  await makeProject(env, { name: 'ResS3', template: 'blinky', board: 's3-starter' });
  assert.deepEqual(await shown(page, 'ResS3'), [['Number of Slice Flip Flops', '3840'], ['Number of 4 input LUTs', '3840'], ['Number of occupied Slices', '1920'],
    ['Number of bonded IOBs', '173'], ['Number of BUFGMUXs', '8']]);
});

uiTest('#1103 Design Summary: a PERIOD on a clock with no path between two flip-flops: met, "no path between flip-flops to time", no period of 0 ns', E, async (page) => {
  await makeProject(env, { name: 'NoPaths', template: 'blinky' });
  const timing = { met: true, timingErrors: 0, score: null, minPeriodNs: null, maxFreqMHz: null, clocks: [],
    constraints: [{ name: 'PERIOD clk', constraint: 'PERIOD 20 ns on clk', required: 20, minPeriodNs: null, maxFreqMHz: null, timingErrors: 0, slackNs: 20 }] };
  await writeWs(env, 'NoPaths', 'build/reports.json', JSON.stringify({ source: 'open', top: 'top', synthesis: SYNTH, map: MAP, timing, simModels: {}, files: {}, summary: { synthesized: true, mapped: true, routed: true } }));
  await page.openProject('NoPaths');
  await page.waitFor(() => /Timing \(post Place & Route/.test(document.querySelector('.doc:not([hidden])')?.innerText || ''), [], { what: 'the summary\'s timing' });
  const rows = await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .summary-table')].find((t) => /^Timing/.test(t.caption?.textContent || ''))
    .querySelectorAll('tr').values().map((r) => [...r.children].map((c) => c.textContent)).toArray());
  assert.deepEqual(rows, [['Timing Constraints', 'All constraints met'], ['PERIOD clk', 'PERIOD 20 ns on clk — met, no path between flip-flops to time']]);
});
