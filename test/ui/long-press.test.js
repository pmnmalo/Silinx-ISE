// UI: the right-click menus on a touch screen (#263). iPadOS Safari fires no 'contextmenu' on a long
// press, so a finger (or a pen) held still for half a second opens the menu a right-click opens, at
// the press's point: a Design-pane row and its badge, a document tab, a Files view row, the ISim wave
// window's canvas. A short tap does what a click does (no menu); a press that moves (a drag, a scroll)
// opens nothing; the click of the long press's release is swallowed. The presses are made of touch
// pointer events (pointerType 'touch'), as the browser of an iPad sends them.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const CNT = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity cnt is port (clk : in std_logic; q : out std_logic_vector(7 downto 0)); end cnt;
architecture rtl of cnt is
  signal r : unsigned(7 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then r <= r + 1; end if;
  end process;
  q <= std_logic_vector(r);
end rtl;
`;
const TB = `library ieee; use ieee.std_logic_1164.all;
entity tb is end tb;
architecture sim of tb is
  signal clk : std_logic := '0';
  signal q : std_logic_vector(7 downto 0);
begin
  u : entity work.cnt port map (clk => clk, q => q);
  clk <= not clk after 5 ns;
end sim;
`;

const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)\b/.test(l));
// the open menu's items (the app's menus; ISim's own)
const menuItems = (page) => page.eval(() => [...document.querySelectorAll('body > .menu-popup > .mi .lbl')].map((e) => e.textContent));
const isimItems = (page) => page.eval(() => [...document.querySelectorAll('.isim-menu-root > .isim-menu-item')].map((e) => e.querySelector('.lbl')?.textContent ?? ''));
const noMenu = (page) => page.eval(() => !document.querySelector('body > .menu-popup, .isim-menu-root'));
const closeAll = (page) => page.eval(() => { document.querySelectorAll('body > .menu-popup, .isim-menu-root').forEach((m) => m.remove()); });

// A press of a finger on the `index`th element matching `sel` (at `at`, a client point, or near its
// left end), held `ms` ms, moved `move` px on the way; then the release and the click a tap brings.
// Returns the point and whether that click reached the page.
const press = (page, sel, { index = 0, ms = 700, move = 0, at = null, type = 'touch' } = {}) => page.eval(async (s, i, hold, mv, pt, kind) => {
  const el = [...document.querySelectorAll(s)][i];
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const b = el.getBoundingClientRect();
  const x = Math.round(pt ? pt.x : b.left + Math.min(b.width / 2, 24)), y = Math.round(pt ? pt.y : b.top + b.height / 2);
  const pe = (t, dx) => new PointerEvent(t, { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: kind, isPrimary: true, clientX: x + dx, clientY: y, button: t === 'pointermove' ? -1 : 0, buttons: t === 'pointerup' ? 0 : 1 });
  const wait = (n) => new Promise((r) => setTimeout(r, n));
  el.dispatchEvent(pe('pointerdown', 0));
  if (mv) { await wait(60); el.dispatchEvent(pe('pointermove', mv / 2)); el.dispatchEvent(pe('pointermove', mv)); }
  await wait(hold);
  el.dispatchEvent(pe('pointerup', mv));
  let clicked = false;
  const seen = () => { clicked = true; };
  document.addEventListener('click', seen, true);
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x + mv, clientY: y }));
  document.removeEventListener('click', seen, true);
  return { x, y, clicked };
}, sel, index, ms, move, at, type);
const menuAt = (page, sel = 'body > .menu-popup') => page.eval((s) => { const m = document.querySelector(s); return m && { x: Math.round(parseFloat(m.style.left)), y: Math.round(parseFloat(m.style.top)) }; }, sel);
// the right-click's menu of the same element (the reference)
const rightMenu = async (page, sel, opts) => { await page.rightClick(sel, opts); const items = await menuItems(page); await page.closeMenus(); return items; };

uiTest('#263 a long press opens the right-click menu of a Design-pane row, its badge, a document tab, the HDL editor, a Processes row and a Files view row; a tap or a moving press does not', E, async (page) => {
  await makeProject(env, { name: 'TouchPj', top: 'cnt', files: { 'src/cnt.vhd': CNT } });
  await page.openProject('TouchPj');
  const row = '#hier .row .lbl';
  const idx = await page.eval(() => [...document.querySelectorAll('#hier .row .lbl')].findIndex((e) => e.textContent === 'cnt'));
  assert.ok(idx >= 0);

  // ---- a Design-pane row: the right-click's menu, at the press's point, the row selected
  const ref = await rightMenu(page, row, { index: idx });
  assert.ok(ref.includes('Remove from Project'), ref.join(' | '));
  await page.eval(() => document.querySelectorAll('#hier .row.sel').forEach((r) => r.classList.remove('sel')));
  const p = await press(page, row, { index: idx });
  assert.deepEqual(await menuItems(page), ref);
  assert.deepEqual(await menuAt(page), { x: p.x, y: p.y });
  assert.equal(p.clicked, false, 'the release\'s click swallowed');
  assert.equal(await page.eval((i) => document.querySelectorAll('#hier .row .lbl')[i].closest('.row').classList.contains('sel'), idx), true);
  // (the menu stays: a command of it runs as from the mouse)
  await closeAll(page);

  // ---- a tap: a click (the row selected), no menu
  await page.eval(() => document.querySelectorAll('#hier .row.sel').forEach((r) => r.classList.remove('sel')));
  const tap = await press(page, row, { index: idx, ms: 120 });
  assert.equal(tap.clicked, true);
  assert.equal(await noMenu(page), true);
  assert.equal(await page.eval((i) => document.querySelectorAll('#hier .row .lbl')[i].closest('.row').classList.contains('sel'), idx), true);
  // ---- a press that moves (a scroll, a drag): nothing, even held
  await press(page, row, { index: idx, move: 20 });
  assert.equal(await noMenu(page), true);
  // ---- a pen's long press as a finger's
  await press(page, row, { index: idx, type: 'pen' });
  assert.deepEqual(await menuItems(page), ref);
  await closeAll(page);
  // ---- the mouse is not concerned: held, no menu (its right button has its own)
  await press(page, row, { index: idx, type: 'mouse' });
  assert.equal(await noMenu(page), true);

  // ---- the row's badge: the badge's own menu
  const badge = await page.eval((i) => { const bs = [...document.querySelectorAll('#hier .row .badge')]; return bs.indexOf(document.querySelectorAll('#hier .row .lbl')[i].closest('.row').querySelector('.badge')); }, idx);
  assert.ok(badge >= 0);
  const badgeRef = await rightMenu(page, '#hier .row .badge', { index: badge });
  await press(page, '#hier .row .badge', { index: badge });
  assert.deepEqual(await menuItems(page), badgeRef);
  await closeAll(page);

  // ---- a document tab
  await page.treeRow('#hier', 'cnt', { dbl: true, exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#doc-tabs .tab')].some((t) => /cnt\.vhd/.test(t.textContent)), [], { what: 'the tab of cnt.vhd' });
  const tab = await page.eval(() => [...document.querySelectorAll('#doc-tabs .tab')].findIndex((t) => /cnt\.vhd/.test(t.textContent)));
  await press(page, '#doc-tabs .tab', { index: tab });
  assert.deepEqual(await menuItems(page), ['Close', 'Close Others', 'Close All']);
  await closeAll(page);
  const tabs = await page.eval(() => document.querySelectorAll('#doc-tabs .tab').length);
  await press(page, '#doc-tabs .tab', { ms: 100 });
  assert.equal(await noMenu(page), true);
  assert.equal(await page.eval(() => document.querySelectorAll('#doc-tabs .tab').length), tabs);

  // ---- the HDL editor (its text stays selectable), a Processes row
  const cmRef = await rightMenu(page, '.doc:not([hidden]) .CodeMirror-lines');
  assert.ok(cmRef.includes('Check Syntax'), cmRef.join(' | '));
  await press(page, '.doc:not([hidden]) .CodeMirror-lines');
  assert.deepEqual(await menuItems(page), cmRef);
  await closeAll(page);
  assert.notEqual(await page.eval(() => document.querySelector('.doc:not([hidden]) .CodeMirror').style.userSelect), 'none');
  const procRef = await rightMenu(page, '#procs .row');
  assert.ok(procRef.includes('Run'), procRef.join(' | '));
  await press(page, '#procs .row');
  assert.deepEqual(await menuItems(page), procRef);
  await closeAll(page);

  // ---- a Files view row
  await page.click('#left-tabs .tab[data-page=files]');
  await page.waitFor(() => [...document.querySelectorAll('#files-page tr')].some((tr) => tr.dataset.file === 'src/cnt.vhd'), [], { what: 'the Files view' });
  const fileRow = await page.eval(() => [...document.querySelectorAll('#files-page tr')].findIndex((tr) => tr.dataset.file === 'src/cnt.vhd'));
  const filesRef = await rightMenu(page, '#files-page tr', { index: fileRow });
  assert.ok(filesRef.length > 0);
  await press(page, '#files-page tr', { index: fileRow });
  assert.deepEqual(await menuItems(page), filesRef);
  await closeAll(page);
  await press(page, '#files-page tr', { index: fileRow, move: 30 });
  assert.equal(await noMenu(page), true);
  await page.click('#left-tabs .tab[data-page=design]');

  assert.deepEqual(await warnings(page), []);
});

uiTest('#263 a long press on the ISim wave window\'s canvas opens its menu (Add Marker Here …) at the press, its names and objects too; a tap or a moving press does not', E, async (page) => {
  await makeProject(env, { name: 'TouchWave', top: 'cnt', files: { 'src/cnt.vhd': CNT, 'sim/tb.vhd': TB }, roles: { 'sim/tb.vhd': 'sim' } });
  await page.openProject('TouchWave');
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb');
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && !window.Silinx.active.view.state.running && /Sim Time: 1,000,000 ps/.test(document.querySelector('.doc:not([hidden]) .isim-st-time')?.textContent || ''), [], { what: 'ISim run', timeout: 20000 });
  const waves = '.doc:not([hidden]) .isim-waves';
  const at = await page.eval((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(b.left + b.width / 3), y: Math.round(b.top + 30 + 20 + 10) }; }, waves);
  await page.rightClick(at);
  const ref = await isimItems(page);
  assert.ok(ref.includes('Add Marker Here'), ref.join(' | '));
  await closeAll(page);

  const p = await press(page, waves, { at });
  assert.deepEqual(await isimItems(page), ref);
  assert.deepEqual(await menuAt(page, '.isim-menu-root'), { x: p.x, y: p.y });
  assert.equal(p.clicked, false);
  // its command runs as from the mouse: a marker where it was pressed
  const markers = await page.eval(() => window.Silinx.active.view.state.markers.length);
  await page.click('.isim-menu-root > .isim-menu-item', { text: 'Add Marker Here' });
  assert.equal(await page.eval(() => window.Silinx.active.view.state.markers.length), markers + 1);

  await press(page, waves, { at, ms: 120 });
  assert.equal(await noMenu(page), true);
  await press(page, waves, { at, move: 40 });
  assert.equal(await noMenu(page), true);

  // the signal names' canvas: its rows' menu, the row pressed selected
  const names = '.doc:not([hidden]) .isim-names';
  const nat = await page.eval((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(b.left + 20), y: Math.round(b.top + 30 + 20 + 10) }; }, names);
  await page.eval(() => window.Silinx.active.view.state.sel.clear());
  await press(page, names, { at: nat });
  assert.ok((await isimItems(page)).length > 0);
  assert.equal(await page.eval(() => window.Silinx.active.view.state.sel.size), 1);
  await closeAll(page);

  // the objects of the instance tree: the row pressed selected, its menu
  const objs = '.doc:not([hidden]) .isim-objs tbody tr';
  await page.eval(() => window.Silinx.active.view.state.selObj?.clear());
  const objRef = await (async () => { await page.rightClick(objs); const it = await isimItems(page); await closeAll(page); return it; })();
  assert.ok(objRef.includes('Add to Wave Window'), objRef.join(' | '));
  await page.eval(() => window.Silinx.active.view.state.selObj?.clear());
  await press(page, objs);
  assert.deepEqual(await isimItems(page), objRef);
  assert.equal(await page.eval(() => window.Silinx.active.view.state.selObj.size), 1);
  await closeAll(page);

  assert.deepEqual(await warnings(page), []);
});
