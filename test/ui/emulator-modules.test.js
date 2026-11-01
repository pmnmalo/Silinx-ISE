// UI: the Board Emulator's modules outside the board shown or hidden (web/js/emulator-modules.js, #2522): the VGA
// monitor on a real design, the iCEBreaker's modules on its Pmods drawn alone; no control for a board with neither.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';
import { BOARDS } from '../../server/devices.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const VGA_UCF = `NET "clk" LOC = "B8"; NET "hsync" LOC = "J14"; NET "vsync" LOC = "K13";
NET "red<0>" LOC = "C14"; NET "red<1>" LOC = "D13"; NET "red<2>" LOC = "F13";
NET "green<0>" LOC = "F14"; NET "green<1>" LOC = "G13"; NET "green<2>" LOC = "G14";
NET "blue<0>" LOC = "H13"; NET "blue<1>" LOC = "J13";
NET "sw<0>" LOC = "P11"; NET "sw<1>" LOC = "L3"; NET "sw<2>" LOC = "K3"; NET "sw<3>" LOC = "B4";
NET "sw<4>" LOC = "G3"; NET "sw<5>" LOC = "F3"; NET "sw<6>" LOC = "E2"; NET "sw<7>" LOC = "N3";
`;
const COUNTER = `library ieee; use ieee.std_logic_1164.all;
entity cnt is port (clk : in std_logic; led : out std_logic_vector(7 downto 0)); end cnt;
architecture rtl of cnt is begin led <= (others => clk); end rtl;
`;
const open = async (page) => {
  await page.menu('Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running' });
};
const forget = (page) => page.eval(async () => {
  const { prefKey } = await import('/js/prefs.js');
  for (const id of ['vga', 'display', 'switches']) localStorage.removeItem(prefKey(`silinx.emulator.module.${id}`));
});
const DOC = '.doc:not([hidden])';
const toggles = (page, root) => page.eval((r) => [...document.querySelectorAll(`${r} [data-module-toggle]`)].map((c) => [c.dataset.moduleToggle, c.checked, c.parentElement.textContent]), root);
const toggle = (page, root, id) => page.eval((r, i) => document.querySelector(`${r} [data-module-toggle="${i}"]`).click(), root, id);

uiTest('#2522 the VGA monitor hidden and shown again: the design goes on, no picture while hidden, the picture of now when paused; the choice remembered, in Portuguese too', E, async (page) => {
  await forget(page);
  const bars = fs.readFileSync(path.join(ROOT, 'test/fixtures/compiled-sim/vga_bars.vhd'), 'utf8');
  await makeProject(env, { name: 'EmuModVga', board: 'basys2', top: 'vga_bars', constraints: 'constraints/vga.ucf', files: { 'src/vga_bars.vhd': bars, 'constraints/vga.ucf': VGA_UCF } });
  await page.openProject('EmuModVga');
  await open(page);
  assert.deepEqual(await toggles(page, DOC), [['vga', true, 'VGA monitor']]);
  const seen = () => page.eval((d) => document.querySelector(`${d} .emu-vga`).offsetHeight > 0, DOC);
  const picture = () => document.querySelector('.doc:not([hidden]) .emu-vga-stat')?.textContent.startsWith('640×480');
  await page.waitFor(picture, [], { what: 'a picture', timeout: 30000 });
  assert.equal(await seen(), true);
  // hidden: the box gone, the choice kept, the board's time goes on, and no picture fetched
  await toggle(page, DOC, 'vga');
  assert.equal(await seen(), false);
  assert.equal(await page.eval(async () => localStorage.getItem((await import('/js/prefs.js')).prefKey('silinx.emulator.module.vga'))), 'hidden');
  const t0 = await page.eval(() => window.Silinx.active.view.sim.now);
  await page.eval(() => { const s = window.Silinx.active.view.sim; window.__adv = s.advance; window.__vgaAsked = 0; s.advance = function (n, o) { if (o?.vga) window.__vgaAsked++; return window.__adv.call(this, n, o); }; });
  await page.waitFor((t) => window.Silinx.active.view.sim.now > t, [t0], { what: 'the design running hidden' });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await page.eval(() => window.__vgaAsked), 0);
  // paused and shown again: the picture of now, at once
  await page.click(`${DOC} .emu-bar .btn`, { text: '⏸ Pause' });
  await page.waitFor(() => !window.Silinx.active.view.sim.busy, [], { what: 'the last run in' });
  await page.eval(() => { document.querySelector('.doc:not([hidden]) .emu-vga canvas').getContext('2d').clearRect(0, 0, 640, 480); });
  await toggle(page, DOC, 'vga');
  assert.equal(await seen(), true);
  await page.waitFor(() => window.__vgaAsked === 1, [], { what: 'the picture asked for' });
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .emu-vga canvas').getContext('2d').getImageData(600, 450, 1, 1).data[0] === 255, [], { what: 'the picture drawn' });
  // in Portuguese
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await setLang('pt');
  assert.deepEqual((await toggles(page, DOC))[0][2], 'Monitor VGA');
  assert.match(await page.eval((d) => document.querySelector(`${d} .emu-bar`).textContent, DOC), /Mostrar:/);
  await setLang('en');
  await forget(page);
});

uiTest('#2522 a board with no module outside it: no control', E, async (page) => {
  await makeProject(env, { name: 'EmuModNone', board: 'basys2', files: { 'src/cnt.vhd': COUNTER }, top: 'cnt' });
  await page.openProject('EmuModNone');
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true);
  await page.eval(() => window.SilinxApp.openFile('src/cnt.vhd'));
  await open(page);
  assert.deepEqual(await toggles(page, DOC), []);
  assert.doesNotMatch(await page.eval((d) => document.querySelector(`${d} .emu-bar`).textContent, DOC), /Show:/);
});

// the iCEBreaker with its Pmod modules, drawn alone (the emulator's style in place: a Basys2's opened first)
const ICE = BOARDS.find((x) => x.id === 'icebreaker');
const mountAlone = (page) => page.eval(async (b) => {
  const [{ mountBoardParts }, { mountEmuModules }, { h }] = await Promise.all([import('/js/emulator-board.js'), import('/js/emulator-modules.js'), import('/js/dom.js')]);
  document.querySelector('#alone')?.remove();
  const main = h('div', { id: 'alone', style: { position: 'fixed', left: '0', top: '0', zIndex: '1000', background: '#fff' } });
  const stat = h('span', {});
  main.append(h('div', { id: 'alone-bar' }, stat));
  document.body.append(main);
  mountBoardParts({
    board: b, title: '', after() {}, bitFor: () => undefined, compiled: () => false, hasLcd: false, inVal: new Map(), knobEnd: () => 0,
    lcdView: () => null, main, manual: [], period: 83333, powered: () => true, refresh() {}, resLabel: {},
    resOf: (n) => b.resources.find((r) => r.name === n), runCycles() {}, running: () => false, setInputBit() {}, setPower() {},
    sim: {}, tip: (res, k = 0) => `${res}${k}`, wiring: { bits: [], clocks: [] }, setKnobEnd() {}, setLcdView() {},
  });
  window.__changed = 0;
  mountEmuModules({ main, stat, changed: () => { window.__changed++; } });
}, ICE);

uiTest('#2522 the iCEBreaker\'s modules: each hidden alone with its wires and parts, none shown gives the room back and the board stays usable; remembered when mounted again', E, async (page) => {
  await forget(page);
  await makeProject(env, { name: 'EmuModIce', board: 'basys2', files: { 'src/cnt.vhd': COUNTER }, top: 'cnt' });
  await page.openProject('EmuModIce');
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true);
  await page.eval(() => window.SilinxApp.openFile('src/cnt.vhd'));
  await open(page);
  await mountAlone(page);
  assert.deepEqual(await toggles(page, '#alone'), [['display', true, 'Display'], ['switches', true, 'Switches']]);
  const state = () => page.eval(() => ({
    an: document.querySelector('#alone [data-part="an0"]').offsetHeight > 0,
    sw: document.querySelector('#alone [data-part="sw0"]').offsetHeight > 0,
    breadboard: getComputedStyle(document.querySelector('#alone g[data-module="display"]')).display !== 'none',
    module: getComputedStyle(document.querySelector('#alone g[data-module="switches"]')).display !== 'none',
    h: document.querySelector('#alone .emu-pcb').offsetHeight,
    power: Math.round(document.querySelector('#alone [data-part="power"]').getBoundingClientRect().top - document.querySelector('#alone .emu-pcb').getBoundingClientRect().top),
  }));
  const all = await state();
  assert.deepEqual([all.an, all.sw, all.breadboard, all.module, all.h], [true, true, true, true, 493 + 190]);
  await toggle(page, '#alone', 'display');
  const noDisp = await state();
  assert.deepEqual([noDisp.an, noDisp.sw, noDisp.breadboard, noDisp.module, noDisp.h, noDisp.power], [false, true, false, true, 493 + 190, all.power]);
  await toggle(page, '#alone', 'switches');
  const none = await state();
  assert.deepEqual([none.an, none.sw, none.breadboard, none.module, none.h, none.power], [false, false, false, false, 493, all.power - 190]);
  assert.equal(await page.eval(() => window.__changed), 2);
  // each control left is what is at its centre (the drawing moved up does not cover them)
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#alone .emu-btn, #alone .emu-power')].filter((c) => {
    const r = c.getBoundingClientRect(), at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !(at === c || c.contains(at));
  }).map((c) => c.title)), []);
  // remembered
  await mountAlone(page);
  assert.deepEqual((await toggles(page, '#alone')).map((t) => t[1]), [false, false]);
  assert.equal((await state()).h, 493);
  await page.eval(() => document.querySelector('#alone').remove());
  await forget(page);
});
