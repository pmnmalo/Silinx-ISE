// UI: the modern interface (the default, its layout by tasks: #1149) and the classic Xilinx ISE one — layout,
// View ▸ Interface, light / dark theme (following the system), command palette, Portuguese.
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

// #1149: the modern interface is the Tasks one (its layout by tasks, data-layout="tasks"): the header with the search and
// the task switcher, Design's pages as tabs above its panel, the document and console tabs on top, the task's empty state
uiTest('modern interface by default: the Tasks layout, header with search and the tasks, Design\'s tabs on top, tabs on top, empty state', E, async (page) => {
  await page.waitForSelector('#start-page .start-box');
  assert.deepEqual(await ui(page), { ui: 'modern', theme: 'light' });
  const L = await page.eval(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    const vis = (sel) => { const e = document.querySelector(sel); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none'; };
    return {
      layout: [document.documentElement.dataset.layout, document.documentElement.dataset.task],
      header: [Math.abs(r('titlebar').top - r('menubar').top) < 12, r('palette-btn').top < r('toolbar').top],
      tasks: [...document.querySelectorAll('#task-switch .task-btn')].map((b) => b.textContent.trim()),
      // Design's pages: a row of tabs above its panel
      pages: { dir: getComputedStyle(document.getElementById('left-tabs')).flexDirection, above: r('left-tabs').top < r('left-pages').top, icons: document.querySelectorAll('#left-tabs .tab-ico svg').length },
      tabsOnTop: r('doc-tabs').top < r('workspace').top,
      consoleTabsOnTop: r('console-tabs').top < r('console-body').top,
      empty: [vis('#task-empty'), document.querySelector('#task-empty h2')?.textContent],
      project: document.getElementById('title-project'),
      titlebar: document.getElementById('titlebar').innerText,
      classicTitle: vis('#title-text'),
    };
  });
  assert.deepEqual(L.layout, ['tasks', 'edit']);
  assert.deepEqual(L.header, [true, true]);
  assert.deepEqual(L.tasks, ['Design', 'Simulate', 'Emulate', 'Implement']);   // (no Program: Implement's, #1172)
  assert.deepEqual(L.pages, { dir: 'row', above: true, icons: await page.eval(() => document.querySelectorAll('#left-tabs .tab').length) });
  assert.ok(L.tabsOnTop, 'document tabs above the editor');
  assert.ok(L.consoleTabsOnTop, 'Console / Errors / Warnings above the log');
  assert.deepEqual(L.empty, [true, 'Design'], 'the task\'s empty state when no document is open');
  assert.equal(L.project, null, 'no project chip in the header (#1042)');
  assert.doesNotMatch(L.titlebar, /Silinx|\d+\.\d+\.\d+/, 'no product and version in the header (#987)');
  assert.equal(L.classicTitle, false);
  // a project: Design's empty state goes away with its first document
  await makeProject(env, { name: 'ModernPj', template: 'blinky' });
  await page.openProject('ModernPj');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd' && window.Silinx.active.editor, [], { what: 'the editor' });
  assert.equal(await page.eval(() => document.getElementById('task-empty').getClientRects().length), 0);
  // Design's pages are reachable with the keyboard
  await page.eval(() => document.querySelector('#left-tabs .tab[data-page=files]').focus());
  await page.key('Enter');
  assert.equal(await page.eval(() => document.querySelector('#left-tabs .tab.active').dataset.page), 'files');
  await page.leftTab('design');
  assert.equal(await page.eval(() => document.querySelector('.left-page[data-page=design]').hidden), false);
}, O);

uiTest('View ▸ Interface: the Xilinx ISE look and back, live and remembered after a reload', E, async (page) => {
  await page.waitForSelector('#start-page .start-box');
  let subs = await subMenu(page, 'View', 'Interface');
  // (Modern, the Tasks layout, and Classic: #1149)
  assert.deepEqual(subs, [{ label: 'Modern', checked: true }, { label: 'Classic', checked: false }]);
  await subMenu(page, 'View', 'Interface', 'Classic');
  await page.waitFor(() => document.documentElement.dataset.ui === 'classic');
  const C = await page.eval(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    const shown = (id) => document.getElementById(id).getClientRects().length > 0;
    return {
      title: shown('title-text'), search: shown('top-actions'), tasks: document.getElementById('task-switch')?.getClientRects().length ?? 0,
      tabsBelow: r('doc-tabs').top > r('workspace').top, leftTabsBelow: r('left-tabs').top > r('left-pages').top,
      icons: [...document.querySelectorAll('#toolbar .tb-btn')].filter((b) => !b.getClientRects().length).length,
      stored: localStorage.getItem('silinx.ui'),
    };
  });
  assert.deepEqual(C, { title: true, search: false, tasks: 0, tabsBelow: true, leftTabsBelow: true, icons: 0, stored: 'classic' });
  // no Theme menu in the classic look (light only)
  assert.ok(!(await page.openMenu('View')).some((x) => x.label === 'Theme'));
  await page.closeMenus();
  // remembered: the page loads in the classic look
  await page.reload();
  assert.deepEqual(await ui(page), { ui: 'classic', theme: 'light' });
  subs = await subMenu(page, 'View', 'Interface');
  assert.deepEqual(subs.map((s) => s.checked), [false, true]);
  await subMenu(page, 'View', 'Interface', 'Modern');
  await page.waitFor(() => document.documentElement.dataset.ui === 'modern' && document.documentElement.dataset.layout === 'tasks' && document.getElementById('task-switch'));
  assert.ok((await page.openMenu('View')).some((x) => x.label === 'Theme'));
  await page.closeMenus();
}, O);

// #987: neither interface's header shows the product and version (Silinx ISE 15.12.0): the classic title bar the project
// and its document, the modern header the logo and the project; the product and version the logo's tooltip and the
// window's title
uiTest('#987 the header: the project and its document, not the product and version, in the modern and classic interfaces', E, async (page) => {
  const head = () => page.eval(() => ({ text: document.getElementById('titlebar').innerText.replace(/\s+/g, ' ').trim(),
    logo: document.querySelector('#titlebar .app-logo').title, window: document.title }));
  for (const look of ['Classic', 'Modern']) {
    await subMenu(page, 'View', 'Interface', look);
    await page.waitFor((l) => document.documentElement.dataset.ui === l, [look.toLowerCase()]);
    const none = await head();
    assert.doesNotMatch(none.text, /Silinx|\d+\.\d+\.\d+/, look);
    assert.match(none.logo, /^Silinx ISE \S/, look);
    assert.match(none.window, /^Silinx ISE \S.* Project Navigator$/, look);
    if (look === 'Classic') assert.equal(none.text, 'S Project Navigator');
  }
  await makeProject(env, { name: 'HeadPj', template: 'gates' });
  await page.openProject('HeadPj');
  for (const look of ['Classic', 'Modern']) {
    await subMenu(page, 'View', 'Interface', look);
    await page.waitFor((l) => document.documentElement.dataset.ui === l, [look.toLowerCase()]);
    const pj = await head();
    assert.doesNotMatch(pj.text, /Silinx|\d+\.\d+\.\d+/, look);
    assert.match(pj.window, /^HeadPj — Silinx ISE \S/, look);
    assert.match(pj.text, look === 'Classic' ? /^S HeadPj - \[.+\]$/ : /^S$/, look);   // (modern: no project chip, #1042; the project in the window's title and in Design)
  }
  // in Portuguese the classic title bar's Design Summary too (#1007)
  await subMenu(page, 'View', 'Interface', 'Classic');
  await page.waitFor(() => document.documentElement.dataset.ui === 'classic');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.getElementById('title-text').textContent === 'HeadPj - [Resumo do Projeto]', [], { what: 'Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await subMenu(page, 'View', 'Interface', 'Modern');
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
  // an editor in the dark theme: a dark editor
  await makeProject(env, { name: 'DarkPj', template: 'blinky' });
  await page.openProject('DarkPj');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitForSelector('.doc:not([hidden]) .cm-editor');
  await page.eval(LUM);
  assert.ok(await page.eval(() => window.__lum('.doc:not([hidden]) .cm-editor')) < 0.15, 'dark editor');
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

uiTest('Portuguese: the modern header, buttons, empty state and palette are translated', E, async (page) => {
  await page.waitForSelector('#start-page .start-box');
  await page.eval(TEXTS);
  const en = await page.eval(() => window.__uiTexts(document.getElementById('app')));
  await subMenu(page, 'View', 'Language', 'Português');
  await page.waitFor(() => document.documentElement.lang === 'pt');
  const pt = await page.eval(() => window.__uiTexts(document.getElementById('app')));
  // (the first task's name, Design, is the same in Portuguese: #1046)
  assert.deepEqual(untranslated(en, pt).filter((t) => !/^@?Design$/.test(t)), []);
  const T = await page.eval(() => ({
    search: document.querySelector('.m-search-text').textContent,
    tasks: [...document.querySelectorAll('#task-switch .task-btn')].map((b) => b.textContent.trim()),
    empty: document.querySelector('#task-empty p').textContent,
    theme: document.getElementById('theme-btn').getAttribute('title'),
  }));
  assert.deepEqual(T, {
    // ('Design' in Portuguese too, #1046)
    search: 'Procurar comandos e ficheiros…', tasks: ['Design', 'Simular', 'Emular', 'Implementar'],
    empty: 'Abra uma fonte no painel Projeto, ou verifique o projeto.', theme: 'Alternar entre tema claro e escuro',
  });
  const subs = await subMenu(page, 'Ver', 'Interface');
  assert.deepEqual(subs.map((s) => s.label), ['Moderna', 'Clássica']);
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
