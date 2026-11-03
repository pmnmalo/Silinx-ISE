// UI: the Board Emulator laid out as the diagram editors (#2666): its Watch, timing generics, messages and notes in a
// side panel at the board's right (web/js/emulator-side.js), folded to a strip as their Properties (side-fold.js) and
// over the board when the emulator is narrow, shown by the bar's ☰ Properties (#2713); the engine, what it does when hidden and the modules shown in the
// toolbar's menu, the three dots at its right (web/js/emulator-toolbar.js, toolbar-menu.js); in Portuguese too.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const DOC = '.doc:not([hidden])';
const open = async (page) => {
  await page.eval(async () => (await import('/js/viewers.js')).openEmulator(window.Silinx.project.top));
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs && document.querySelector('.doc:not([hidden]) .emu-side'), [], { what: 'the Board Emulator', timeout: 60000 });
};
const close = (page) => page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('emulator')));
const forget = (page) => page.eval(async () => {
  const { prefKey } = await import('/js/prefs.js');
  localStorage.removeItem(prefKey('silinx.emulator.props.folded'));
  localStorage.removeItem(prefKey('silinx.emulator.module.vga'));
  localStorage.removeItem(prefKey('silinx.narrow.props'));
});
// where the side panel is, its width, its sections; the menu's rows and whether it is shown
const layout = (page) => page.eval((d) => {
  const emu = document.querySelector(`${d} .emu`), side = emu.querySelector('.emu-side'), main = emu.querySelector('.emu-main');
  const sr = side.getBoundingClientRect(), mr = main.getBoundingClientRect(), menu = emu.querySelector('.emu-bar .tb-more-menu');
  return {
    side: sr.left >= mr.right - 1 && sr.top < mr.bottom ? 'right' : sr.top >= mr.bottom - 1 ? 'below' : 'over', width: Math.round(sr.width),
    folded: emu.classList.contains('props-folded'), cap: side.querySelector('.asm-cap').textContent,
    sections: [...side.querySelectorAll('.emu-box h4')].filter((h) => h.getClientRects().length).map((h) => h.textContent),
    rows: [...menu.children].map((r) => r.firstChild.nodeValue), menuShown: !menu.hidden && menu.getClientRects().length > 0,
    bar: [...emu.querySelector('.emu-bar').childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue),
  };
}, DOC);

uiTest('#2666 #2713 the Board Emulator: Watch and notes in a side panel at the right, folded and remembered, over the board behind ☰ Properties when narrow; Engine, When hidden and Show in the toolbar\'s menu; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'EmuPanels', template: 'vga' });
  await page.setViewport(1440, 900);
  await page.openProject('EmuPanels');
  await forget(page);
  await open(page);
  // the side panel at the board's right; the menu closed, its rows the engine, when hidden and the modules shown; the
  // toolbar keeps the model and the clock
  let L = await layout(page);
  assert.deepEqual({ ...L, width: undefined }, { side: 'right', width: undefined, folded: false, cap: 'Properties', sections: ['Watch'],
    rows: ['Engine:', 'When hidden:', 'Show:'], menuShown: false, bar: ['Model:', 'Clock:'] });
  assert.equal(L.width, 280);
  assert.match(await page.eval((d) => document.querySelector(`${d} .emu-side > .emu-hint`).textContent, DOC), /^The design is compiled .* Shift\+click keeps a button pressed\.$/);
  // the menu: opened by its button, closed by Esc and by a click elsewhere; its fields work
  const more = `${DOC} .emu-bar .tb-more-btn`;
  await page.click(more);
  assert.equal((await layout(page)).menuShown, true);
  assert.equal(await page.eval((s) => document.querySelector(s).getAttribute('aria-expanded'), more), 'true');
  await page.eval(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal((await layout(page)).menuShown, false);
  await page.click(more);
  await page.eval((d) => document.querySelector(`${d} .emu-pcb`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), DOC);
  assert.equal((await layout(page)).menuShown, false);
  await page.eval((d) => document.querySelector(`${d} [data-module-toggle="vga"]`).click(), DOC);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .emu-vga`).style.display, DOC), 'none', 'the VGA monitor hidden from the menu');
  await page.eval((d) => document.querySelector(`${d} [data-module-toggle="vga"]`).click(), DOC);
  // folded: a strip at the right, the board's area wider; remembered when the emulator opens again; expanded by a click on it
  const mainW = () => page.eval((d) => document.querySelector(`${d} .emu-main`).clientWidth, DOC);
  const w0 = await mainW();
  await page.eval((d) => document.querySelector(`${d} .emu-side .asm-fold`).click(), DOC);
  L = await layout(page);
  assert.deepEqual([L.folded, L.width, L.side, L.sections], [true, 24, 'right', []]);
  assert.equal(await mainW(), w0 + 256);
  await close(page);
  await open(page);
  assert.equal((await layout(page)).folded, true, 'remembered');
  await page.eval((d) => document.querySelector(`${d} .emu-side`).click(), DOC);
  assert.deepEqual([(await layout(page)).folded, (await layout(page)).width], [false, 280]);
  // wide: no ☰ Properties in the bar
  const propsBtn = `${DOC} .emu-bar .emu-props-btn`;
  const btnShown = () => page.eval((s) => document.querySelector(s).getClientRects().length > 0, propsBtn);
  const sideShown = () => page.eval((d) => document.querySelector(`${d} .emu-side`).getClientRects().length > 0, DOC);
  assert.equal(await btnShown(), false, 'no ☰ Properties when wide');
  // narrow (the emulator under 900 px wide, #2713): the side panel over the board, as the diagram editors', hidden at
  // first, shown and hidden by the bar's ☰ Properties; no fold button; the board's area the whole width
  await page.setViewport(760, 900);
  await page.waitFor((d) => document.querySelector(`${d} .emu`).clientWidth < 900, [DOC], { what: 'a narrow emulator' });
  assert.deepEqual([await btnShown(), await sideShown()], [true, false]);
  assert.equal(await page.eval((d) => { const e = document.querySelector(`${d} .emu`); return Math.abs(e.querySelector('.emu-main').getBoundingClientRect().right - e.getBoundingClientRect().right) < 2; }, DOC), true, 'the board\'s area the whole width');
  await page.eval((b) => document.querySelector(b).click(), propsBtn);   // (the ISE style's drawer may be over it)
  assert.equal(await sideShown(), true);
  assert.deepEqual(await page.eval((d) => {
    const e = document.querySelector(`${d} .emu`), s = e.querySelector('.emu-side').getBoundingClientRect(), m = e.querySelector('.emu-main').getBoundingClientRect();
    return { over: s.left > m.left && s.right <= m.right + 1 && s.top >= m.top - 1, pressed: document.querySelector(`${d} .emu-bar .emu-props-btn`).getAttribute('aria-pressed') };
  }, DOC), { over: true, pressed: 'true' });
  assert.equal(await page.eval((d) => document.querySelector(`${d} .emu-side .asm-fold`).getClientRects().length, DOC), 0);
  await page.eval((b) => document.querySelector(b).click(), propsBtn);   // (the ISE style's drawer may be over it)
  assert.equal(await sideShown(), false);
  await page.setViewport(1440, 900);
  await page.waitFor((d) => document.querySelector(`${d} .emu`).clientWidth >= 900, [DOC], { what: 'a wide emulator' });
  assert.deepEqual([await btnShown(), await sideShown()], [false, true], 'wide: the panel always there');
  // in Portuguese: the panel, its fold, the menu and its rows
  await page.eval(TEXTS);
  await page.click(more);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await setLang('en');
  const en = await page.eval((d) => window.__uiTexts(document.querySelector(`${d} .emu`)), DOC);
  await setLang('pt');
  const pt = await page.eval((d) => window.__uiTexts(document.querySelector(`${d} .emu`)), DOC);
  for (const t of ['Propriedades', '@Recolher o painel das propriedades', '@Motor, quando oculto, módulos mostrados', 'Motor:', 'Quando oculto:', 'Mostrar:', 'Monitor VGA'])
    assert.ok(pt.includes(t), `${t}: ${pt.join(' | ')}`);
  assert.deepEqual(untranslated(en, pt, [/^(vga|real \(÷1\))\b/, /^\w+<\d+>$/, /^@?[A-Z_0-9]+:? /, /^@?[A-Z_0-9]+ = /, /^@?[A-Z]{2,}\d*$/]), []);
  await setLang('en');
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
