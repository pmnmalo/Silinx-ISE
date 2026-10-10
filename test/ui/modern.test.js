// UI: the modern interface (the default) and the classic Xilinx ISE one — layout, View ▸ Interface,
// light / dark theme (following the system), command palette, design-flow buttons, Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const CTRL = 2;
// these tests start from the default interface: not when the suite runs in a forced one
const O = { skip: process.env.SILINX_UI_INTERFACE ? `interface forced to '${process.env.SILINX_UI_INTERFACE}' (SILINX_UI_INTERFACE)` : undefined };
const ui = (page) => page.eval(() => ({ ui: document.documentElement.dataset.ui, theme: document.documentElement.dataset.theme }));
// relative luminance of the computed background of an element (0 = black, 1 = white)
const LUM = `window.__lum = (sel) => {
  const m = getComputedStyle(document.querySelector(sel)).backgroundColor.match(/[\\d.]+/g).map(Number);
  return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
};`;

async function subMenu(page, menu, item, sub) {
  const items = await page.openMenu(menu);
  const idx = items.findIndex((x) => x.label === item);
  assert.ok(idx >= 0, `${menu} ▸ ${item}`);
  await page.hover(await page.point('body > .menu-popup > .mi', { index: idx }));
  await page.waitForSelector('.menu-popup.sub .mi');
  const subs = await page.eval(() => [...document.querySelectorAll('.menu-popup.sub .mi')].map((r) => ({ label: r.querySelector('.lbl').textContent, checked: r.querySelector('.chk').textContent === '✓' })));
  if (sub) await page.click('.menu-popup.sub .mi', { index: subs.findIndex((s) => s.label === sub) });
  else await page.closeMenus();
  return subs;
}

uiTest('modern interface by default: header with search, activity bar, tabs on top, empty state, design-flow buttons', E, async (page) => {
  await page.waitForSelector('#start-page .start-box');
  assert.deepEqual(await ui(page), { ui: 'modern', theme: 'light' });
  const L = await page.eval(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    const vis = (sel) => { const e = document.querySelector(sel); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none'; };
    return {
      header: [r('titlebar').top === r('menubar').top || Math.abs(r('titlebar').top - r('menubar').top) < 12, r('palette-btn').top < r('toolbar').top],
      // activity bar: a column at the left of the panels
      bar: { dir: getComputedStyle(document.getElementById('left-tabs')).flexDirection, left: r('left-tabs').left < r('left-pages').left, icons: document.querySelectorAll('#left-tabs .tab-ico svg').length },
      tabsOnTop: r('doc-tabs').top < r('workspace').top,
      consoleTabsOnTop: r('console-tabs').top < r('console-body').top,
      empty: vis('#ws-empty'),
      project: document.getElementById('title-project').textContent,
      steps: [...document.querySelectorAll('#toolbar .m-step')].map((b) => [b.textContent, b.disabled]),
      hiddenIcons: [...document.querySelectorAll('#toolbar .tb-btn')].filter((b) => !b.getClientRects().length).map((b) => b.dataset.cmd),
      classicTitle: vis('#title-text'),
    };
  });
  assert.deepEqual(L.header, [true, true]);
  assert.deepEqual(L.bar, { dir: 'column', left: true, icons: 4 });
  assert.ok(L.tabsOnTop, 'document tabs above the editor');
  assert.ok(L.consoleTabsOnTop, 'Console / Errors / Warnings above the log');
  assert.ok(L.empty, 'empty state when no document is open');
  assert.equal(L.project, 'No project open');
  // without a project only Program (iMPACT) can run
  assert.deepEqual(L.steps, [['Check', true], ['Simulate', true], ['Implement', true], ['Emulate', true], ['Program', false]]);
  assert.deepEqual(L.hiddenIcons.sort(), ['asm', 'copy', 'cut', 'impact', 'paste', 'run', 'wave'], 'icons covered by the labelled steps are hidden');
  assert.equal(L.classicTitle, false);
  // a project: its name in the header chip, the empty state goes away with the first document
  await makeProject(env, { name: 'ModernPj', template: 'blinky' });
  await page.openProject('ModernPj');
  await page.waitFor(() => window.Silinx.docs.length > 0);
  assert.equal(await page.eval(() => document.getElementById('title-project').textContent), 'ModernPj');
  assert.equal(await page.eval(() => document.getElementById('ws-empty').getClientRects().length), 0);
  // the activity bar is reachable with the keyboard
  await page.eval(() => document.querySelector('#left-tabs .tab[data-page=files]').focus());
  await page.key('Enter');
  assert.equal(await page.eval(() => document.querySelector('#left-tabs .tab.active').dataset.page), 'files');
  await page.click('#left-tabs .tab[data-page=design]');
  assert.equal(await page.eval(() => document.querySelector('.left-page[data-page=design]').hidden), false);
}, O);

uiTest('View ▸ Interface: the Xilinx ISE look and back, live and remembered after a reload', E, async (page) => {
  await page.waitForSelector('#start-page .start-box');
  let subs = await subMenu(page, 'View', 'Interface');
  assert.deepEqual(subs, [{ label: 'Modern', checked: true }, { label: 'Xilinx ISE (Classic)', checked: false }]);
  await subMenu(page, 'View', 'Interface', 'Xilinx ISE (Classic)');
  await page.waitFor(() => document.documentElement.dataset.ui === 'classic');
  const C = await page.eval(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    const shown = (id) => document.getElementById(id).getClientRects().length > 0;
    return {
      title: shown('title-text'), search: shown('top-actions'), steps: document.querySelector('.m-steps').getClientRects().length,
      tabsBelow: r('doc-tabs').top > r('workspace').top, leftTabsBelow: r('left-tabs').top > r('left-pages').top,
      icons: [...document.querySelectorAll('#toolbar .tb-btn')].filter((b) => !b.getClientRects().length).length,
      stored: localStorage.getItem('silinx.ui'),
    };
  });
  assert.deepEqual(C, { title: true, search: false, steps: 0, tabsBelow: true, leftTabsBelow: true, icons: 0, stored: 'classic' });
  // no Theme menu in the classic look (light only)
  assert.ok(!(await page.openMenu('View')).some((x) => x.label === 'Theme'));
  await page.closeMenus();
  // remembered: the page loads in the classic look
  await page.reload();
  assert.deepEqual(await ui(page), { ui: 'classic', theme: 'light' });
  subs = await subMenu(page, 'View', 'Interface');
  assert.deepEqual(subs.map((s) => s.checked), [false, true]);
  await subMenu(page, 'View', 'Interface', 'Modern');
  await page.waitFor(() => document.documentElement.dataset.ui === 'modern');
  assert.ok((await page.openMenu('View')).some((x) => x.label === 'Theme'));
  await page.closeMenus();
}, O);

uiTest('theme: follows the system, View ▸ Theme ▸ Dark / Light / System, header button; remembered', E, async (page) => {
  await page.waitForSelector('#start-page .start-box');
  await page.eval(LUM);
  assert.ok(await page.eval(() => window.__lum('body')) > 0.9, 'light by default');
  // the system switches to dark: the page follows (theme = System)
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await page.waitFor(() => document.documentElement.dataset.theme === 'dark', [], { what: 'dark from the system' });
  assert.ok(await page.eval(() => window.__lum('body')) < 0.15, 'dark background');
  assert.ok(await page.eval(() => window.__lum('#topbar')) < 0.15, 'dark header');
  assert.equal(await page.eval(() => getComputedStyle(document.documentElement).colorScheme), 'dark');
  // View ▸ Theme ▸ Light: fixed, whatever the system says
  let subs = await subMenu(page, 'View', 'Theme');
  assert.deepEqual(subs, [{ label: 'System', checked: true }, { label: 'Light', checked: false }, { label: 'Dark', checked: false }]);
  await subMenu(page, 'View', 'Theme', 'Light');
  await page.waitFor(() => document.documentElement.dataset.theme === 'light');
  assert.equal(await page.eval(() => localStorage.getItem('silinx.theme')), 'light');
  // the header button switches between light and dark
  await page.click('#theme-btn');
  await page.waitFor(() => document.documentElement.dataset.theme === 'dark');
  assert.equal(await page.eval(() => localStorage.getItem('silinx.theme')), 'dark');
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  assert.equal((await ui(page)).theme, 'dark', 'a chosen theme ignores the system');
  // remembered, and set before the first paint (the early script of index.html)
  await page.reload();
  assert.equal((await ui(page)).theme, 'dark');
  // an editor in the dark theme: dark CodeMirror
  await makeProject(env, { name: 'DarkPj', template: 'blinky' });
  await page.openProject('DarkPj');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitForSelector('.doc:not([hidden]) .CodeMirror');
  await page.eval(LUM);
  assert.ok(await page.eval(() => window.__lum('.doc:not([hidden]) .CodeMirror')) < 0.15, 'dark editor');
  // back to System
  await subMenu(page, 'View', 'Theme', 'System');
  await page.waitFor(() => document.documentElement.dataset.theme === 'light');
  assert.equal(await page.eval(() => localStorage.getItem('silinx.theme')), 'system');
}, O);

uiTest('command palette: Ctrl+K, search, arrow keys, Enter runs a command or opens a file, Escape, header button', E, async (page) => {
  await makeProject(env, { name: 'PalPj', template: 'blinky' });
  await page.openProject('PalPj');
  await page.key('k', { modifiers: CTRL });
  await page.waitForSelector('.pal-overlay .pal-input');
  assert.equal(await page.eval(() => document.activeElement.className), 'pal-input');
  const all = await page.eval(() => document.querySelectorAll('.pal-item').length);
  assert.ok(all > 20, `${all} commands and files`);
  assert.equal(await page.eval(() => document.querySelector('.pal-input').getAttribute('aria-activedescendant')), 'pal-0');
  // a command: About
  await page.type('about');
  await page.waitFor(() => document.querySelector('.pal-item.sel .pal-label')?.textContent === 'About Silinx ISE', [], { what: 'About first' });
  await page.key('Enter');
  await page.waitDialog('About Silinx ISE');
  assert.equal(await page.eval(() => document.querySelectorAll('.pal-overlay').length), 0);
  await page.key('Escape');
  await page.waitNoDialog();
  // a file: arrows move the selection, Enter opens it
  await page.click('#palette-btn');
  await page.waitForSelector('.pal-overlay .pal-input');
  await page.type('top');
  await page.waitFor(() => [...document.querySelectorAll('.pal-item')].some((e) => e.classList.contains('pal-file')));
  const files = await page.eval(() => [...document.querySelectorAll('.pal-item')].map((e, i) => [i, e.classList.contains('pal-file'), e.querySelector('.pal-label').textContent]));
  const target = files.find(([, f, l]) => f && l === 'src/top.vhd');
  assert.ok(target, `src/top.vhd listed: ${JSON.stringify(files)}`);
  for (let i = 0; i < target[0]; i++) await page.key('ArrowDown');
  assert.equal(await page.eval(() => document.querySelector('.pal-item.sel .pal-label').textContent), 'src/top.vhd');
  await page.key('Enter');
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd', [], { what: 'top.vhd open' });
  // nothing found; Escape closes; a click outside closes
  await page.key('k', { modifiers: CTRL });
  await page.waitForSelector('.pal-overlay');
  await page.type('qqqzzz');
  await page.waitFor(() => !document.querySelector('.pal-empty').hidden);
  assert.equal(await page.eval(() => document.querySelector('.pal-empty').textContent), 'No matching commands or files');
  await page.key('Escape');
  await page.waitFor(() => !document.querySelector('.pal-overlay'));
  await page.key('p', { modifiers: CTRL | 8 });   // Ctrl+Shift+P
  await page.waitForSelector('.pal-overlay');
  await page.click({ x: 20, y: 600 });
  await page.waitFor(() => !document.querySelector('.pal-overlay'));
  // disabled menu items are not offered; a checked item shows its mark
  await page.key('k', { modifiers: CTRL });
  await page.waitForSelector('.pal-overlay');
  await page.type('implementation');
  const impl = await page.eval(() => [...document.querySelectorAll('.pal-item')].map((e) => [e.querySelector('.pal-kind').textContent, e.querySelector('.pal-label').textContent, !!e.querySelector('.pal-check')]));
  assert.deepEqual(impl[0], ['View', 'Implementation', true]);
  await page.key('Escape');
  // not while a dialog is open
  await page.menu('Help', 'Keyboard Shortcuts');
  await page.waitDialog('Keyboard Shortcuts');
  assert.match(await page.eval(() => document.querySelector('.dlg-body').textContent), /Ctrl\/Cmd\+KCommand palette/);
  await page.key('k', { modifiers: CTRL });
  assert.equal(await page.eval(() => document.querySelectorAll('.pal-overlay').length), 0);
  await page.key('Escape');
}, O);

uiTest('design-flow buttons: Check, Simulate and Emulate act on the selected / top module, also while implementing', E, async (page) => {
  await makeProject(env, { name: 'FlowPj', template: 'blinky' });
  await page.openProject('FlowPj');
  await page.waitFor(() => !document.querySelector('#toolbar .m-step').disabled, [], { what: 'Check enabled' });
  const step = async (label) => page.click('#toolbar .m-step', { text: label });
  await step('Check');
  await page.waitConsole(/Process "Check Syntax" completed successfully/);
  await page.waitFor(() => !window.Silinx.busy);
  await step('Simulate');
  await page.waitFor(() => window.Silinx.docs.some((d) => d.id === 'isim'), [], { what: 'ISim open', timeout: 20000 });
  await page.waitFor(() => !window.Silinx.busy);
  await step('Emulate');
  await page.waitFor(() => window.Silinx.docs.some((d) => /^Board Emulator/.test(d.title)), [], { what: 'emulator open', timeout: 20000 });
  // while an implementation runs only Implement waits (one ISE build at a time); the others still work
  const states = () => page.eval(() => [...document.querySelectorAll('#toolbar .m-step')].map((b) => [b.textContent, b.disabled]));
  await page.eval(() => { window.Silinx.busy = true; });
  await page.waitFor(() => [...document.querySelectorAll('#toolbar .m-step')].find((b) => b.textContent === 'Implement').disabled, [], { what: 'Implement disabled while implementing' });
  assert.deepEqual(await states(), [['Check', false], ['Simulate', false], ['Implement', true], ['Emulate', false], ['Program', false]]);
  await page.eval(() => { document.getElementById('console-log').innerHTML = ''; });
  await step('Check');
  await page.waitConsole(/Process "Check Syntax" completed successfully/);
  await page.eval(() => { window.Silinx.busy = false; });
  await page.waitFor(() => !document.querySelectorAll('#toolbar .m-step')[2].disabled, [], { what: 'Implement enabled again' });
}, O);

uiTest('Portuguese: the modern header, buttons, empty state and palette are translated', E, async (page) => {
  await page.waitForSelector('#start-page .start-box');
  await page.eval(TEXTS);
  const en = await page.eval(() => window.__uiTexts(document.getElementById('app')));
  await subMenu(page, 'View', 'Language', 'Português');
  await page.waitFor(() => document.documentElement.lang === 'pt');
  const pt = await page.eval(() => window.__uiTexts(document.getElementById('app')));
  assert.deepEqual(untranslated(en, pt), []);
  const T = await page.eval(() => ({
    search: document.querySelector('.m-search-text').textContent,
    steps: [...document.querySelectorAll('#toolbar .m-step')].map((b) => b.textContent),
    project: document.getElementById('title-project').textContent,
    empty: document.querySelector('#ws-empty p').textContent,
    theme: document.getElementById('theme-btn').getAttribute('title'),
  }));
  assert.deepEqual(T, {
    search: 'Procurar comandos e ficheiros…', steps: ['Verificar', 'Simular', 'Implementar', 'Emular', 'Programar'], project: 'Nenhum projeto aberto',
    empty: 'Abra uma fonte no painel Projeto, ou procure qualquer comando ou ficheiro.', theme: 'Alternar entre tema claro e escuro',
  });
  const subs = await subMenu(page, 'Ver', 'Interface');
  assert.deepEqual(subs.map((s) => s.label), ['Moderna', 'Xilinx ISE (Clássica)']);
  // the palette in Portuguese: found by the Portuguese and by the English name
  await page.key('k', { modifiers: CTRL });
  await page.waitForSelector('.pal-overlay');
  assert.equal(await page.eval(() => document.querySelector('.pal-input').placeholder), 'Procurar comandos e ficheiros…');
  await page.type('acerca');
  await page.waitFor(() => /Acerca/.test(document.querySelector('.pal-item.sel .pal-label')?.textContent || ''), [], { what: 'Acerca found' });
  await page.eval(() => { const i = document.querySelector('.pal-input'); i.value = ''; i.dispatchEvent(new Event('input')); });
  await page.type('about');
  await page.waitFor(() => /Acerca/.test(document.querySelector('.pal-item.sel .pal-label')?.textContent || ''), [], { what: 'About found in Portuguese' });
  assert.match(await page.eval(() => document.querySelector('.pal-foot').textContent), /para navegar.*para executar.*para fechar/);
  await page.key('Escape');
}, O);
