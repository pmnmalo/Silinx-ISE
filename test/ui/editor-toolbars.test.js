// UI (#2505): the drawing editors' toolbars and side panels as the Schematic editor's, in both interfaces: flat buttons
// of the same height, the same bar, no second Undo / Redo or Print, no note of the HDL in sync; the Petri net's zooms;
// the Algebra editor's menu an icon and a label; the main toolbar's Undo still undoes an edit. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { newPetri } from '../../core/petri.js';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const D = '.doc:not([hidden])';
const open = async (page, path, what, sel) => {
  await page.eval((p) => window.SilinxApp.openFile(p), path);
  await page.waitFor((s) => document.querySelector(s)?.getClientRects().length > 0, [`${D} ${sel}`], { what });
};
// the look of a toolbar's bar and of a flat button in it
const look = (page, bar, btn) => page.eval((b, x) => {
  const cb = getComputedStyle(document.querySelector(b)), cx = getComputedStyle(document.querySelector(x));
  return { barBg: cb.backgroundImage + cb.backgroundColor, h: cx.height, btnBorder: cx.borderTopColor, btnBg: cx.backgroundImage + cx.backgroundColor, radius: cx.borderTopLeftRadius };
}, bar, btn);
const shot = async (page, name) => { if (process.env.SILINX_SHOTS) await page.screenshot(`${process.env.SILINX_SHOTS}/${name}-${process.env.SILINX_UI_INTERFACE || 'silinx'}.png`); };

uiTest('#2505 the editors\' toolbars and side panels as the Schematic editor\'s', E, async (page) => {
  await makeProject(env, { name: 'BarsT', template: 'traffic', files: { 'src/net.pn.json': JSON.stringify(newPetri('net')) } });
  await makeProject(env, { name: 'BarsB', template: 'blinky' });
  await makeProject(env, { name: 'BarsG', template: 'gates' });
  await page.setViewport(1440, 900);
  await page.openProject('BarsG');
  await open(page, 'src/gates.sch.json', 'the schematic', '.se-toolbar');
  const ref = await look(page, `${D} .se-toolbar`, `${D} .se-btn[data-act=zin]`);
  const sideLook = (side, cap) => page.eval((a, b) => { const c = (x) => getComputedStyle(document.querySelector(x)); return { width: c(a).width, cap: c(b).height, capFg: c(b).color }; }, side, cap);
  const refSide = await sideLook(`${D} .se-right`, `${D} .se-cap`);
  const ownHistory = (bar) => page.eval((b) => [...document.querySelectorAll(`${b} button`)].filter((x) => /^(Undo|Redo)$|Print/.test(x.title)).map((x) => x.title), bar);
  assert.deepEqual(await ownHistory(`${D} .se-toolbar`), [], 'the schematic: no Undo or Redo of its own');
  await shot(page, 'schematic');
  for (const [pj, file, name, bar] of [['BarsT', 'src/traffic.fsm.json', 'fsm', '.fsm-toolbar'], ['BarsT', 'src/net.pn.json', 'petri', '.pn-toolbar'], ['BarsB', 'src/speed_ctrl.asm.json', 'asm', '.asm-chart-toolbar']]) {
    if (await page.eval(() => window.SilinxApp.S.project?.name) !== pj) await page.openProject(pj);
    await open(page, file, name, bar);
    const b = `${D} ${bar}`;
    assert.deepEqual(await look(page, b, `${b} [data-act=zin]`), ref, `${name}: the look of the schematic's toolbar`);
    assert.deepEqual(await ownHistory(b), [], `${name}: no Undo, Redo or Print of its own`);
    assert.deepEqual(await page.eval((x) => ['zin', 'zout', 'fit', 'delete'].map((a) => !!document.querySelector(`${x} [data-act=${a}] svg`)), b), [true, true, true, true], `${name}: the schematic's icons`);
    assert.deepEqual(await sideLook(`${D} .asm-side`, `${D} .asm-cap`), refSide, `${name}: the side panel`);
    assert.equal(await page.eval((d) => document.querySelector(`${d} .asm-cap`).textContent, D), 'Properties');
    assert.equal(await page.eval((d) => document.querySelector(`${d} .asm-toolbar .gen-banner`), D), null, `${name}: its HDL in sync unsaid`);
    await shot(page, name);
  }
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });

uiTest('#2505 the FSM: no HDL button; the Petri net: its zooms; the main toolbar\'s Undo undoes', E, async (page) => {
  await makeProject(env, { name: 'BarsZ', template: 'traffic', files: { 'src/net.pn.json': JSON.stringify(newPetri('net')) } });
  await page.setViewport(1440, 900);
  await page.openProject('BarsZ');
  await open(page, 'src/traffic.fsm.json', 'the FSM', '.fsm-toolbar');
  assert.deepEqual(await page.eval((d) => [...document.querySelectorAll(`${d} .fsm-tab-btn`)].map((b) => b.textContent), D), ['Tables', 'Simulate']);
  await open(page, 'src/net.pn.json', 'the Petri net', '.pn-toolbar');
  const P = `${D} .pn-toolbar`;
  const zoom = () => page.eval((d) => parseInt(document.querySelector(`${d} .asm-status .asm-zoom`).textContent, 10), D);
  const moved = (cmp, z, what) => page.waitFor((d, c, v) => { const k = parseInt(document.querySelector(`${d} .asm-status .asm-zoom`).textContent, 10); return c === 'in' ? k > v : k < v; }, [D, cmp, z], { what });
  await page.click(`${P} [data-act=fit]`);
  const z0 = await zoom();
  await page.click(`${P} [data-act=zin]`);
  await moved('in', z0, 'zoomed in');
  const z1 = await zoom();
  await page.click(`${P} [data-act=zout]`);
  await moved('out', z1, 'zoomed out');
  // (a net's edit undone from the main toolbar)
  const places = () => page.eval(() => window.Silinx.active.petriEditor.getModel().places.length);
  const n = await places();
  await page.click(`${P} .pn-tool`, { text: 'Place' });
  const r = await page.eval(() => { const b = document.querySelector('.doc:not([hidden]) .pn-canvas').getBoundingClientRect(); return { x: b.left + 40, y: b.top + 40 }; });
  await page.click(r);
  assert.equal(await places(), n + 1);
  await page.eval(() => document.querySelector('#toolbar [title^="Undo"]').click());
  await page.waitFor((c) => window.Silinx.active.petriEditor.getModel().places.length === c, [n], { what: 'undone by the main toolbar' });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});

uiTest('#2505 the Algebra editor: no Undo or Redo of its own, its menu an icon and a label', E, async (page) => {
  await makeProject(env, { name: 'BarsA', template: 'traffic' });
  await page.setViewport(1440, 900);
  await page.openProject('BarsA');
  await open(page, 'src/lamps.bool.json', 'the Algebra editor', '.tt-toolbar');
  const T = `${D} .tt-toolbar`;
  assert.equal(await page.eval((t) => [...document.querySelectorAll(`${t} button`)].filter((x) => /^(Undo|Redo)$/.test(x.title)).length, T), 0);
  await page.click(`${T} .tb-more-btn`);
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tb-more-menu button`)].map((b) => [b.textContent, !!b.querySelector('svg'), getComputedStyle(b).backgroundImage]), T),
    [['Algebra from Module…', true, 'none'], ['Handwritten Algebra…', true, 'none']]);
  await shot(page, 'algebra');
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
