// UI (#2505): the drawing editors' toolbars and side panels as the Schematic editor's, in both interfaces: flat buttons
// of the same height, the same bar, no second Undo / Redo or Print, no note of the HDL in sync; the Petri net's zooms;
// the Algebra editor's menu an icon and a label; the main toolbar's Undo still undoes an edit; the side panels folded as
// the schematic's, remembered per editor, in Portuguese. No warnings.
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
    assert.deepEqual(await sideLook(`${D} .asm-side`, `${D} .asm-side .asm-cap`), refSide, `${name}: the side panel`);
    assert.equal(await page.eval((d) => document.querySelector(`${d} .asm-side .asm-cap`).textContent, D), 'Properties');
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
  const zoom = () => page.eval((d) => parseInt(document.querySelector(`${d} .pn-toolbar .asm-zoom`).textContent, 10), D);
  const moved = (cmp, z, what) => page.waitFor((d, c, v) => { const k = parseInt(document.querySelector(`${d} .pn-toolbar .asm-zoom`).textContent, 10); return c === 'in' ? k > v : k < v; }, [D, cmp, z], { what });
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
  await page.waitFor(() => !document.querySelector('#toolbar [data-cmd=undo]').disabled, [], { what: 'the main toolbar\'s Undo enabled' });
  await page.click('#toolbar [data-cmd=undo]');
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

uiTest('#2505 the Petri net, FSM and ASM side panels fold to a strip and expand, as the schematic\'s; remembered; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'BarsF', template: 'traffic', files: { 'src/net.pn.json': JSON.stringify(newPetri('net')) } });
  await makeProject(env, { name: 'BarsFB', template: 'blinky' });
  await page.setViewport(1440, 900);
  const state = () => page.eval((d) => {
    const e = document.querySelector(`${d} .asm-editor`), b = e.querySelector('.asm-side .asm-fold');
    return { folded: e.classList.contains('props-folded'), side: Math.round(e.querySelector('.asm-side').getBoundingClientRect().width), title: b.title,
      expanded: b.getAttribute('aria-expanded'), shown: [...e.querySelectorAll('.asm-side > :not(.asm-cap)')].some((x) => x.getClientRects().length), cap: e.querySelector('.asm-side .asm-cap').textContent };
  }, D);
  for (const [pj, file, name, bar] of [['BarsF', 'src/traffic.fsm.json', 'fsm', '.fsm-toolbar'], ['BarsF', 'src/net.pn.json', 'petri', '.pn-toolbar'], ['BarsFB', 'src/speed_ctrl.asm.json', 'asm', '.asm-chart-toolbar']]) {
    if (await page.eval(() => window.SilinxApp.S.project?.name) !== pj) await page.openProject(pj);
    await open(page, file, name, bar);
    const canvas = () => page.eval((d) => Math.round(document.querySelector(`${d} .asm-canvas-wrap`).getBoundingClientRect().width), D);
    const c0 = await canvas();
    assert.deepEqual(await state(), { folded: false, side: 250, title: 'Collapse the Properties panel', expanded: 'true', shown: true, cap: 'Properties' }, name);
    await page.click(`${D} .asm-side .asm-fold`);
    assert.deepEqual(await state(), { folded: true, side: 24, title: 'Expand the Properties panel', expanded: 'false', shown: false, cap: 'Properties' }, name);
    assert.ok(Math.abs(await canvas() - (c0 + 226)) <= 2, `${name}: the canvas wider`);
    if (name === 'fsm') await shot(page, 'fsm-folded');
    // remembered: closed and opened again, still folded; a click on the strip expands it
    await page.eval(() => window.SilinxApp.closeDoc(window.Silinx.active));
    await page.waitFor((f) => !window.Silinx.active?.id?.endsWith(f), [file], { what: `${name} closed` });
    await open(page, file, name, bar);
    assert.equal((await state()).folded, true, `${name}: remembered`);
    if (name === 'asm') {
      await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
      assert.equal(await page.eval((d) => document.querySelector(`${d} .asm-side .asm-fold`).title, D), 'Expandir o painel das propriedades');
      await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
    }
    await page.click(`${D} .asm-side`);
    assert.equal((await state()).folded, false, `${name}: expanded by a click on the strip`);
  }
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });

// (#2763) every editor's status line: its last line, the Schematic editor's look, what it says; its toolbar says none of it
uiTest('#2763 the drawing editors\' status line, as the Schematic\'s: their counts and encoding there, not in their toolbars; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'StatT', template: 'traffic', files: { 'src/net.pn.json': JSON.stringify(newPetri('net')) } });
  await makeProject(env, { name: 'StatB', template: 'blinky' });
  await makeProject(env, { name: 'StatG', template: 'gates' });
  await page.setViewport(1440, 900);
  const line = (page, root) => page.eval((r) => {
    const el = document.querySelector(r), st = el.querySelectorAll('.doc-status'), c = getComputedStyle(st[0]);
    return { n: st.length, last: el.lastElementChild === st[0], fields: [...st[0].querySelectorAll('.ds-f')].map((f) => f.textContent),
      look: { h: c.height, font: c.fontSize, border: c.borderTopStyle, bg: c.backgroundColor }, toolbar: el.querySelector(':scope > [class*=toolbar]').querySelectorAll('.asm-info, .fsm-info').length };
  }, root);
  await page.openProject('StatG');
  await open(page, 'src/gates.sch.json', 'the schematic', '.se-toolbar');
  const sch = await line(page, `${D} .sch-editor`);
  assert.deepEqual({ ...sch, fields: undefined }, { n: 1, last: true, fields: undefined, look: sch.look, toolbar: 0 });
  assert.match(sch.fields.join(' | '), /^\d+ symbols?, \d+ nets \| X -?\d+ Y -?\d+ \| \d+%$/);
  const want = {
    fsm: ['src/traffic.fsm.json', '.fsm-editor', ['7 state(s), 8 transition(s)', 'Moore', 'Encoding: Binary'], ['7 estado(s), 8 transição(ões)', 'Moore', 'Codificação: Binária']],
    petri: ['src/net.pn.json', '.petri-editor', ['2 places · 2 transitions · 4 arcs', '1 token'], ['2 lugares · 2 transições · 4 arcos', '1 marca']],
    tt: ['src/lamps.bool.json', '.tt-editor', null, null],
    asm: ['src/speed_ctrl.asm.json', '.asm-editor:not(.fsm-editor):not(.petri-editor)', null, null],
  };
  for (const [name, [file, root, en, pt]] of Object.entries(want)) {
    const pj = name === 'asm' ? 'StatB' : 'StatT';
    if (await page.eval(() => window.SilinxApp.S.project?.name) !== pj) await page.openProject(pj);
    await open(page, file, name, `${root} .doc-status .ds-f`);
    const s = await line(page, `${D} ${root}`);
    assert.deepEqual({ ...s, fields: undefined }, { n: 1, last: true, fields: undefined, look: sch.look, toolbar: 0 }, `${name}: one status line, the schematic's look`);
    await shot(page, `status-${name}`);
    if (en) assert.deepEqual(s.fields, en, name);
    else if (name === 'tt') assert.match(s.fields.join(' | '), /^\d+ inputs? · \d+ outputs? · \d+ rows$/);
    else assert.match(s.fields.join(' | '), /^\d+ states?(?: · \d+ every-cycle blocks?)? \| Encoding: (Binary|Gray|One-hot|Enum \/ auto)$/);
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    if (pt) await page.waitFor((r, w) => JSON.stringify([...document.querySelectorAll(`${r} .doc-status .ds-f`)].map((f) => f.textContent)) === w, [`${D} ${root}`, JSON.stringify(pt)], { what: `${name} in Portuguese` });
    else await page.waitFor((r) => /entradas?|estados?/.test(document.querySelector(`${r} .doc-status .ds-f`).textContent), [`${D} ${root}`], { what: `${name} in Portuguese` });
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });
