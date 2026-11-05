// UI: the Board Emulator's ⋮ menu (#2846) holds menu items, as every viewer's ⋮ menu (toolbar-menu.js): no <select>,
// its choices (Engine, When hidden, Show) section titles and checkable items, a ✓ on the current option, the items of
// the Boolean algebra's menu in class and look; an option that can't be chosen disabled with its reason as its tip; ↑ / ↓ /
// Home / End move among the items, Enter chooses, Esc closes; in Portuguese too. In both interfaces
// (SILINX_UI_INTERFACE=ise).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const COUNTER = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity cnt is
  port (clk : in std_logic;
        sw  : in std_logic_vector(7 downto 0);
        led : out std_logic_vector(7 downto 0));
end cnt;
architecture rtl of cnt is
  signal q : unsigned(27 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then q <= q + 1; end if;
  end process;
  led <= std_logic_vector(q(27 downto 20)) xor sw;
end rtl;
`;
const OPS = JSON.stringify({ version: 1, name: 'ops', inputs: ['a', 'b'], outputs: ['f'], table: { f: '0110' }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' }, null, 2);

const DOC = '.doc:not([hidden])';
const MENU = `${DOC} .emu-bar .tb-more-menu`;
const running = (page, engine) => page.waitFor((e) => window.SilinxApp.findDoc('emulator')?.view?.outputs && window.SilinxApp.findDoc('emulator').view.engine === e,
  [engine], { what: `the emulator on the ${engine} engine`, timeout: 30000 });
// the menu's entries: a title (its text) or an item ([its text, ✓, disabled, role])
const entries = (page) => page.eval((m) => [...document.querySelector(m).children].map((e) => e.matches('.tb-menu-title') ? e.textContent
  : [e.lastChild.textContent, e.getAttribute('aria-checked') === 'true' && e.firstChild.textContent === '✓', e.disabled, e.getAttribute('role')]), MENU);
const openMenu = async (page) => { await page.click(`${DOC} .emu-bar .tb-more-btn`); await page.waitFor((m) => !document.querySelector(m).hidden, [MENU], { what: 'the menu open' }); };
const item = (page, value) => page.click(`${MENU} [data-value="${value}"]`);
// the look of an item (its computed style), the hover's left out
const LOOK = ['display', 'height', 'paddingLeft', 'paddingRight', 'borderTopWidth', 'borderTopStyle', 'borderRadius', 'fontFamily', 'fontSize', 'fontWeight',
  'color', 'backgroundColor', 'backgroundImage', 'cursor', 'textAlign', 'whiteSpace'];
const look = (page, sel) => page.eval((s, l) => { const e = document.querySelector(s), c = getComputedStyle(e); return { classes: e.classList.contains('tb-menu-item'), ...Object.fromEntries(l.map((k) => [k, c[k]])) }; }, sel, LOOK);

uiTest('#2846 the Board Emulator\'s ⋮ menu: menu items as the other viewers\', Engine and When hidden with a ✓ that follows, the keyboard, in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'EmuMenu', board: 'basys2', files: { 'src/cnt.vhd': COUNTER, 'src/ops.bool.json': OPS }, top: 'cnt' });
  await page.setViewport(1440, 900);
  await page.openProject('EmuMenu');
  await page.eval(() => localStorage.removeItem('silinx.emulator.hidden'));
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true);
  await page.eval(() => window.SilinxApp.openFile('src/cnt.vhd'));
  await page.menu('Tools', 'Board Emulator');
  await running(page, 'compiled');

  // menu items, never form fields: titles and checkable items, the current option checked
  assert.equal(await page.eval((m) => document.querySelectorAll(`${m} :is(select, input, label)`).length, MENU), 0, 'no form field');
  assert.deepEqual(await entries(page), [
    'Engine', ['Compiled (real speed)', true, false, 'menuitemradio'], ['Event-driven (debugging)', false, false, 'menuitemradio'],
    'When hidden', ['Pause', true, false, 'menuitemradio'], ['Keep running', false, false, 'menuitemradio']]);
  assert.equal(await page.eval((m) => document.querySelector(m).getAttribute('role'), MENU), 'menu');

  // the keyboard: opened, ↓ to the first item, ↓ ↓ (Compiled, Event-driven, Pause), End, Home, ↑ wraps; Enter chooses
  await openMenu(page);
  const focused = () => page.eval(() => document.activeElement?.dataset.value ?? null);
  await page.key('ArrowDown');
  assert.equal(await focused(), 'compiled');
  await page.key('ArrowDown');
  await page.key('ArrowDown');
  assert.equal(await focused(), 'pause');
  await page.key('End');
  assert.equal(await focused(), 'run');
  await page.key('Home');
  assert.equal(await focused(), 'compiled');
  await page.key('ArrowUp');
  assert.equal(await focused(), 'run', '↑ from the first: the last');
  await page.key('Enter');
  assert.equal(await page.eval((m) => document.querySelector(m).hidden, MENU), true, 'chosen: the menu closed');
  assert.equal(await page.eval(() => localStorage.getItem('silinx.emulator.hidden')), 'run');
  assert.deepEqual((await entries(page)).slice(3), ['When hidden', ['Pause', false, false, 'menuitemradio'], ['Keep running', true, false, 'menuitemradio']], 'the ✓ follows');
  await openMenu(page);
  await page.key('Escape');
  assert.equal(await page.eval((m) => document.querySelector(m).hidden, MENU), true, 'Esc closes');

  // Keep running: it runs while the page is hidden; Pause: held
  const setHidden = (on) => page.eval((h) => {
    if (h) Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    else delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  }, on);
  const held = () => page.eval(() => window.SilinxApp.findDoc('emulator').view.held);
  await setHidden(true);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await held(), false, 'Keep running: not held while hidden');
  await setHidden(false);
  await openMenu(page);
  await item(page, 'pause');
  await setHidden(true);
  await page.waitFor(() => window.SilinxApp.findDoc('emulator').view.held, [], { what: 'Pause: held while hidden' });
  await setHidden(false);

  // the engine: Event-driven, then Compiled again; the ✓ follows (the emulator opened again on it)
  await openMenu(page);
  await item(page, 'event');
  await running(page, 'event');
  assert.deepEqual((await entries(page)).slice(0, 3), ['Engine', ['Compiled (real speed)', false, false, 'menuitemradio'], ['Event-driven (debugging)', true, false, 'menuitemradio']]);
  await openMenu(page);
  await item(page, 'compiled');
  await running(page, 'compiled');
  assert.deepEqual((await entries(page)).slice(0, 3), ['Engine', ['Compiled (real speed)', true, false, 'menuitemradio'], ['Event-driven (debugging)', false, false, 'menuitemradio']]);

  // the look: the class and the computed style of the Boolean algebra's menu items (open, the mouse elsewhere)
  await openMenu(page);
  await page.eval((m) => document.activeElement?.blur(), MENU);
  const emuLook = await look(page, `${MENU} [data-value="event"]`);
  await page.key('Escape');
  await page.eval(() => window.SilinxApp.openTt('src/ops.bool.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/ops.bool.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
  await page.click(`${DOC} .tt-toolbar .tb-more-btn`);
  const ttLook = await look(page, `${DOC} .tt-toolbar .tb-more-menu .tt-menu-item`);
  await page.key('Escape');
  assert.deepEqual(emuLook, ttLook);
  assert.equal(emuLook.classes, true);

  // in Portuguese: the titles, the items, their tips
  await page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('tt:src/ops.bool.json')));
  await page.eval(() => window.SilinxApp.S.docs.find((d) => d.id === 'emulator').tab.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })));
  await page.eval(TEXTS);
  await openMenu(page);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await setLang('en');
  const en = await page.eval((m) => window.__uiTexts(document.querySelector(m)), MENU);
  await setLang('pt');
  const pt = await page.eval((m) => window.__uiTexts(document.querySelector(m)), MENU);
  for (const t of ['Motor', 'Compilado (velocidade real)', 'Por eventos (depuração)', 'Quando oculto', 'Pausa', 'Continuar a executar'])
    assert.ok(pt.includes(t), `${t}: ${pt.join(' | ')}`);
  assert.deepEqual(untranslated(en, pt), []);
  await setLang('en');
  await page.key('Escape');
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
  assert.deepEqual(page.dialogs, []);
});

uiTest('#2846 the emulator\'s menu: Compiled disabled when the design is not compiled, its reason its tip', E, async (page) => {
  // (the toolbar alone, as the emulator mounts it, the compiled engine refused)
  const r = await page.eval(async () => {
    const { mountEmuToolbar } = await import('/js/emulator-toolbar.js');
    const box = document.body.appendChild(document.createElement('div'));
    const chosen = [];
    const t = mountEmuToolbar({ container: box, engine: { onChange: (e) => chosen.push(e) }, model: null, timing: null, title: '', compiled: () => null,
      engineNote: () => 'more than one clock on the board (clk, clk2)', powerCycle() {}, running: () => false, setRunning() {}, speed: () => 'real', step() {},
      visibility() {}, whenHidden: () => 'pause', setSpeed() {}, setWhenHidden() {} });
    const c = t.menu.querySelector('[data-value=compiled]'), ev = t.menu.querySelector('[data-value=event]');
    c.click();
    const out = { disabled: c.disabled, tip: c.title, checked: [c.getAttribute('aria-checked'), ev.getAttribute('aria-checked')], chosen, selects: t.menu.querySelectorAll('select').length };
    box.remove();
    return out;
  });
  assert.deepEqual(r, { disabled: true, tip: 'Not compiled: more than one clock on the board (clk, clk2)', checked: ['false', 'true'], chosen: [], selects: 0 });
});
