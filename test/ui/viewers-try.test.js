// UI: Try it on the read-only viewers (#1064): View RTL Schematic and View Technology Schematic (the Silinx
// toolchain's netlist) of the example gates, the switches set in the bus value editor, the LEDs light for the
// prime numbers as in the RTL simulation; blinky's clock stepped; Esc stops; the labels in Portuguese; the Tasks
// interface too.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const ED = '.doc:not([hidden]) .sch-editor';
const PRIMES = [2, 3, 5, 7, 11, 13];
const reloadToolchain = (page) => page.eval(async () => { window.SilinxApp.S.toolchain = await (await import('/js/api.js')).api.toolchain(); window.SilinxApp.renderProcesses(); });
const portId = (page, name) => page.eval((n) => window.Silinx.active.viewer.getDoc().ports.find((p) => p.name.toLowerCase() === n).id, name);
const shown = (page, sel) => page.eval((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; }, sel);

// Try it pressed on the viewer shown: the simulation mode, the whole drawing in view
async function tryIt(page) {
  assert.ok(await shown(page, `${ED} .se-btn[data-act=sim]`), 'the Try it button on the read-only viewer');
  await page.click(`${ED} .se-btn[data-act=sim]`);
  await page.waitFor((sel) => document.querySelector(sel)?.classList.contains('sim-mode') && document.querySelector(`${sel} .se-simlayer .lv-ctl`), [ED], { what: 'Try it', timeout: 30000 });
  await page.click(`${ED} .se-btn[data-act="fit"]`);
}
// a bus input set in its value editor (hex)
async function setBus(page, id, v) {
  await page.click(`${ED} .lv-ctl[data-port="${id}"]`);
  await page.waitFor(() => document.activeElement?.matches('.lv-edit-in'), [], { what: 'bus editor focused' });
  await page.eval(() => { document.activeElement.value = ''; });
  await page.type(`0x${v.toString(16)}`);
  await page.key('Enter');
  await page.waitFor((sel) => !document.querySelector(`${sel} .lv-editor`), [ED], { what: 'bus editor closed' });
}
// gates: sw = 0…15 typed, led (two bits) = 3 for a prime, else 0
async function checkPrimes(page, values) {
  const sw = await portId(page, 'sw'), led = await portId(page, 'led');
  assert.equal(await page.eval((sel, id) => document.querySelector(`${sel} .lv-ctl[data-port="${id}"]`)?.dataset.lv, ED, sw), 'edit');
  for (const v of values) {
    await setBus(page, sw, v);
    const want = PRIMES.includes(v) ? '3' : '0';
    await page.waitFor((sel, id, w) => document.querySelector(`${sel} .se-simlayer .lv-out[data-port="${id}"] .lv-val`)?.textContent === w, [ED, led, want], { what: `sw = ${v}: led = ${want}` });
  }
}
async function stopWithEsc(page) {
  await page.click(`${ED} .se-canvas`);
  await page.key('Escape');
  await page.waitFor((sel) => !document.querySelector(sel).classList.contains('sim-mode'), [ED], { what: 'Try it stopped' });
  assert.equal(await page.eval((sel) => document.querySelectorAll(`${sel} .se-simlayer *`).length, ED), 0);
}
const noWarnings = async (page) => assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /warning|error/i.test(l)), []);

uiTest('Try it on the RTL Schematic and the Technology Schematic of gates: the switches typed, the LEDs of the prime numbers; Esc stops; Portuguese', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'TryViewers', template: 'gates' });
  await page.openProject('TryViewers');
  await reloadToolchain(page);
  // View RTL Schematic: Try it, read-only (no editing tools)
  await page.treeRow('#hier', 'gates');
  await page.treeRow('#procs', 'View RTL Schematic', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'rtl:gates' && window.Silinx.active.viewer?.getDoc().symbols.length > 5, [], { what: 'RTL schematic' });
  assert.ok(!(await shown(page, `${ED} .se-btn[data-act=wire]`)), 'read-only');
  await tryIt(page);
  await checkPrimes(page, [0, 2, 4, 5, 9, 11, 13, 15]);
  // the wires coloured by their values
  assert.ok(await page.eval((sel) => document.querySelectorAll(`${sel} g.wire.lv-1`).length > 0 && document.querySelectorAll(`${sel} g.wire.lv-0`).length > 0, ED));
  // the labels in Portuguese: the button, the strip, the panel
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const texts = () => page.eval((sel) => ['.se-simbar', '.se-props', '[data-act=sim]'].flatMap((p) => window.__uiTexts(document.querySelector(`${sel} ${p}`))), ED);
  await setLang('en');
  const en = await texts();
  await setLang('pt');
  const pt = await texts();
  await setLang('en');
  assert.ok(en.includes('Try it') && pt.includes('Experimentar') && en.includes('Trying it out') && pt.includes('A experimentar') && en.includes('Stop') && pt.includes('Parar'), JSON.stringify(pt));
  assert.deepEqual(untranslated(en, pt, [/^@?(Hex|Decimal|Reset)$/]), []);
  await stopWithEsc(page);
  // View Technology Schematic (the Silinx toolchain's synthesis runs first): the netlist's LUTs and buffers
  await page.click('input[name=view][value=impl]');
  await page.treeRow('#procs', 'View Technology Schematic', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'tech:gates' && window.Silinx.active.viewer?.getDoc().symbols.length > 5, [], { what: 'technology schematic', timeout: 180000 });
  assert.ok(await page.eval(() => window.Silinx.active.viewer.getDoc().symbols.some((s) => /^LUT\d$/.test(s.params?.module))), 'LUTs');
  await tryIt(page);
  await checkPrimes(page, [0, 2, 4, 5, 9, 11, 13, 15]);
  await stopWithEsc(page);
  await noWarnings(page);
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
}, { timeout: 300000 });

uiTest('Try it on blinky\'s RTL Schematic: the clock stepped from the strip and from its marker; inside an instance; Up leaves it', E, async (page) => {
  await makeProject(env, { name: 'TryBlinky', template: 'blinky' });
  await page.openProject('TryBlinky');
  await page.treeRow('#hier', 'top');
  await page.treeRow('#procs', 'View RTL Schematic', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'rtl:top' && window.Silinx.active.viewer?.getDoc().symbols.length >= 5, [], { what: 'RTL schematic' });
  await tryIt(page);
  // clk: a clock (its Step / Run in the strip, a clock marker), the switches and buttons
  assert.deepEqual(await page.eval((sel) => [...document.querySelectorAll(`${sel} .se-simbar .lv-clock`)].map((b) => b.dataset.clock), ED), ['clk']);
  assert.equal(await page.eval((sel) => document.querySelector(`${sel} .lv-ctl[data-port]`) && [...document.querySelectorAll(`${sel} .lv-ctl`)].map((c) => c.dataset.lv).sort().join(), ED), 'clock,edit,edit');
  const now = () => page.eval(() => window.Silinx.active.viewer.liveSim.now);
  const t0 = await now();
  await page.click(`${ED} .se-simbar .lv-step`);
  await page.waitFor((t) => window.Silinx.active.viewer.liveSim.now > t, [t0], { what: 'one clock cycle' });
  const t1 = await now();
  await page.click(`${ED} .lv-ctl[data-lv=clock]`);
  await page.waitFor((t) => window.Silinx.active.viewer.liveSim.now > t, [t1], { what: 'one more' });
  // the instances list their pins' values
  const inst = await page.eval(() => window.Silinx.active.viewer.getDoc().symbols.find((s) => s.type === 'module' && s.name === 'u_knight').id);
  await page.click(`${ED} g.sym[data-id="${inst}"] .hitbox`);
  await page.waitFor((sel) => [...document.querySelectorAll(`${sel} .lv-ports tr`)].map((r) => r.cells[0].textContent).join() === 'clk,rst,step,mode,leds', [ED], { what: 'u_knight\'s pins' });
  await stopWithEsc(page);
  // inside an instance: Try it on its drawing; Up to the parent stops it (the parent's drawing shown as it is)
  await page.dblclick(`${ED} g.sym[data-id="${inst}"] .hitbox`);
  await page.waitFor(() => window.Silinx.active.viewer.getDoc().name.toLowerCase() === 'knight', [], { what: 'inside u_knight' });
  await tryIt(page);
  assert.deepEqual(await page.eval((sel) => [...document.querySelectorAll(`${sel} .se-simbar .lv-clock`)].map((b) => b.dataset.clock), ED), ['clk']);
  await page.click('.doc:not([hidden]) .rtl-crumbs .rtl-nav', { text: '⬆ Up' });
  await page.waitFor(() => window.Silinx.active.viewer.getDoc().name.toLowerCase() === 'top', [], { what: 'back to the top' });
  await page.waitFor((sel) => !document.querySelector(sel).classList.contains('sim-mode'), [ED], { what: 'Try it left' });
  await noWarnings(page);
}, { timeout: 120000 });

uiTest('Try it on the RTL Schematic in the Tasks interface', E, async (page) => {
  await makeProject(env, { name: 'TryTasks', template: 'gates' });
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
  try {
    await page.openProject('TryTasks');
    await page.eval(async () => (await import('/js/viewers.js')).openSchematic('gates'));
    await page.waitFor(() => window.Silinx.active?.id === 'rtl:gates' && window.Silinx.active.viewer?.getDoc().symbols.length > 5, [], { what: 'RTL schematic' });
    await tryIt(page);
    await checkPrimes(page, [3, 8]);
    await stopWithEsc(page);
  } finally {
    await page.eval(() => localStorage.removeItem('silinx.ui'));
  }
}, { timeout: 120000 });
