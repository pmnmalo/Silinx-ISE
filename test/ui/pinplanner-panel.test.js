// UI: I/O Pin Planning in the look of the diagram editors (#2671, web/js/pinplanner.js): their toolbar (flat buttons,
// an icon and a label), their side panel for the board's resources: a title whose button folds it to a strip
// (remembered), each group of resources folded by its title (kept when the panel is drawn again), over the table on a
// narrow window, shown and hidden by the toolbar's ☰ Board Resources; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = `library ieee; use ieee.std_logic_1164.all;
entity top is port (clk : in std_logic; sw : in std_logic_vector(1 downto 0); led : out std_logic_vector(1 downto 0)); end top;
architecture rtl of top is begin led <= sw; end rtl;
`;
const P = '.doc:not([hidden]) .pin-planner';

uiTest('#2671 I/O Pin Planning: the diagram editors\' toolbar and side panel: Board Resources folded to a strip and remembered, its groups folded, over the table on a narrow window; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'PinPanel', board: 'basys2', files: { 'src/top.vhd': TOP }, top: 'top' });
  await page.setViewport(1366, 768);
  await page.eval(async () => {
    const [{ prefKey }, { RESOURCES_KEY }] = await Promise.all([import('/js/prefs.js'), import('/js/narrow.js')]);
    localStorage.removeItem(prefKey('silinx.pins.props.folded')); localStorage.removeItem(RESOURCES_KEY);
  });
  await page.openProject('PinPanel');
  const open = async () => {
    await page.menu('Tools', 'I/O Pin Planning');
    await page.waitFor((p) => window.Silinx.active?.id === 'pins' && document.querySelectorAll(`${p} .pp-table tr`).length === 6, [P], { what: 'the planner' });
  };
  await open();
  const look = () => page.eval((p) => {
    const pp = document.querySelector(p), side = pp.querySelector('.pp-side'), shown = (e) => !!e && e.getClientRects().length > 0;
    return {
      buttons: [...pp.querySelectorAll('.pp-bar .asm-btn')].filter(shown).map((b) => `${b.querySelector('svg') ? '[icon] ' : ''}${b.textContent}${b.disabled ? ' (off)' : ''}`),
      status: pp.querySelector('.pp-status').textContent, cap: side.querySelector('.asm-cap').textContent, width: side.offsetWidth, shown: shown(side),
      over: getComputedStyle(side).position === 'absolute', folded: pp.classList.contains('props-folded'),
      groups: [...side.querySelectorAll('details.pp-grp')].map((d) => `${d.querySelector('summary').textContent}${d.open ? '' : ' (closed)'}`),
      table: pp.querySelector('.pp-table').offsetWidth,
    };
  }, P);
  // the toolbar: the diagram editors' buttons; the panel beside the table, its groups open
  let L = await look();
  assert.deepEqual(L.buttons, ['Table', 'Board', '[icon] Auto-assign from Board', '[icon] Clear All']);   // (the views, #2694)
  assert.equal(L.status, '0/5 I/Os assigned');
  assert.deepEqual({ cap: L.cap, shown: L.shown, over: L.over, folded: L.folded }, { cap: 'Board Resources', shown: true, over: false, folded: false });
  assert.deepEqual(L.groups.slice(0, 4), ['Clock', 'LEDs', 'Switches', 'Buttons']);
  const wide = L.table, width = L.width;
  // a group folded by its title: kept folded when the panel is drawn again (an assignment)
  await page.click(`${P} .pp-grp > summary`, { text: 'LEDs' });
  await page.click(`${P} .pp-bar .asm-btn`, { text: 'Auto-assign from Board' });
  await page.waitFor((p) => document.querySelector(`${p} .pp-status`).textContent === '5/5 I/Os assigned', [P], { what: 'assigned' });
  L = await look();
  assert.deepEqual(L.groups.slice(0, 3), ['Clock', 'LEDs (closed)', 'Switches']);
  assert.equal(await page.eval((p) => [...document.querySelectorAll(`${p} .pp-grp`)][1].querySelector('.res').checkVisibility(), P), false, 'the LEDs hidden');
  // folded to a strip: the table wider; remembered when the planner opens again; a click on the strip expands it
  await page.click(`${P} .pp-side .asm-fold`);
  L = await look();
  assert.ok(L.folded && L.width === 24 && L.table > wide, JSON.stringify(L));
  assert.equal(await page.eval((p) => document.querySelector(`${p} .pp-side .asm-fold`).title, P), 'Expand the Board Resources panel');
  await page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('pins'), { force: true }));
  await open();
  L = await look();
  assert.deepEqual([L.folded, L.width], [true, 24], 'remembered');
  await page.click(`${P} .pp-side`);
  L = await look();
  assert.ok(!L.folded && L.width === width, JSON.stringify(L));
  // a narrow window: the panel hidden, ☰ Board Resources in the toolbar shows it over the table (the table's size kept);
  // the left side's drawer closed (the ISE style interface's)
  await page.setViewport(900, 700);
  await page.eval(async () => (await import('/js/narrow.js')).setDrawer(false, { remember: false }));
  await page.waitFor((p) => !document.querySelector(`${p} .pp-side`).getClientRects().length, [P], { what: 'the panel hidden' });
  L = await look();
  assert.deepEqual(L.buttons.at(-1), '☰ Board Resources');
  const narrow = L.table;
  await page.click(`${P} .pp-bar .asm-btn`, { text: '☰ Board Resources' });
  L = await look();
  assert.ok(L.shown && L.over && L.table === narrow, JSON.stringify(L));
  // in Portuguese
  await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('pt')));
  await page.waitFor(() => document.documentElement.lang === 'pt');
  L = await look();
  assert.deepEqual([L.cap, L.buttons], ['Recursos da Placa', ['Tabela', 'Placa', '[icon] Atribuir Automaticamente pela Placa', '[icon] Limpar Tudo', '☰ Recursos da Placa']]);
  await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('en')));
  await page.click(`${P} .pp-bar .asm-btn`, { text: '☰ Board Resources' });
  assert.equal((await look()).shown, false, 'hidden again');
  await page.setViewport(1366, 768);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
