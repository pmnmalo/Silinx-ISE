// UI: the logic analyzer (#3176, web/js/capture-ui.js) in the Silinx toolchain's Processes, under Configure Target
// Device: Logic Analyzer Settings (the dialog: the signals of blinky to watch, the clock, the samples, the trigger; the
// block RAMs it takes, a problem beside the fields, Save into silinx.json; in Portuguese too), Analyze Design Using the
// Logic Analyzer (the capture on the board, the server's adepttool: scripts/ila-scan.py with stand-ins for it,
// test/fixtures/adepttool-stub; its lines in the console; the capture's window, each probe a wave, the cursor on the
// trigger's sample), View the Last Capture; none of them in ISE's tree.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const STUB = fileURLToPath(new URL('../fixtures/adepttool-stub', import.meta.url));
const PY = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).stdout.trim();
const D = '.dlg.capture-dialog';
// the toolchain's mode read again by the page, its Processes drawn again (test/ui/open-toolchain.test.js's)
const reloadToolchain = (page) => page.eval(async () => { window.SilinxApp.S.toolchain = await (await import('/js/api.js')).api.toolchain(); window.SilinxApp.renderProcesses?.(); });

// the dialog's fields set as a user sets them, then its state: [cost, problems, Save enabled]
const fill = (page, { probes, depth, pre, conds = [] }) => page.eval((d, ps, dp, pr, cs) => {
  const dlg = document.querySelector(d), list = dlg.querySelector('.capture-probes');
  for (const o of list.options) o.selected = ps.includes(o.value);
  list.dispatchEvent(new Event('change'));
  const depth = dlg.querySelector('.capture-depth');
  depth.value = String(dp); depth.dispatchEvent(new Event('input'));
  const p = dlg.querySelector('.capture-pre'); p.value = String(pr); p.dispatchEvent(new Event('input'));
  for (const [probe, op, value] of cs) {
    [...dlg.querySelectorAll('button')].find(b => /condition|condição/.test(b.textContent) && !b.title).click();
    const row = [...dlg.querySelectorAll('.capture-cond')].pop(), [s, o] = row.querySelectorAll('select');
    s.value = probe; o.value = op; o.dispatchEvent(new Event('input'));
    if (value !== undefined) { const v = row.querySelector('input'); v.value = value; v.dispatchEvent(new Event('input')); }
  }
}, D, probes, depth, pre, conds);
const state = page => page.eval(d => {
  const dlg = document.querySelector(d);
  return [dlg.querySelector('.capture-cost').textContent, dlg.querySelector('.capture-problems').textContent, !dlg.querySelector('.dlg-buttons .btn.primary').disabled];
}, D);

uiTest('#3176 the logic analyzer: its settings (a problem beside the fields, the block RAMs, Save), a capture on the board in the waveform viewer with the cursor on the trigger, the last one again; Portuguese; not in ISE\'s tree', E, async (page) => {
  await makeProject(env, { name: 'Ila', template: 'blinky', board: 'basys2' });
  // the Silinx toolchain, adepttool's stand-ins, the board's core (the probes in the design's order): dir the low bit from
  // sample 2 on, count k the 8 above it
  const cfg = path.join(env.server.configDir, 'config.json');
  fs.writeFileSync(cfg, JSON.stringify({ mode: 'silinx', paths: { adepttool: STUB, adepttoolPython: PY } }));
  const samples = Array.from({ length: 16 }, (_, k) => (((10 + k) << 1) | (k >= 2 ? 1 : 0)).toString(16));
  fs.writeFileSync(path.join(env.server.configDir, 'ila-stub.json'), JSON.stringify({ width: 9, depth: 16, fill: 2, samples }));
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await page.openProject('Ila');
  await reloadToolchain(page);
  // ---- the settings
  await page.treeRow('#procs', 'Logic Analyzer Settings', { dbl: true });
  await page.waitFor(d => document.querySelector(d), [D], { what: 'the settings dialog' });
  assert.equal(await page.eval(d => document.querySelector(`${d} .dlg-title span`).textContent, D), 'Logic Analyzer Settings');
  // (the signals' list: its 12 rows, not a field's height, #3326)
  const [listH, fieldH] = await page.eval(d => [document.querySelector(`${d} .capture-probes`).clientHeight, document.querySelector(`${d} .capture-depth`).offsetHeight], D);
  assert.ok(listH > 8 * fieldH / 2, `the list ${listH} px, a field ${fieldH} px`);
  await fill(page, { probes: ['u_knight.count', 'u_knight.dir'], depth: 16, pre: 20, conds: [['u_knight.dir', 'rise']] });
  assert.deepEqual(await state(page), ['', 'The samples before the trigger are a whole number from 0 to 15.', false]);
  await page.eval(d => { const p = document.querySelector(`${d} .capture-pre`); p.value = '2'; p.dispatchEvent(new Event('input')); }, D);
  assert.deepEqual(await state(page), ['9 bits × 16 samples: 1 block RAM(s) of the device\'s 12', '', true]);
  await page.eval(d => document.querySelector(`${d} .dlg-buttons .btn.primary`).click(), D);
  await page.waitFor(d => !document.querySelector(d), [D], { what: 'the dialog closed' });
  await page.waitFor(async () => /"capture"/.test(await (await fetch('/api/projects/Ila/file?path=silinx.json')).text().catch(() => '')) || true);
  const pj = JSON.parse(await readWs(env, 'Ila', 'silinx.json'));
  assert.deepEqual(pj.capture, { probes: ['u_knight.dir', 'u_knight.count'], clock: 'clk', depth: 16, pre: 2, trigger: { combine: 'and', conditions: [{ probe: 'u_knight.dir', op: 'rise' }] } });
  // ---- the capture on the board, its window
  const before = await page.eval(() => window.__console().length);
  await page.treeRow('#procs', 'Analyze Design Using the Logic Analyzer', { dbl: true });
  await page.waitFor(() => window.SilinxApp.findDoc('capture') && document.querySelector('.doc:not([hidden]) .isim'), [], { what: 'the capture\'s window', timeout: 60000 });
  const lines = await page.eval(c => window.__console().slice(c), before);
  // (in Implement, the task of Configure Target Device, #3327)
  // (in Implement, the task of Configure Target Device, its tab shown there: the Tasks layout's, #3327; ISE's has none)
  const task = await page.eval(() => { const tab = window.SilinxApp.findDoc('capture').tab; return [document.documentElement.dataset.task ?? null, tab.dataset.task ?? null, getComputedStyle(tab).display !== 'none']; });
  assert.deepEqual(task, process.env.SILINX_UI_INTERFACE === 'ise' ? [null, null, true] : ['impl', 'impl', true]);
  assert.match(lines, /Armed: 16 samples, 2 before the trigger\.[^]*Triggered \(2 polls\); reading 16 samples\.[^]*Logic analyzer: 16 samples of u_knight\.dir, u_knight\.count, the trigger at sample 2/);
  assert.doesNotMatch(lines, /ERROR|WARNING/);
  await page.waitFor(() => window.Silinx.active?.view?.getState().markers.length && !window.Silinx.active.view.state?.running, [], { what: 'the capture run' });
  const v = await page.eval(() => {
    const st = window.Silinx.active.view.getState();
    return { title: window.SilinxApp.findDoc('capture').title, rows: st.rows.map(r => r.path), cursor: st.cursor, markers: st.markers };
  });
  assert.deepEqual(v, { title: 'Capture (top)', rows: ['capture_replay.u_knight_dir', 'capture_replay.u_knight_count'], cursor: 2 * 20000 + 10000, markers: [2 * 20000 + 10000] });
  const saved = JSON.parse(await readWs(env, 'Ila', 'build/capture.json'));
  assert.deepEqual([saved.trigger, saved.probes.find(p => p.path === 'u_knight.count').samples.slice(0, 3)], [2, ['0xa', '0xb', '0xc']]);
  // ---- View the Last Capture: the same window again
  await page.eval(() => window.SilinxApp.closeDoc?.(window.SilinxApp.findDoc('capture')));
  await page.treeRow('#procs', 'View the Last Capture', { dbl: true });
  await page.waitFor(() => window.SilinxApp.findDoc('capture'), [], { what: 'the last capture' });
  // ---- Portuguese: the dialog's labels
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.treeRow('#procs', 'Definições do Analisador Lógico', { dbl: true });
    await page.waitFor(d => document.querySelector(d), [D], { what: 'the dialog in Portuguese' });
    const pt = await page.eval(d => [document.querySelector(`${d} .dlg-title span`).textContent, ...[...document.querySelectorAll(`${d} .form-grid > label`)].map(l => l.textContent), document.querySelector(`${d} .capture-cost`).textContent], D);
    assert.deepEqual(pt, ['Definições do Analisador Lógico', 'Sinais a observar:', 'Relógio:', 'Amostras:', 'Antes do disparo:', 'Disparo:', '9 bits × 16 amostras: 1 block RAM(s) das 12 do dispositivo']);
    await page.eval(d => [...document.querySelectorAll(`${d} .dlg-buttons .btn`)].pop().click(), D);
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
  // ---- ISE's tree: no logic analyzer (Implement leaves the capture out there)
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
  await reloadToolchain(page);
  await page.waitFor(() => document.querySelector('#procs')?.textContent.includes('Configure Target Device'), [], { what: 'ISE\'s processes' });
  assert.equal(await page.eval(() => document.querySelector('#procs').textContent.includes('Logic Analyzer')), false);
}, { timeout: 180000, skip: !PY && 'no Python 3 here' });

uiTest('#3340 a capture whose samples are all the same (a slow signal: blinky\'s LEDs in 2048 samples, 41 us): its window shows the probe, a flat wave, no error', E, async (page) => {
  await makeProject(env, { name: 'Flat', template: 'blinky', board: 'basys2' });
  fs.writeFileSync(path.join(env.server.configDir, 'config.json'), JSON.stringify({ mode: 'silinx', paths: { adepttool: STUB, adepttoolPython: PY } }));
  fs.writeFileSync(path.join(env.server.configDir, 'ila-stub.json'), JSON.stringify({ width: 8, depth: 2048, fill: 2, samples: Array(2048).fill('a5') }));
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  const file = path.join(env.server.workspace, 'Flat', 'silinx.json');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), capture: { probes: ['led'], clock: 'clk', depth: 2048, pre: 0, trigger: { combine: 'and', conditions: [] } } }));
  await page.openProject('Flat');
  await reloadToolchain(page);
  const before = await page.eval(() => window.__console().length);
  await page.treeRow('#procs', 'Analyze Design Using the Logic Analyzer', { dbl: true });
  await page.waitFor(() => window.Silinx.active?.view?.getState().markers.length && !window.Silinx.active.view.state.running, [], { what: 'the capture\'s window', timeout: 60000 });
  const lines = await page.eval(c => window.__console().slice(c), before);
  assert.match(lines, /Logic analyzer: 2048 samples of led, the trigger at sample 0/);
  assert.doesNotMatch(lines, /ERROR|WARNING/);
  // (the probe's row, its value the samples' all along)
  assert.deepEqual(await page.eval(() => window.Silinx.active.view.state.rows.map(r => [r.sig.path, r.sig.wave.t.length])), [['capture_replay.led', 1]]);
}, { timeout: 120000, skip: !PY && 'no Python 3 here' });

// #3481: a design with no clock (gates, combinational): the Clock list has the board's oscillator, its default; saved as
// the capture's boardClock; Portuguese
uiTest('#3481 the logic analyzer on a design with no clock: the board\'s clock in the Clock list, chosen by default, saved; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'IlaComb', template: 'gates', board: 'basys2' });
  fs.writeFileSync(path.join(env.server.configDir, 'config.json'), JSON.stringify({ mode: 'silinx' }));
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await page.openProject('IlaComb');
  await reloadToolchain(page);
  const clockList = () => page.eval(d => { const c = document.querySelector(`${d} .capture-clock`); return { options: [...c.options].map(o => o.textContent), value: c.value }; }, D);
  await page.treeRow('#procs', 'Logic Analyzer Settings', { dbl: true });
  await page.waitFor(d => document.querySelector(d), [D], { what: 'the settings dialog' });
  const list = await clockList();
  assert.deepEqual([list.options[0], list.value], ['the board\'s clock mclk (B8, 20 ns)', '@board']);
  await fill(page, { probes: ['sw', 'led'], depth: 16, pre: 0 });
  assert.deepEqual(await state(page), ['6 bits × 16 samples: 1 block RAM(s) of the device\'s 12', '', true]);
  await page.eval(d => document.querySelector(`${d} .dlg-buttons .btn.primary`).click(), D);
  await page.waitFor(d => !document.querySelector(d), [D], { what: 'the dialog closed' });
  await page.waitConsole(/Logic analyzer: sw, led; 16 samples on the board's clock mclk \(B8, 20 ns\)\. Implement the design and program the board to capture them\./);
  const pj = JSON.parse(await readWs(env, 'IlaComb', 'silinx.json'));
  assert.deepEqual(pj.capture, { probes: ['sw', 'led'], boardClock: { name: 'mclk', label: 'MCLK oscillator (25/50/100 MHz via JP4, default 50 MHz)', pin: 'B8', period: 20, iostandard: 'LVCMOS33', dedicated: false },
    depth: 16, pre: 0, trigger: { combine: 'and', conditions: [] } });
  // opened again: the board's clock kept; in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.treeRow('#procs', 'Definições do Analisador Lógico', { dbl: true });
    await page.waitFor(d => document.querySelector(d), [D], { what: 'the dialog in Portuguese' });
    const c = await clockList();
    assert.deepEqual([c.options[0], c.value], ['o relógio da placa mclk (B8, 20 ns)', '@board']);
    await page.eval(d => [...document.querySelectorAll(`${d} .dlg-buttons .btn`)].pop().click(), D);
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
}, { timeout: 120000 });

uiTest('#3767 the logic analyzer\'s settings on the Basys 3: the block RAMs as synthesis infers them on the 7-series (RAMB18E1s, no device total), distributed RAM for a short capture; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'Ila7', template: 'blinky', board: 'basys3' });
  // (the Silinx toolchain the project's synthesis tool: Vivado's is the 7-series' default)
  const file = path.join(env.server.workspace, 'Ila7', 'silinx.json');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), synthTool: 'silinx' }));
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await page.openProject('Ila7');
  await reloadToolchain(page);
  await page.treeRow('#procs', 'Logic Analyzer Settings', { dbl: true });
  await page.waitFor(d => document.querySelector(d), [D], { what: 'the settings dialog' });
  await fill(page, { probes: ['u_knight.count', 'u_knight.dir'], depth: 1024, pre: 64, conds: [['u_knight.dir', 'rise']] });
  assert.deepEqual(await state(page), ['9 bits × 1024 samples: 1 block RAM(s)', '', true]);
  await page.eval(d => { const p = document.querySelector(`${d} .capture-depth`); p.value = '256'; p.dispatchEvent(new Event('input')); }, D);
  assert.deepEqual(await state(page), ['9 bits × 256 samples: 0 block RAM(s)', '', true]);
  await page.eval(d => [...document.querySelectorAll(`${d} .dlg-buttons .btn`)].pop().click(), D);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.treeRow('#procs', 'Definições do Analisador Lógico', { dbl: true });
    await page.waitFor(d => document.querySelector(d), [D], { what: 'the dialog in Portuguese' });
    await fill(page, { probes: ['u_knight.count', 'u_knight.dir'], depth: 1024, pre: 64 });
    assert.equal((await state(page))[0], '9 bits × 1024 amostras: 1 block RAM(s)');
    await page.eval(d => [...document.querySelectorAll(`${d} .dlg-buttons .btn`)].pop().click(), D);
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
}, { timeout: 120000 });
