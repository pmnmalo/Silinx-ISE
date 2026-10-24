// UI: the Tasks interface (#804, web/js/tasks.js, web/css/tasks.css), the modern one since #1149: the task
// switcher in the header (a tab bar at the bottom of a narrow screen), each task with its own arrangement
// and documents (the side panel and the messages folded or open, the last document in front), a task with
// no document offering its action, a maximized document; at a laptop's and a tablet's sizes, in English and
// Portuguese; its message centre (#798: the bottom panel's sources and filters, ISim's console and command
// line in it). The classic interface is unchanged (test/ui/modern.test.js).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { newDoc, normalizeDoc, symbolPins } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
// the Tasks interface is a development build's only, for now (#838): the tests run as one; FULL has its changes'
// list, so the header also has the Development menu (#707, #839)
const DEV = { commit: 'abc1234', date: '2026-10-21 12:00' };
const FULL = { ...DEV, since: '15.11.3', changes: [
  { issue: 804, type: 'feature', title: 'A third interface, Tasks', short: [], detail: ['**Tasks (#804):** the frame.'] },
  { issue: 839, type: 'bugfix', title: 'The Tasks header in Portuguese', short: [], detail: ['**The header (#839):** it fits.'] },
] };

// the page in the Tasks interface (kept, as View ▸ Interface keeps it), booted again
async function tasksInterface(page) {
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
}
// what is shown: displayed, with a size
const shown = (page, sel) => page.eval((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0; }, sel);
// the current task, its arrangement and the tabs shown
const state = (page) => page.eval(() => {
  const d = document.documentElement.dataset;
  const vis = (e) => e.getClientRects().length > 0;
  return {
    task: d.task, side: d.side, console: d.console, max: d.max,
    current: [...document.querySelectorAll('#task-switch .task-btn[aria-current="true"]')].map((b) => b.dataset.task),
    tabs: [...document.querySelectorAll('#doc-tabs > .tab')].filter(vis).map((t) => t.querySelector('.tlabel').textContent),
    empty: vis(document.getElementById('task-empty')),
  };
});
// the page does not scroll sideways, nor does the header or the toolbar overflow
const noOverflow = (page) => page.eval(() => ({
  page: document.documentElement.scrollWidth <= innerWidth,
  over: [...document.querySelectorAll('#topbar, #toolbar, #task-tabs')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.id),
}));
// no warnings: the page's console, the Warnings tab
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}

// (#1149: the Tasks interface is the modern one: chosen as View ▸ Interface ▸ Modern, from the classic one)
uiTest('View ▸ Interface ▸ Modern: the task switcher in the header, the task\'s bar; live, remembered, and back to Classic', E, async (page) => {
  await page.setViewport(1366, 768);
  // from the classic interface (whatever interface the suite runs in: SILINX_UI_INTERFACE)
  await page.eval(() => localStorage.setItem('silinx.ui', 'classic'));
  await page.reload();
  await page.waitFor(() => window.Silinx?.startupChecked && document.querySelector('#start-page .start-box'), [], { what: 'app boot' });
  // the classic interface has none of it
  assert.ok(!(await shown(page, '#task-switch')) && !(await shown(page, '#task-bar')) && !(await shown(page, '#task-tabs')));
  assert.ok(await shown(page, '#statusbar'), 'the classic interface keeps its status bar');
  const items = await page.openMenu('View');
  await page.hover(await page.point('body > .menu-popup > .mi', { index: items.findIndex((x) => x.label === 'Interface') }));
  await page.waitForSelector('.menu-popup.sub .mi');
  const subs = await page.eval(() => [...document.querySelectorAll('.menu-popup.sub .mi .lbl')].map((l) => l.textContent));
  assert.deepEqual(subs, ['Modern', 'Classic']);
  await page.click('.menu-popup.sub .mi', { index: 0 });
  await page.waitFor(() => document.documentElement.dataset.layout === 'tasks', [], { what: 'the Tasks interface' });
  const L = await page.eval(() => ({
    ui: document.documentElement.dataset.ui, stored: localStorage.getItem('silinx.ui'),
    tasks: [...document.querySelectorAll('#task-switch .task-btn')].map((b) => b.textContent),
    bar: [...document.querySelectorAll('#task-bar [title]')].map((b) => b.title),
  }));
  assert.deepEqual(L, {
    ui: 'modern', stored: 'modern', tasks: ['Design', 'Simulate', 'Emulate', 'Implement'],   // (no Program: Implement's, #1172)
    bar: ['Show or hide the side panel', 'Show or hide the messages', 'Maximize the document (double-click its tab)', 'Close', 'The test bench to simulate', "Open the test bench's source", 'The model to simulate', 'Check'],   // (Close: a single document's, #854; the test bench, #917, and the model, #800: Simulate's)
  });
  assert.ok(await shown(page, '#task-switch'));
  assert.ok(!(await shown(page, '#task-tabs')), 'the bottom tab bar: on a narrow screen only');
  assert.ok(!(await shown(page, '#statusbar')), 'no status bar in the Tasks interface (#1039)');
  // with no project: Edit, its page says what it does; its action (Check) needs a project
  assert.deepEqual(await state(page), { task: 'edit', side: 'open', console: 'open', max: 'off', current: ['edit'], tabs: [], empty: true });
  assert.equal(await page.eval(() => document.querySelector('#task-empty button').disabled), true);
  // the theme menu (not the classic interface's)
  assert.ok((await page.openMenu('View')).some((x) => x.label === 'Theme'));
  await page.closeMenus();
  // remembered: the page loads in the Tasks interface (set before the first paint)
  await page.reload();
  await page.waitFor(() => window.Silinx?.startupChecked, [], { what: 'app boot' });
  assert.deepEqual(await page.eval(() => [document.documentElement.dataset.ui, document.documentElement.dataset.layout]), ['modern', 'tasks']);
  assert.deepEqual(await noOverflow(page), { page: true, over: [] });
  // back to Classic: none of it, its status bar again
  await page.eval(async () => (await import('/js/modern.js')).setInterface('classic'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.ok(!(await shown(page, '#task-switch')) && !(await shown(page, '#task-bar')));
  assert.ok(await shown(page, '#statusbar'), 'back in the classic interface, the status bar again');
  // (a project opened: the start-up checks' warnings, which depend on the computer, are cleared)
  await makeProject(env, { name: 'TasksMenu', template: 'gates' });
  await page.openProject('TasksMenu');
  await noWarnings(page);
}, { build: DEV });

uiTest('Tasks at 1366 × 768: each task its arrangement and documents, a task with no document offers its action, maximize', E, async (page) => {
  await makeProject(env, { name: 'TasksLaptop', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksLaptop');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitForSelector('.doc:not([hidden]) .cm-editor');
  let s = await state(page);
  assert.deepEqual([s.task, s.side, s.console, s.empty], ['edit', 'open', 'open', false]);
  assert.ok(s.tabs.includes('top.vhd'), s.tabs.join());
  assert.ok(await shown(page, '#hier') && await shown(page, '#console-body'));
  // Simulate, nothing simulated yet: its page and its action; the editor is not shown, the side panel and
  // the messages folded (the activity bar and the messages' tabs stay)
  await page.click('#task-switch .task-btn[data-task="sim"]');
  s = await state(page);
  assert.deepEqual(s, { task: 'sim', side: 'folded', console: 'folded', max: 'off', current: ['sim'], tabs: [], empty: true });
  assert.ok(!(await shown(page, '.doc .cm-editor')));
  assert.ok(!(await shown(page, '#hier')) && !(await shown(page, '#left-tabs')), 'no Design pane, no activity bar (Edit\'s, #876)');
  assert.ok(!(await shown(page, '#console-body')) && await shown(page, '#console-tabs'));
  assert.equal(await page.eval(() => document.querySelector('#task-empty h2').textContent), 'Simulate');
  // its action: the simulation of the top module (as the toolbar's Simulate of the modern interface)
  await page.click('#task-empty button');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim'), [], { what: 'ISim', timeout: 30000 });
  s = await state(page);
  assert.equal(s.task, 'sim');
  assert.equal(s.empty, false);
  assert.deepEqual(s.tabs, [], 'one document: no tab bar (#854)');
  assert.equal(await page.eval(() => document.querySelector('#task-doc .task-doc-mod').textContent), 'tb_top', 'the test bench (#800)');
  // the side panel unfolds from the task's bar, kept for Simulate
  await page.click('#task-bar [data-act="side"]');
  assert.equal((await state(page)).side, 'open');
  // back to Edit: its editor in front again, its arrangement as left
  await page.click('#task-switch .task-btn[data-task="edit"]');
  s = await state(page);
  assert.deepEqual([s.task, s.side, s.console, s.empty], ['edit', 'open', 'open', false]);
  assert.ok(s.tabs.includes('top.vhd') && !s.tabs.some((t) => t.startsWith('SSim')), s.tabs.join());
  assert.ok(await shown(page, '.doc:not([hidden]) .cm-editor'));
  // Implement: the Design Summary opens by itself; iMPACT opens there too, beside it (#1172: no Program task)
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.waitFor(() => document.querySelector('#doc-tabs > .tab.active')?.textContent.includes('Design Summary'), [], { what: 'the Design Summary' });
  assert.deepEqual((await state(page)).tabs, ['Design Summary']);
  await page.eval(() => window.SilinxApp.openImpact());
  await page.waitFor(() => document.querySelector('#doc-tabs > .tab.active')?.textContent.includes('iMPACT'), [], { what: 'iMPACT' });
  s = await state(page);
  assert.deepEqual([s.task, s.tabs], ['impl', ['Design Summary', 'iMPACT']]);
  // a document of another task brought to the front (the Window menu, a link…): its task comes to the front
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => document.documentElement.dataset.task === 'edit', [], { what: 'Edit in front' });
  // maximize: the document's tab double-clicked (Edit's: a task with tabs); kept for its task; the bar's button gives the space back
  await page.click('#task-switch .task-btn[data-task="edit"]');
  const tab = await page.point('#doc-tabs > .tab.active');
  await page.mouse('mousePressed', tab.x, tab.y, { clickCount: 1 }); await page.mouse('mouseReleased', tab.x, tab.y, { clickCount: 1 });
  await page.mouse('mousePressed', tab.x, tab.y, { clickCount: 2 }); await page.mouse('mouseReleased', tab.x, tab.y, { clickCount: 2 });
  await page.waitFor(() => document.documentElement.dataset.max === 'on', [], { what: 'maximized' });
  assert.ok(!(await shown(page, '#left')) && !(await shown(page, '#console-wrap')));
  const ws = await page.eval(() => document.getElementById('workspace').getBoundingClientRect().width);
  assert.ok(ws >= 1366 - 2, `the document has the width: ${ws}`);
  await page.click('#task-switch .task-btn[data-task="sim"]');
  assert.equal((await state(page)).max, 'off');
  await page.click('#task-switch .task-btn[data-task="edit"]');
  assert.equal((await state(page)).max, 'on', 'kept for Edit');
  await page.click('#task-bar [data-act="max"]');
  assert.equal((await state(page)).max, 'off');
  assert.ok(await shown(page, '#left'));
  // the messages: folded in Simulate, they open from their tabs and from the bar
  await page.click('#task-switch .task-btn[data-task="sim"]');
  assert.equal((await state(page)).console, 'folded');
  await page.click('#task-bar [data-act="console"]');
  assert.equal((await state(page)).console, 'open');
  assert.ok(await shown(page, '#console-body'));
  // kept per viewer, and after a reload
  const kept = await page.eval(() => JSON.parse(localStorage.getItem('silinx.tasks')));
  assert.equal(kept.task, 'sim');
  assert.deepEqual([kept.tasks.sim.side, kept.tasks.sim.console, kept.tasks.edit.max], [true, true, false]);
  assert.match(kept.tasks.edit.doc, /^file:src\/top\.vhd$/);
  assert.deepEqual(await noOverflow(page), { page: true, over: [] });
  await noWarnings(page);
}, { build: DEV });

uiTest('Tasks on a tablet: the tab bar at the bottom in portrait, the header\'s switcher in landscape; a task closes the drawer', E, async (page) => {
  await makeProject(env, { name: 'TasksTablet', template: 'gates' });
  await page.setViewport(820, 1180);
  await tasksInterface(page);
  await page.openProject('TasksTablet');
  assert.ok(await shown(page, '#task-tabs') && !(await shown(page, '#task-switch')));
  const bar = await page.eval(() => {
    const r = document.getElementById('task-tabs').getBoundingClientRect();
    return { bottom: Math.round(innerHeight - r.bottom), buttons: [...document.querySelectorAll('#task-tabs .task-btn')].map((b) => Math.round(b.getBoundingClientRect().height)) };
  });
  assert.ok(bar.bottom <= 30, `at the bottom (above the status bar): ${bar.bottom}`);
  assert.ok(bar.buttons.every((hgt) => hgt >= 44), `touch targets: ${bar.buttons}`);
  // the drawer open (the Design pane): a task brought to the front closes it, the document first
  await page.eval(async () => (await import('/js/narrow.js')).setDrawer(true));
  await page.click('#task-tabs .task-btn[data-task="impl"]');
  await page.waitFor(() => document.documentElement.dataset.drawer === 'closed', [], { what: 'the drawer closed' });
  await page.waitFor(() => document.querySelector('#doc-tabs > .tab.active')?.textContent.includes('Design Summary'), [], { what: 'the Design Summary' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#task-tabs .task-btn[aria-current="true"]')].map((b) => b.dataset.task)), ['impl']);
  // the bar's side button opens the drawer
  await page.click('#task-bar [data-act="side"]');
  await page.waitFor(() => document.documentElement.dataset.drawer === 'open', [], { what: 'the drawer open' });
  assert.deepEqual(await noOverflow(page), { page: true, over: [] });
  // landscape: the header's switcher, no tab bar
  await page.setViewport(1180, 820);
  await page.waitFor(() => document.getElementById('task-switch').getClientRects().length > 0, [], { what: 'the header switcher' });
  assert.ok(!(await shown(page, '#task-tabs')));
  assert.deepEqual(await noOverflow(page), { page: true, over: [] });
  await noWarnings(page);
}, { build: DEV });

uiTest('Tasks in Portuguese: the switcher, the task\'s bar and its page translated; the header fits at 1180 and 1280 px', E, async (page) => {
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.eval(TEXTS);
  const texts = () => page.eval(() => ['task-switch', 'task-bar', 'task-empty', 'mc-filters', 'mc-cmd'].flatMap((id) => window.__uiTexts(document.getElementById(id))));
  const en = await texts();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#task-switch .task-btn[data-task="sim"] .lbl').textContent === 'Simular', [], { what: 'Portuguese' });
  const pt = await texts();
  assert.deepEqual(untranslated(en, pt), ['@Design', 'Design'], 'Design: the task\'s name in Portuguese too (#1046), its text and its tooltip');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#task-switch .lbl')].map((l) => l.textContent)), ['Design', 'Simular', 'Emular', 'Implementar']);   // (Design: not "Projeto", the Project menu's, #1046)
  assert.equal(await page.eval(() => document.querySelector('#task-empty p').textContent), 'Abra uma fonte no painel Projeto, ou verifique o projeto.');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#mc-filters .filt')].map((b) => b.textContent)),
    ['Todas', 'Projeto', 'Simulação', 'Emulação', 'Implementação']);
  // the longer labels (the menus too) fit the header: a laptop, a tablet in landscape (the switcher's labels giving
  // way once the header has measured itself, #839)
  for (const [w, hgt] of [[1280, 800], [1180, 820], [1025, 768]]) {
    await page.setViewport(w, hgt);
    await page.waitFor(() => { const t = document.getElementById('topbar'); return t.scrollWidth <= t.clientWidth; }, [], { what: `the header fits at ${w} px`, timeout: 3000 });
    assert.deepEqual(await noOverflow(page), { page: true, over: [] }, `${w} px`);
  }
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await makeProject(env, { name: 'TasksPt', template: 'gates' });
  await page.openProject('TasksPt');
  await noWarnings(page);
}, { build: DEV });

// #839: a development build's header has the Development menu too; in Portuguese the switcher's labels give way
// (the other tasks' first) so that the header fits; with room, every label again
uiTest('#839 Tasks in a development build: with the Development menu, in Portuguese at 1280 × 800, the header fits', E, async (page) => {
  await page.setViewport(1440, 900);
  await tasksInterface(page);
  await page.waitFor(() => [...document.querySelectorAll('#menubar .item')].some((e) => e.textContent.trim() === 'Development'), [], { what: 'the Development menu' });
  const fit = () => page.eval(() => {
    const sw = document.getElementById('task-switch'), top = document.getElementById('topbar').getBoundingClientRect();
    const btns = [...sw.querySelectorAll('.task-btn')];
    return {
      fit: document.getElementById('topbar').dataset.fit,
      labels: btns.filter((b) => b.querySelector('.lbl').getClientRects().length).map((b) => b.dataset.task),
      inside: btns.every((b) => { const r = b.getBoundingClientRect(); return r.left >= top.left && r.right <= top.right; }),
    };
  });
  // English, a lab desktop's width: every label
  assert.deepEqual(await fit(page), { fit: '', labels: ['edit', 'sim', 'emu', 'impl'], inside: true });
  assert.deepEqual(await noOverflow(page), { page: true, over: [] });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => [...document.querySelectorAll('#menubar .item')].some((e) => e.textContent.trim() === 'Desenvolvimento'), [], { what: 'Portuguese' });
  for (const [w, hgt] of [[1440, 900], [1366, 768], [1280, 800], [1180, 820], [1025, 768]]) {
    await page.setViewport(w, hgt);
    await page.waitFor(() => { const t = document.getElementById('topbar'); return t.scrollWidth <= t.clientWidth; }, [], { what: `the header fits at ${w} px`, timeout: 3000 });
    const f = await fit(page);
    assert.ok(f.inside, `${w} px: every task inside the header`);
    // (the current task's label down to a tablet in landscape; at the narrowest width the current label at most, or icons
    // with their tips: with no project chip, #1042, the current label may still fit)
    if (w >= 1180) assert.ok(f.labels.includes('edit'), `${w} px: the current task's label`);
    else assert.ok(['current', 'icons', 'tight'].includes(f.fit) && f.labels.length <= 1, `${w} px: the current label at most (${f.fit}; how short the header is depends on the system's fonts)`);
    assert.deepEqual(await noOverflow(page), { page: true, over: [] }, `${w} px`);
  }
  // narrower: the other tasks' labels give way; their names in their tips (the width it happens at depends on the
  // header's other parts: with no project chip, #1042, below 1280 px; looked for between 1280 and 1025 px)
  let current = 0;
  for (const w of [1280, 1240, 1200, 1160, 1120, 1080, 1040]) {
    await page.setViewport(w, 800);
    await page.waitFor(() => { const t = document.getElementById('topbar'); return t.scrollWidth <= t.clientWidth; }, [], { what: `the header fits at ${w} px`, timeout: 3000 });
    if ((await fit(page)).fit === 'current') { current = w; break; }
  }
  assert.ok(current, 'a width where only the current task\'s label shows');
  assert.deepEqual((await fit(page)).labels, ['edit']);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#task-switch .task-btn')].map((b) => b.title)), ['Design', 'Simular', 'Emular', 'Implementar']);
  // with room again (a lab desktop): every label
  await page.setViewport(1920, 1080);
  await page.waitFor(() => document.getElementById('topbar').dataset.fit === '', [], { what: 'every label' });
  assert.deepEqual((await fit(page)).labels, ['edit', 'sim', 'emu', 'impl']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await makeProject(env, { name: 'TasksDev', template: 'gates' });
  await page.openProject('TasksDev');
  await noWarnings(page);
}, { build: FULL });

// #854: Simulate and Emulate have one document each (iMPACT Implement's, among its documents, #1172) (a new one replaces the old): no tab bar there; the
// document's module and model, and its close, in the task's bar; Edit keeps its tabs
const docInfo = (page) => page.eval(() => {
  const vis = (e) => !!e && e.getClientRects().length > 0;
  const i = document.getElementById('task-doc');
  return { tabs: vis(document.getElementById('doc-tabs')), info: vis(i) ? [...i.querySelectorAll('span')].filter(vis).map((x) => x.textContent) : null };
});
uiTest('#854 Tasks: no tab bar in a task with a single document; its module and model, and its close, in the task\'s bar', E, async (page) => {
  await makeProject(env, { name: 'TasksSingle', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksSingle');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitForSelector('.doc:not([hidden]) .cm-editor');
  assert.deepEqual(await docInfo(page), { tabs: true, info: null }, 'Edit keeps its tabs, even with one file');
  // Simulate: none open (its page, no tab bar), then ISim: its module and model in the bar
  await page.click('#task-switch .task-btn[data-task="sim"]');
  assert.deepEqual(await docInfo(page), { tabs: false, info: null });
  await page.click('#task-empty button');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim'), [], { what: 'ISim', timeout: 30000 });
  await page.waitFor(() => document.getElementById('task-doc').getClientRects().length > 0, [], { what: 'the document in the bar' });
  assert.deepEqual(await docInfo(page), { tabs: false, info: ['tb_top', 'Behavioral'] });   // (the test bench: #800)
  // the workspace has the tab bar's height
  const top = await page.eval(() => Math.round(document.getElementById('workspace').getBoundingClientRect().top - document.getElementById('toolbar').getBoundingClientRect().bottom));
  assert.ok(top <= 1, `the document right under the toolbar: ${top}`);
  // Emulate: the board, RTL
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.click('#task-empty button');
  await page.waitConsole(/Board Emulator: 'top'/, { timeout: 30000 });
  assert.deepEqual(await docInfo(page), { tabs: false, info: ['top', 'Behavioral (RTL)'] });
  // its close: the emulator closes, the task's page again
  await page.click('#task-doc [data-act="close"]');
  await page.waitFor(() => !window.SilinxApp.findDoc('emulator'), [], { what: 'the emulator closed' });
  assert.deepEqual(await docInfo(page), { tabs: false, info: null });
  assert.ok(await shown(page, '#task-empty'));
  // in Portuguese: the model's name
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#task-doc .task-doc-model').textContent === 'Comportamental', [], { what: 'Portuguese' });
  assert.equal(await page.eval(() => document.querySelector('#task-doc [data-act="close"]').title), 'Fechar');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // back to Edit: its tabs
  await page.click('#task-switch .task-btn[data-task="edit"]');
  assert.deepEqual(await docInfo(page), { tabs: true, info: null });
  // the classic interface: its tab bar as before
  await page.eval(async () => (await import('/js/modern.js')).setInterface('classic'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.equal(await page.eval(() => document.documentElement.dataset.single), undefined);
  assert.ok(await shown(page, '#doc-tabs'));
  await noWarnings(page);
}, { build: DEV });

// #799: Edit's Design pane is one tree, no views: the design, then the constraints; the test benches are the Test
// page's (#1016, test/ui/tasks-test.test.js); Check checks the selected module, a test bench with the simulation's sources
const hierRows = (page) => page.eval(() => [...document.querySelectorAll('#hier .row')].filter((r) => r.getClientRects().length)
  .map((r) => [r.querySelector('.lbl').textContent, ...[...r.querySelectorAll('.badge')].map((b) => b.textContent)].join(' ')));
uiTest('#799 Tasks ▸ Edit: one design tree (the design, Constraints), no views; Check of a test bench (the Test page\'s)', E, async (page) => {
  await makeProject(env, { name: 'TasksTree', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksTree');
  await page.click('#task-switch .task-btn[data-task="edit"]');
  assert.ok(!(await shown(page, '#design-panel .view-select')) && !(await shown(page, '#proc-panel')), 'no views, no Processes');
  const rows = await hierRows(page);
  const at = (label) => rows.findIndex((r) => r === label || r.startsWith(`${label} `));
  // the design first (its top, its modules with their drawings' badges), then the groups
  assert.ok(at('TasksTree') === 0 && at('xc3s250e-4-cp132') === 1 && at('top') === 2, rows.join(' | '));
  assert.ok(rows.includes('u_speed - speed_ctrl ASM VHDL'), 'a drawing\'s badge first, its HDL last');
  assert.ok(at('Test Benches') === -1 && at('tb_top') === -1, rows.join(' | '));   // (the Test page's, #1016)
  assert.ok(at('Constraints') > at('top') && at('top.ucf') === at('Constraints') + 1, rows.join(' | '));
  // Check of the test bench: the simulation's sources (Behavioral Check Syntax), no error
  await page.click('#left-tabs .tab[data-page="test"]');
  await page.treeRow('#test-tree', 'tb_top', { exact: true });
  await page.click('#task-bar [data-act="main"]');
  await page.waitConsole(/Elaborating top module <tb_top>/);
  await page.waitConsole(/Process "Check Syntax" completed successfully/);
  assert.match(await page.eval(() => window.__console()), /Started : "Behavioral Check Syntax"/);
  assert.equal(await page.eval(() => document.getElementById('err-count').textContent), '');
  // the UCF from its group: in Edit (the tree scrolled to its end: its last row clear of the horizontal scroll bar
  // the long rows of blinky's modules give it, which the headless browser draws over the pane)
  await page.click('#left-tabs .tab[data-page="design"]');
  await page.eval(() => { const h = document.getElementById('hier'); h.scrollTop = h.scrollHeight; });
  await page.treeRow('#hier', 'top.ucf', { dbl: true, exact: true });
  await page.waitFor(() => document.querySelector('#doc-tabs > .tab.active')?.textContent.includes('top.ucf'), [], { what: 'the UCF' });
  assert.equal((await state(page)).task, 'edit');
  // in Portuguese: the groups' names
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => [...document.querySelectorAll('#hier .lbl')].some((l) => l.textContent === 'Restrições'), [], { what: 'Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the classic interface: its views and Processes again, no groups
  await page.eval(async () => (await import('/js/modern.js')).setInterface('classic'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.ok(await shown(page, '#design-panel .view-select') && await shown(page, '#proc-panel'));
  assert.ok(!(await hierRows(page)).some((r) => r === 'Test Benches' || r === 'Constraints'));
  await noWarnings(page);
}, { build: DEV });

// #991: a task's dot is explained by its button's tooltip (the task and its state), in English and Portuguese
uiTest('#991 Tasks: a task\'s dot explained by its button\'s tooltip; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'TasksDot', template: 'gates' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksDot');
  const tip = (t) => page.eval((x) => document.querySelector(`#task-switch .task-btn[data-task="${x}"]`).title, t);
  assert.equal(await tip('edit'), 'Design');
  await page.click('#task-switch .task-btn[data-task="edit"]');
  await page.treeRow('#hier', 'gates', { exact: true });
  await page.click('#task-bar [data-act="main"]');
  await page.waitConsole(/Process "Check Syntax" completed successfully/);
  await page.waitFor(() => document.querySelector('#task-switch .task-btn[data-task="edit"] .task-dot').dataset.state === 'ok', [], { what: 'Edit\'s dot' });
  assert.equal(await tip('edit'), 'Design — done, no warnings');
  assert.equal(await tip('emu'), 'Emulate', 'no dot: the task\'s name');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#task-switch .task-btn[data-task="edit"]').title === 'Design — concluído, sem avisos', [], { what: 'Portuguese' });
  assert.equal(await tip('emu'), 'Emular');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await noWarnings(page);
}, { build: DEV });

// #993: in the Tasks interface a schematic's Check writes its errors and warnings in the console below (the Design
// source), each line showing its item in the drawing; the editor's own panel only in the other interfaces
uiTest('#993 Tasks ▸ Edit: Check Schematic\'s errors and warnings in the console below, under Design; not in the editor\'s panel', E, async (page) => {
  // (two inverters' outputs on one net: an error)
  const doc = newDoc('bad', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'inv', x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params: {} }, { id: 'S2', type: 'inv', x: 200, y: 200, rot: 0, mirror: false, name: 'U2', params: {} });
  const pins = doc.symbols.map((s) => symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0]));
  const o1 = pins[0].find((p) => p.name === 'O'), o2 = pins[1].find((p) => p.name === 'O');
  doc.wires.push({ id: 'W1', points: [{ x: o1.x, y: o1.y }, { x: o1.x + 30, y: o1.y }, { x: o1.x + 30, y: o2.y }, { x: o2.x, y: o2.y }] });
  await makeProject(env, { name: 'TasksCheck', files: { 'src/bad.sch.json': JSON.stringify(doc) } });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksCheck');
  await page.eval(() => window.SilinxApp.openSch('src/bad.sch.json'));
  const ED = '.doc:not([hidden]) .sch-editor';
  await page.waitFor((sel) => document.querySelector(`${sel} .se-btn[data-act=check]`), [ED], { what: 'the schematic' });
  // (the messages folded first: the Check opens them)
  if (await page.eval(() => document.documentElement.dataset.console === 'open')) await page.click('#task-bar [data-act="console"]');
  await page.click(`${ED} .se-btn[data-act=check]`);
  await page.waitConsole(/Process "Check Schematic" failed/);
  assert.equal(await page.eval(() => document.documentElement.dataset.console), 'open');
  assert.ok(!(await shown(page, `${ED} .se-diags`)), 'not in the editor\'s panel');
  const lines = await page.eval(() => [...document.querySelectorAll('#console-log .ln')].filter((l) => l.getClientRects().length).map((l) => [l.dataset.src, l.textContent, l.classList.contains('mc-link')]));
  const at = lines.findIndex(([, t]) => t === 'Started : "Check Schematic" of bad.');
  assert.ok(at >= 0, JSON.stringify(lines));
  const err = lines.slice(at).find(([, t]) => /^ERROR: .*2 drivers/.test(t));
  assert.deepEqual(err && [err[0], err[2]], ['check', true], JSON.stringify(lines));
  // (in the Errors tab: the error, not the process's result)
  await page.waitFor(() => document.getElementById('err-count').textContent === '(1)', [], { what: 'the Errors tab' });
  // the Design filter (#994) in front, the line's tooltip; a click shows its item (no error)
  assert.equal(await page.eval(() => document.querySelector('#mc-filters .filt[aria-pressed="true"]').textContent), 'Design');
  assert.equal(await page.eval(() => document.querySelector('#console-log .ln.mc-link').title), 'Show it in the drawing');
  await page.eval(() => document.querySelector('#console-log .ln.mc-link').click());
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#console-log .ln.mc-link').title === 'Mostrar no desenho', [], { what: 'Portuguese' });
  assert.equal(await page.eval(() => document.querySelector('#mc-filters .filt[data-src="check"]').textContent), 'Projeto');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the modern interface: the editor's panel, as before
  await page.eval(async () => (await import('/js/modern.js')).setInterface('classic'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  await page.click(`${ED} .se-btn[data-act=check]`);
  await page.waitFor((sel) => { const d = document.querySelector(`${sel} .se-diags`); return d && !d.hidden && /^Check Schematic: 1 error/.test(d.textContent); }, [ED], { what: 'the editor\'s panel' });
}, { build: DEV });

// #1042: no project chip in the header, in any interface (a project is opened from File and the Start page, its
// name is in Design)
uiTest('#1042 no project chip in the header: modern (Tasks) and classic', E, async (page) => {
  await makeProject(env, { name: 'TasksChip', template: 'gates' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksChip');
  for (const ui of ['modern', 'classic']) {
    if (ui !== 'modern') await page.eval(async (x) => (await import('/js/modern.js')).setInterface(x), ui);
    await page.waitFor((x) => (x === 'modern') === (document.documentElement.dataset.layout === 'tasks'), [ui], { what: ui });
    assert.equal(await page.eval(() => document.getElementById('title-project')), null, ui);
    // (classic's title is ISE's, "TasksChip - [Design Summary]": the project there is the window's title, not a chip)
    if (ui !== 'classic') assert.doesNotMatch(await page.eval(() => document.getElementById('titlebar').innerText), /TasksChip/, ui);
  }
  await page.eval(async () => (await import('/js/modern.js')).setInterface('modern'));
  await noWarnings(page);
}, { build: DEV });

// #800: Simulate gives the waves the screen (ISim's title bar is the task's; its Instances and Objects the task's
// side panel, folded at first; no Design pane) and runs the test bench whatever is selected, the model chosen
uiTest('#800 Tasks ▸ Simulate: the waves get the screen; Simulate runs the test bench, the model in the task\'s bar', E, async (page) => {
  await makeProject(env, { name: 'TasksSim', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksSim');
  // a design module selected in Edit: Simulate still runs the test bench
  await page.click('#task-switch .task-btn[data-task="edit"]');
  await page.treeRow('#hier', 'top', { exact: true });
  await page.click('#task-switch .task-btn[data-task="sim"]');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#task-model option')].map((o) => [o.value, o.textContent])),
    [['', 'Behavioral'], ['postsynth', 'Post-Synthesis'], ['posttrans', 'Post-Translate'], ['postmap', 'Post-Map'], ['postpar', 'Post-Place & Route']]);
  assert.ok(await shown(page, '#task-model'));
  await page.click('#task-empty button');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim .isim-wavewin'), [], { what: 'ISim', timeout: 30000 });
  await page.waitFor(() => document.querySelector('#task-doc .task-doc-mod')?.textContent === 'tb_top', [], { what: 'the test bench simulated' });
  // the waves get the screen: no ISim title bar, no Instances / Objects column, no Design pane, no console
  assert.ok(!(await shown(page, '.doc:not([hidden]) .isim-title')) && !(await shown(page, '.doc:not([hidden]) .isim-left')));
  assert.ok(!(await shown(page, '#left-pages')) && !(await shown(page, '#left-tabs')));
  const W = await page.eval(() => {
    const w = document.querySelector('.doc:not([hidden]) .isim-wavewin').getBoundingClientRect(), ws = document.getElementById('workspace').getBoundingClientRect();
    return { width: Math.round(w.width), ws: Math.round(ws.width), height: Math.round(w.height) };
  });
  assert.ok(W.width >= W.ws - 4, `the wave window has the workspace's width: ${JSON.stringify(W)}`);
  assert.ok(W.height >= 0.55 * 768, `and most of the height: ${JSON.stringify(W)}`);
  // the side panel: ISim's Instances and Objects (not the Design pane)
  await page.click('#task-bar [data-act="side"]');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim-left')?.getClientRects().length > 0, [], { what: 'Instances and Objects' });
  assert.ok(!(await shown(page, '#left-pages')));
  // not in the other tasks
  await page.click('#task-switch .task-btn[data-task="edit"]');
  assert.ok(!(await shown(page, '#task-model')) && await shown(page, '#left-pages'));
  // in Portuguese: the models
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#task-model option').textContent === 'Comportamental', [], { what: 'Portuguese' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#task-model option')].map((o) => o.textContent)),
    ['Comportamental', 'Pós-Síntese', 'Pós-Translate', 'Pós-Map', 'Pós-Place & Route']);
  assert.equal(await page.eval(() => document.getElementById('task-model').title), 'O modelo a simular');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // a tablet in portrait: the same (the side button folds ISim's columns, not the drawer, which Simulate has not)
  await page.setViewport(820, 1180);
  assert.ok(!(await shown(page, '#drawer-btn')));
  await page.click('#task-bar [data-act="side"]');
  await page.waitFor(() => !document.querySelector('.doc:not([hidden]) .isim-left')?.getClientRects().length, [], { what: 'the columns folded' });
  const P = await page.eval(() => [Math.round(document.querySelector('.doc:not([hidden]) .isim-wavewin').getBoundingClientRect().width), Math.round(document.getElementById('workspace').getBoundingClientRect().width)]);
  assert.ok(P[0] >= P[1] - 4, `portrait: the waves have the width: ${P}`);
  assert.deepEqual(await noOverflow(page), { page: true, over: [] });
  await page.setViewport(1366, 768);
  // the modern interface: ISim as it was (its title bar, its Instances and Objects)
  await page.eval(async () => (await import('/js/modern.js')).setInterface('classic'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.ok(await shown(page, '.doc:not([hidden]) .isim-title') && await shown(page, '.doc:not([hidden]) .isim-left'));
  await noWarnings(page);
}, { build: DEV });

// #801: Emulate gives the board the screen: zoomed to fit, its switches and buttons inside the window with no scrolling
// (a laptop, a tablet in portrait, a lab desktop); its Watch the task's side panel, beside the board or below it
const boardFit = (page) => page.eval(() => {
  const emu = document.querySelector('.doc:not([hidden]) .emu'), wrap = emu.querySelector('.emu-board-wrap');
  const ctrls = [...emu.querySelectorAll('.emu-btn, .emu-sw')];
  const inside = ctrls.every((c) => { const r = c.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; });
  // (the pointer still aims at them: what is at a button's centre is that button)
  const b = ctrls.find((c) => c.classList.contains('emu-btn')), r = b.getBoundingClientRect();
  const aim = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.emu-btn') === b;
  const side = emu.querySelector('.emu-side'), sr = side.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  return { zoom: +wrap.style.zoom || 1, controls: ctrls.length, inside, aim, noScroll: emu.scrollHeight <= emu.clientHeight + 1,
    side: side.getClientRects().length ? (sr.left >= wr.right - 1 ? 'beside' : sr.top >= wr.bottom - 1 ? 'below' : 'over') : 'folded' };
});
uiTest('#801 Tasks ▸ Emulate: the board fits, its switches and buttons on screen; its Watch beside the board or below it', E, async (page) => {
  await makeProject(env, { name: 'TasksEmu', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksEmu');
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.click('#task-empty button');
  await page.waitConsole(/Board Emulator: 'top'/, { timeout: 30000 });
  await page.waitFor(() => +document.querySelector('.doc:not([hidden]) .emu-board-wrap')?.style.zoom > 0, [], { what: 'the board zoomed' });
  assert.ok(!(await shown(page, '#left-pages')), 'no Design pane in Emulate');
  // the side panel: the emulator's Watch, shown at first (#1020), beside the board; the board still fits
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .emu-side')?.getClientRects().length > 0, [], { what: 'Watch' });
  await page.waitFor(() => new Promise((r) => requestAnimationFrame(() => r(true))));
  let f = await boardFit(page);
  // (the board at its proper size at least, #1021: on a screen 768 high its note may be scrolled to)
  assert.ok(f.controls >= 12 && f.inside && f.aim && f.side === 'beside', JSON.stringify(f));
  // a tablet in portrait: the board at its size (#1021), Watch below it
  await page.setViewport(820, 1180);
  await page.waitFor(() => { const e = document.querySelector('.doc:not([hidden]) .emu'); const s = e.querySelector('.emu-side').getBoundingClientRect(); return s.top >= e.querySelector('.emu-board-wrap').getBoundingClientRect().bottom - 1; }, [], { what: 'Watch below the board' });
  f = await boardFit(page);
  assert.ok(f.inside && f.aim && f.side === 'below', JSON.stringify(f));
  assert.deepEqual(await noOverflow(page), { page: true, over: [] });
  // a lab desktop, Watch folded: a larger board
  await page.setViewport(1920, 1080);
  await page.click('#task-bar [data-act="side"]');
  await page.waitFor(() => +document.querySelector('.doc:not([hidden]) .emu-board-wrap').style.zoom > 1, [], { what: 'a larger board' });
  f = await boardFit(page);
  assert.ok(f.inside && f.aim && f.side === 'folded', JSON.stringify(f));
  // the modern interface: the board at its own size again
  await page.setViewport(1366, 768);
  await page.eval(async () => (await import('/js/modern.js')).setInterface('classic'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-board-wrap').style.zoom), '');
  await noWarnings(page);
}, { build: DEV });

// #1021: the board keeps its proper size (zoomed up on a large window, never down): when the width runs short, the Watch
// and the VGA monitor wrap to the next row, below the board, and the emulator's area scrolls; a laptop, a tablet in
// landscape and in portrait; the classic interface as before
const emuLayout = (page) => page.eval(() => {
  const emu = document.querySelector('.doc:not([hidden]) .emu'), wrap = emu.querySelector('.emu-board-wrap'), pcb = wrap.querySelector('.emu-pcb');
  const wr = wrap.getBoundingClientRect(), pr = pcb.getBoundingClientRect();
  const where = (el) => { const r = el.getBoundingClientRect(); return !el.getClientRects().length ? 'folded' : r.left >= wr.right - 1 ? 'beside' : r.top >= wr.bottom - 1 ? 'below' : 'over'; };
  return { zoom: +wrap.style.zoom || 1, proper: pr.width >= parseFloat(pcb.style.width) - 0.5 && pr.height >= parseFloat(pcb.style.height) - 0.5,
    watch: where(emu.querySelector('.emu-side')), vga: where(emu.querySelector('.emu-vga')),
    scrollsDown: emu.scrollHeight > emu.clientHeight + 1, scrollsAcross: emu.scrollWidth > emu.clientWidth + 1 };
});
uiTest('#1021 Tasks ▸ Emulate: the board keeps its size; the Watch and the VGA monitor wrap below it, scrolling; classic as before', E, async (page) => {
  await makeProject(env, { name: 'TasksWrap', template: 'vga' });
  await page.setViewport(1280, 800);
  await tasksInterface(page);
  await page.openProject('TasksWrap');
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.click('#task-empty button');
  await page.waitConsole(/Board Emulator: 'vga'/, { timeout: 60000 });
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .emu-vga'), [], { what: 'the VGA monitor' });
  const at = async (w, hgt) => {
    await page.setViewport(w, hgt);
    await page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return emuLayout(page);
  };
  // a laptop: the board a little larger, the Watch beside it, the VGA monitor below (scrolled to)
  let L = await at(1280, 800);
  assert.ok(L.zoom >= 1, JSON.stringify(L));
  assert.deepEqual({ ...L, zoom: undefined }, { zoom: undefined, proper: true, watch: 'beside', vga: 'below', scrollsDown: true, scrollsAcross: false });
  // a tablet in landscape: the board at its proper size, the Watch and the VGA monitor below it
  L = await at(1024, 768);
  assert.deepEqual(L, { zoom: 1, proper: true, watch: 'below', vga: 'below', scrollsDown: true, scrollsAcross: false });
  // a tablet in portrait: narrower than the board, which keeps its size: the area scrolls across too, not the page
  L = await at(768, 1024);
  assert.deepEqual(L, { zoom: 1, proper: true, watch: 'below', vga: 'below', scrollsDown: true, scrollsAcross: true });
  assert.deepEqual(await noOverflow(page), { page: true, over: [] });
  // the Watch folded on the laptop: the VGA monitor still below the board
  L = await at(1280, 800);
  await page.click('#task-bar [data-act="side"]');
  await page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  L = await emuLayout(page);
  assert.ok(L.zoom >= 1 && L.proper && L.watch === 'folded' && L.vga === 'below', JSON.stringify(L));
  // the modern and classic interfaces: the board at its own size, the side column and the VGA monitor in their order
  for (const ui of ['classic']) {
    await page.eval(async (u) => (await import('/js/modern.js')).setInterface(u), ui);
    await page.waitFor(() => !document.documentElement.dataset.layout);
    assert.deepEqual(await page.eval(() => {
      const emu = document.querySelector('.doc:not([hidden]) .emu'), cs = (s) => getComputedStyle(emu.querySelector(s));
      return [emu.querySelector('.emu-board-wrap').style.zoom, cs('.emu-main').flexWrap, cs('.emu-side').order, cs('.emu-vga').order, cs('.emu-side').width !== '300px'];
    }), ['', 'wrap', '0', '0', true], ui);
  }
  await noWarnings(page);
}, { build: DEV });

// #1022: the emulator's status (t = … ns · … cycles · … kHz (…% of real time)) right below the board, in place of the
// board's line ("Digilent Basys2 — top · Clock clk: 50 MHz on the board"), in English and Portuguese; the classic
// interface keeps it at the end of the emulator's bar, the board's line below the board
const emuStatus = (page) => page.eval(() => {
  const emu = document.querySelector('.doc:not([hidden]) .emu'), stat = emu.querySelector('.stat'), note = emu.querySelector('.emu-board-note');
  const pr = emu.querySelector('.emu-pcb').getBoundingClientRect(), sr = stat.getBoundingClientRect();
  const hit = document.elementFromPoint(sr.left + sr.width / 2, sr.top + sr.height / 2);
  return { where: stat.parentNode.classList.contains('emu-bar') ? 'bar' : stat.parentNode.classList.contains('emu-board-wrap') ? 'board' : '?',
    below: sr.top >= pr.bottom - 1 && sr.top - pr.bottom < 16 && sr.left >= pr.left - 1, seen: !!hit && stat.contains(hit),
    note: note.getClientRects().length > 0, text: stat.textContent, noteText: note.textContent };
});
uiTest('#1022 Tasks ▸ Emulate: the emulation\'s time and rate right below the board, in place of the board\'s line; in Portuguese; classic as before', E, async (page) => {
  await makeProject(env, { name: 'TasksStat', template: 'blinky' });
  await page.setViewport(1280, 800);
  await tasksInterface(page);
  await page.openProject('TasksStat');
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.click('#task-empty button');
  await page.waitConsole(/Board Emulator: 'top'/, { timeout: 30000 });
  await page.waitFor(() => /^t = .* cycles .* kHz \(.*% of real time\)$/.test(document.querySelector('.doc:not([hidden]) .emu-board-wrap > .stat')?.textContent || ''), [], { what: 'the status below the board' });
  let s = await emuStatus(page);
  assert.deepEqual({ ...s, text: undefined }, { where: 'board', below: true, seen: true, note: false, text: undefined, noteText: s.noteText });
  assert.match(s.noteText, /^Digilent Basys2 — top · Clock clk: 50 MHz on the board/);
  assert.equal(await page.eval(() => document.querySelectorAll('.doc:not([hidden]) .emu-bar .stat').length), 0, 'no status in the emulator\'s bar');
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => /^t = .* ciclos .* kHz \(.*% do tempo real\)$/.test(document.querySelector('.doc:not([hidden]) .emu-board-wrap > .stat')?.textContent || ''), [], { what: 'the status in Portuguese' });
  s = await emuStatus(page);
  assert.ok(s.where === 'board' && s.below && s.seen && !s.note, JSON.stringify(s));
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the modern and classic interfaces: at the end of the emulator's bar, the board's line below the board
  for (const ui of ['classic']) {
    await page.eval(async (u) => (await import('/js/modern.js')).setInterface(u), ui);
    await page.waitFor(() => !document.documentElement.dataset.layout);
    await page.waitFor(() => /^t = .* cycles .* kHz \(.*% of real time\)$/.test(document.querySelector('.doc:not([hidden]) .emu .stat')?.textContent || ''), [], { what: `the status in ${ui}` });
    s = await emuStatus(page);
    assert.deepEqual({ where: s.where, note: s.note, last: await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-bar').lastElementChild.classList.contains('stat')) },
      { where: 'bar', note: true, last: true }, ui);
    assert.match(s.noteText, /^Digilent Basys2 — top · Clock clk: 50 MHz on the board/, ui);
  }
  // and back to Tasks: below the board again
  await page.eval(async () => (await import('/js/modern.js')).setInterface('modern'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .emu-board-wrap > .stat'), [], { what: 'the status below the board again' });
  await noWarnings(page);
}, { build: DEV });

// #1020: Emulate opens with its Watch shown (the task's side panel open), the design's signals to add; folded by the
// viewer, it stays folded; the classic interface shows it as before
uiTest('#1020 Tasks ▸ Emulate: the Watch shown at first; folded, it stays folded; classic as before', E, async (page) => {
  await makeProject(env, { name: 'TasksWatch', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksWatch');
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.click('#task-empty button');
  await page.waitConsole(/Board Emulator: 'top'/, { timeout: 30000 });
  const watch = () => page.eval(() => {
    const side = document.querySelector('.doc:not([hidden]) .emu-side');
    return { side: document.documentElement.dataset.side ?? null, pressed: document.querySelector('#task-bar [data-act="side"]')?.getAttribute('aria-pressed') ?? null,
      shown: !!side && side.getClientRects().length > 0, title: side?.querySelector('.emu-box h4')?.textContent, add: side?.querySelector('select option')?.textContent };
  });
  assert.deepEqual(await watch(), { side: 'open', pressed: 'true', shown: true, title: 'Watch', add: 'Add a signal to watch…' });
  // folded by the viewer: folded again when Emulate comes back to the front
  await page.click('#task-bar [data-act="side"]');
  await page.click('#task-switch .task-btn[data-task="edit"]');
  await page.click('#task-switch .task-btn[data-task="emu"]');
  assert.deepEqual(await watch(), { side: 'folded', pressed: 'false', shown: false, title: 'Watch', add: 'Add a signal to watch…' });
  // the modern and classic interfaces: the emulator's side column shown, as before
  for (const ui of ['classic']) {
    await page.eval(async (u) => (await import('/js/modern.js')).setInterface(u), ui);
    await page.waitFor(() => !document.documentElement.dataset.layout);
    assert.deepEqual(await watch(), { side: null, pressed: null, shown: true, title: 'Watch', add: 'Add a signal to watch…' }, ui);
  }
  await noWarnings(page);
}, { build: DEV });

// #802: Implement's side panel is the top's Processes (ISE's names and states), its page the Design Summary as cards,
// which comes forward when the implementation ends, its Programming File linking to Program, its reports in Implement
// #1063: Synthesize ▸ View RTL Schematic opens in Implement (its process's task), as the Technology Schematic does
uiTest('#1063 Tasks ▸ Implement: View RTL Schematic opens in Implement, not in Design', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'TasksRtl', template: 'gates' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksRtl');
  await page.eval(async () => { window.SilinxApp.S.toolchain = await (await import('/js/api.js')).api.toolchain(); window.SilinxApp.renderProcesses(); });
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.waitFor(() => document.getElementById('proc-caption')?.textContent === 'Processes: gates', [], { what: 'the top\'s processes' });
  await page.treeRow('#procs', 'View RTL Schematic', { dbl: true, exact: true });
  await page.waitFor(() => String(window.SilinxApp.S.active?.id).startsWith('rtl:'), [], { what: 'the RTL Schematic', timeout: 60000 });
  assert.equal((await state(page)).task, 'impl', 'Implement in front');
  assert.ok((await state(page)).current.includes('impl'));
  assert.ok(await shown(page, '#workspace > .doc:not([hidden])'), 'the RTL Schematic shown in Implement');
  // Design does not list it: its documents are the sources
  await page.click('#task-switch .task-btn[data-task="edit"]');
  await page.waitFor(() => document.documentElement.dataset.task === 'edit', [], { what: 'Design' });
  assert.ok(!(await state(page)).tabs.some((t) => /RTL/.test(t)), 'not among Design\'s documents');
  await noWarnings(page);
}, { build: DEV });

uiTest('#802 Tasks ▸ Implement: the top\'s Processes, the Design Summary as cards; it comes forward, links to Program', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'TasksImpl', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksImpl');
  await page.eval(async () => { window.SilinxApp.S.toolchain = await (await import('/js/api.js')).api.toolchain(); window.SilinxApp.renderProcesses(); });
  // a module selected in Edit (a test bench, the Test page's: #1016): Implement still lists the top's processes, Design's page
  await page.click('#task-switch .task-btn[data-task="edit"]');
  await page.click('#left-tabs .tab[data-page="test"]');
  await page.treeRow('#test-tree', 'tb_top', { exact: true });
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.waitFor(() => document.getElementById('proc-caption')?.textContent === 'Processes: top', [], { what: 'the top\'s processes' });
  assert.ok(await shown(page, '#proc-panel') && !(await shown(page, '#design-panel')), 'the Processes, not the tree');
  const procs = await page.eval(() => [...document.querySelectorAll('#procs .lbl')].filter((l) => l.getClientRects().length).map((l) => l.textContent));
  for (const p of ['Synthesize - Yosys', 'Implement Design', 'Translate', 'Map', 'Place & Route', 'Generate Programming File', 'I/O Pin Planning'])
    assert.ok(procs.includes(p), `${p}: ${procs.join(', ')}`);
  // the Design Summary as cards: side by side at a laptop's width
  const cards = await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .summary-table')].map((t) => Math.round(t.getBoundingClientRect().top)));
  assert.ok(cards.length >= 3 && new Set(cards).size < cards.length, `cards in rows: ${cards}`);
  // Implement (the task's action): when it ends, the Design Summary in front, its programming file and the link to Program
  // (another of Implement's documents in front meanwhile: I/O Pin Planning, from its process)
  await page.treeRow('#procs', 'I/O Pin Planning', { dbl: true, exact: true });
  await page.waitFor(() => window.SilinxApp.S.active?.id === 'pins', [], { what: 'I/O Pin Planning in front' });
  await page.click('#task-bar [data-act="main"]');
  await page.waitConsole(/Process "Generate Programming File" (completed successfully|failed)/, { timeout: 120000 });
  await page.waitFor(() => window.SilinxApp.S.active?.id === 'summary', [], { what: 'the summary come forward', timeout: 10000 });
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) .summary-table caption')].some((c) => c.textContent === 'Programming File'), [], { what: 'the summary with its programming file', timeout: 30000 });
  assert.equal((await state(page)).task, 'impl');
  assert.ok(await shown(page, '.doc:not([hidden]) .task-program button'));
  // a report: opened in Implement
  await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .summary-table a')].find((a) => a.textContent === 'Current').click());
  await page.waitFor(() => (window.SilinxApp.S.active?.id || '').startsWith('file:build/'), [], { what: 'a report' });
  assert.equal((await state(page)).task, 'impl');
  // Program the board…: Program's iMPACT
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.eval(() => window.SilinxApp.openSummary());
  await page.waitFor(() => window.SilinxApp.S.active?.id === 'summary', [], { what: 'the summary' });
  // (iMPACT opens in Implement: no Program task, #1172)
  await page.click('.doc:not([hidden]) .task-program button');
  await page.waitFor(() => document.documentElement.dataset.task === 'impl' && window.SilinxApp.S.active?.id === 'impact', [], { what: 'iMPACT in Implement' });
  // in Portuguese: the link
  await page.eval(() => window.SilinxApp.openSummary());
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .task-program button')?.textContent === 'Programar a placa…', [], { what: 'Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the classic interface: the summary's tables as before, no link; its tree and its views
  await page.eval(async () => (await import('/js/modern.js')).setInterface('classic'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.ok(!(await shown(page, '.doc:not([hidden]) .task-program')));
  assert.ok(await shown(page, '#design-panel'));
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
  await noWarnings(page);
}, { build: DEV, timeout: 180000 });

// #803: Program arranges iMPACT: the chain and Program FPGA / PROM; the board's tool and cable folded away; every
// operation of the PROM shown, no More… (#1025); the programming file's state no line of its own (Program FPGA asks: #1024)
// (#1172: iMPACT in Implement, the Program task gone)
uiTest('#803 #1172 Tasks ▸ Implement ▸ iMPACT: the chain and Program; settings folded; every PROM operation shown', E, async (page) => {
  await makeProject(env, { name: 'TasksProg', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksProg');
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.eval(() => window.SilinxApp.openImpact());
  await page.waitFor(() => document.documentElement.dataset.task === 'impl', [], { what: 'in Implement' });
  await page.waitFor(() => !!document.querySelector('.doc:not([hidden]) .task-prog-settings'), [], { what: 'iMPACT arranged' });
  const P = () => page.eval(() => {
    const p = document.querySelector('.doc:not([hidden]) > .page'), vis = (s) => !!p.querySelector(s)?.getClientRects().length;
    const top = (s) => Math.round(p.querySelector(s).getBoundingClientRect().top);
    return { added: p.querySelectorAll('.task-prog-state, .task-prog-impl, .task-prog-more').length, chainFirst: top('.impact-chain') < top('.imp-fpga'), settings: vis('.imp-settings'),
      prom: [...p.querySelectorAll('.prom-box .btn')].filter((b) => b.getClientRects().length).map((b) => b.textContent) };
  });
  // no implementation yet: no line about it (#1024); the board (Basys2) chose the tool and cable: folded
  assert.deepEqual(await P(), { added: 0, chainFirst: true, settings: false, prom: [] });
  assert.doesNotMatch(await page.eval(() => document.querySelector('.doc:not([hidden]) > .page').innerText), /No programming file yet|Up to date with the sources/);
  await page.click('.doc:not([hidden]) .task-prog-settings');
  assert.equal((await P()).settings, true);
  // the PROM selected in the chain: Program PROM and its other operations, all shown (#1025)
  await page.click('.doc:not([hidden]) .impact-chain .impact-dev', { index: 0 });
  await page.waitFor(() => !document.querySelector('.doc:not([hidden]) .prom-box').hidden, [], { what: 'the PROM selected' });
  assert.deepEqual((await P()).prom, ['Program PROM', 'Verify', 'Erase', 'Back up PROM', 'Reload FPGA from PROM']);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .task-prog-settings')?.textContent === 'Placa, ferramenta de programação e cabo…', [], { what: 'Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the modern interface: iMPACT as it was (its fields and every PROM button, nothing added)
  await page.eval(async () => (await import('/js/modern.js')).setInterface('classic'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.deepEqual(await page.eval(() => {
    const p = document.querySelector('.doc:not([hidden]) > .page');
    return [p.querySelectorAll('.task-prog-more, .task-prog-settings').length, !!p.querySelector('.imp-settings').getClientRects().length,
      [...p.querySelectorAll('.prom-box .btn')].filter((b) => b.getClientRects().length).length];
  }), [0, true, 5]);
  await noWarnings(page);
}, { build: DEV });

// #876: the activity bar (Start, Design, Files, Libraries) is Edit's: none in the other tasks; Implement's side panel
// its Processes whichever page Edit left in front; Program no side panel
uiTest('#876 Tasks: the activity bar in Edit only; Implement\'s Processes whatever page Edit left', E, async (page) => {
  await makeProject(env, { name: 'TasksBar', template: 'gates' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksBar');
  // (the Design pane dragged wide, as a student may leave it: its column is not left empty in the other tasks)
  await page.eval(() => { document.getElementById('left').style.width = '820px'; });
  const L = () => page.eval(() => {
    const vis = (s) => !!document.querySelector(s)?.getClientRects().length;
    return { bar: vis('#left-tabs'), left: vis('#left'), side: vis('#task-bar [data-act="side"]'), procs: vis('#proc-panel'), files: vis('#files-page') };
  });
  await page.click('#task-switch .task-btn[data-task="edit"]');
  assert.deepEqual(await L(), { bar: true, left: true, side: true, procs: false, files: false });
  // Edit's Files page in front: still Edit's only
  await page.click('#left-tabs .tab[data-page="files"]');
  assert.deepEqual(await L(), { bar: true, left: true, side: true, procs: false, files: true });
  for (const t of ['sim', 'emu']) {
    await page.click(`#task-switch .task-btn[data-task="${t}"]`);
    assert.deepEqual(await L(), { bar: false, left: false, side: true, procs: false, files: false }, t);
    // (the workspace from the window's left edge: no empty column)
    assert.ok(await page.eval(() => document.getElementById('workspace').getBoundingClientRect().left) < 4, `${t}: no empty column`);
  }
  await page.click('#task-switch .task-btn[data-task="impl"]');
  assert.deepEqual(await L(), { bar: true, left: true, side: true, procs: true, files: false }, 'Implement: its Processes (under their tab, #1160), not the Files page');
  // back to Edit: its Files page as it was left
  await page.click('#task-switch .task-btn[data-task="edit"]');
  assert.deepEqual(await L(), { bar: true, left: true, side: true, procs: false, files: true });
  // the modern interface: the activity bar as before
  await page.eval(async () => (await import('/js/modern.js')).setInterface('classic'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.ok(await shown(page, '#left-tabs'));
  await noWarnings(page);
}, { build: DEV });

// #984: Edit's pages (Start, Design, Files, Libraries) are tabs at the top of its side panel, not a column of their own:
// the open page's name shown, the others' their tooltip; folded, neither; on a narrow screen, the drawer's top row
uiTest('#984 Tasks ▸ Edit: its pages are tabs at the top of the side panel; folded, none; the drawer\'s top row; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'TasksTabs', template: 'gates' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksTabs');
  await page.click('#task-switch .task-btn[data-task="edit"]');
  const T = () => page.eval(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const l = r('#left'), t = r('#left-tabs'), p = r('#left-pages');
    return {
      row: Math.round(t.left - l.left) === 0 && Math.round(t.width - l.width) === 0 && t.height <= 40 && Math.abs(p.top - t.bottom) < 1,
      names: [...document.querySelectorAll('#left-tabs .tab')].filter((b) => b.querySelector('.tab-lbl').getBoundingClientRect().width > 1).map((b) => b.dataset.page),
      titles: [...document.querySelectorAll('#left-tabs .tab')].map((b) => b.title),
    };
  });
  assert.deepEqual(await T(), { row: true, names: ['design'], titles: ['Start', 'Design', 'Test', 'Files', 'Libraries', 'Processes'] });   // (Test: #1016; Processes: Implement's, #1160)
  // (no column of its own: the hierarchy from the window's left edge)
  assert.ok(await page.eval(() => document.querySelector('#hier').getBoundingClientRect().left) < 12);
  await page.click('#left-tabs .tab[data-page="files"]');
  assert.deepEqual((await T()).names, ['files']);
  assert.ok(await shown(page, '#files-page'));
  // folded: neither the tabs nor the pages; the document from the window's left edge
  await page.click('#task-bar [data-act="side"]');
  await page.waitFor(() => document.documentElement.dataset.side === 'folded');
  assert.ok(!(await shown(page, '#left-tabs')) && !(await shown(page, '#left')));
  assert.ok(await page.eval(() => document.getElementById('workspace').getBoundingClientRect().left) < 4);
  await page.click('#task-bar [data-act="side"]');
  await page.waitFor(() => document.documentElement.dataset.side === 'open');
  assert.deepEqual((await T()).row, true);
  // a narrow screen: the drawer, its tabs its top row; closed, nothing at the left
  await page.setViewport(900, 700);
  await page.waitFor(() => !document.documentElement.dataset.drawer || document.documentElement.dataset.drawer !== 'open'
    || document.querySelector('#left-pages').getClientRects().length);
  if (await page.eval(() => document.documentElement.dataset.drawer === 'open')) await page.click('#task-bar [data-act="side"]');
  await page.waitFor(() => document.documentElement.dataset.drawer !== 'open');
  assert.ok(!(await shown(page, '#left-tabs')));
  assert.ok(await page.eval(() => document.getElementById('workspace').getBoundingClientRect().left) < 4);
  await page.click('#task-bar [data-act="side"]');
  await page.waitFor(() => document.documentElement.dataset.drawer === 'open');
  assert.deepEqual(await page.eval(() => {
    const t = document.getElementById('left-tabs').getBoundingClientRect(), p = document.getElementById('left-pages').getBoundingClientRect();
    return { left: Math.round(t.left), width: Math.round(t.width - p.width), below: Math.abs(p.top - t.bottom) < 1, pageLeft: Math.round(p.left) };
  }), { left: 0, width: 0, below: true, pageLeft: 0 });
  await page.click('#task-bar [data-act="side"]');
  await page.setViewport(1366, 768);
  // Portuguese: the tooltips
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  assert.deepEqual((await T()).titles, ['Início', 'Projeto', 'Teste', 'Ficheiros', 'Bibliotecas', 'Processos']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the modern interface: the activity bar as before, a column with every name, no tooltips
  await page.eval(async () => (await import('/js/modern.js')).setInterface('classic'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.deepEqual(await page.eval(() => {
    const tabs = [...document.querySelectorAll('#left-tabs .tab')];
    return { below: document.getElementById('left-tabs').getBoundingClientRect().top > document.getElementById('left-pages').getBoundingClientRect().top,
      titles: tabs.filter((b) => b.title).length, names: tabs.filter((b) => b.querySelector('.tab-lbl').getBoundingClientRect().width > 1).length };
  }), { below: true, titles: 0, names: 4 });
  await noWarnings(page);
}, { build: DEV });

// #917: Simulate chooses the test bench (or a design module), creates one with the wizard, opens its source: the tree is
// Edit's. A project with no test bench: Simulate's page offers the wizard
const AND2 = 'library ieee;\nuse ieee.std_logic_1164.all;\nentity and2 is\n  port (a, b : in std_logic; y : out std_logic);\nend and2;\n'
  + 'architecture rtl of and2 is\nbegin\n  y <= a and b;\nend rtl;\n';
uiTest('#917 Tasks ▸ Simulate: no test bench, the wizard from its page; the test bench chosen in the bar; its source opened', E, async (page) => {
  await makeProject(env, { name: 'TasksBench', top: 'and2', files: { 'src/and2.vhd': AND2 } });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksBench');
  await page.click('#task-switch .task-btn[data-task="sim"]');
  const bench = () => page.eval(() => { const s = document.getElementById('task-bench'); return { value: s.value, options: [...s.options].map((o) => [o.value, o.textContent, o.disabled]) }; });
  // no test bench: said, and the wizard offered; the design module listed
  await page.waitFor(() => !document.querySelector('#task-empty .task-empty-bench').hidden, [], { what: 'the wizard offered' });
  assert.equal(await page.eval(() => document.querySelector('#task-empty p').textContent),
    'The project has no test bench yet: create one with the wizard, or simulate the top with stimuli drawn in ISim.');
  assert.deepEqual(await bench(), { value: 'and2', options: [['Design modules', 'Design modules', true], ['and2', 'and2', false], ['+new', 'New Test Bench (Wizard)…', false]] });
  // the wizard: its test bench becomes the one Simulate runs
  await page.click('#task-empty .task-empty-bench');
  await page.waitDialog('Test Bench Wizard');
  for (let k = 0; k < 4; k++) await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project.simTop === 'tb_and2', [], { what: 'the new test bench chosen' });
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await page.waitFor(() => document.getElementById('task-bench').value === 'tb_and2', [], { what: 'the choice' });
  assert.deepEqual((await bench()).options.map(([v]) => v), ['Test Benches', 'tb_and2', 'Design modules', 'and2', '+new']);
  assert.ok(await shown(page, '#task-empty') && !(await shown(page, '#task-empty .task-empty-bench')), 'a test bench: no offer');
  // a design module chosen instead: the simulation top (as Set as Top Module in the Simulation view), simulated at once (#1018)
  await page.eval(() => { const s = document.getElementById('task-bench'); s.value = 'and2'; s.dispatchEvent(new Event('change')); });
  await page.waitFor(() => window.Silinx.project.simTop === 'and2' && document.getElementById('task-bench').value === 'and2', [], { what: 'and2 chosen' });
  await page.waitFor(() => document.querySelector('#task-doc .task-doc-mod')?.textContent === 'and2', [], { what: 'ISim of and2', timeout: 30000 });
  // Edit: the chosen module's source, in Edit
  await page.click('#task-bar .task-bench-edit');
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/and2.vhd' && document.documentElement.dataset.task === 'edit', [], { what: 'its source in Edit' });
  // in Portuguese
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#task-bar .task-bench-edit').textContent === 'Editar', [], { what: 'Portuguese' });
  assert.deepEqual((await bench()).options.map(([, t]) => t), ['Bancadas de Teste', 'tb_and2', 'Módulos do projeto', 'and2', 'Nova Bancada de Teste (Assistente)…']);
  assert.equal(await page.eval(() => document.getElementById('task-bench').title), 'A bancada de teste a simular');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the toolbar fits: a laptop, a tablet in either orientation
  for (const [w, hgt] of [[1280, 800], [1180, 820], [820, 1180]]) {
    await page.setViewport(w, hgt);
    assert.deepEqual(await noOverflow(page), { page: true, over: [] }, `${w} px`);
  }
  await page.setViewport(1366, 768);
  // not in the other tasks
  await page.click('#task-switch .task-btn[data-task="edit"]');
  assert.ok(!(await shown(page, '#task-bench')) && !(await shown(page, '#task-bar .task-bench-edit')));
  await noWarnings(page);
}, { build: DEV });

// #923: Implement lists the implementation's processes only (Emulate on Board is the Emulate task's; Configure Target
// Device Implement's since #1172, no Program task); the Design Summary's cards, their captions with them, never overlap
const procRows = (page) => page.eval(() => [...document.querySelectorAll('#procs .lbl')].filter((l) => l.getClientRects().length).map((l) => l.textContent));
uiTest('#923 #1172 Tasks ▸ Implement: no Emulate processes, Configure Target Device there; the Design Summary\'s cards do not overlap', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'TasksCards', template: 'vga' });
  await tasksInterface(page);
  await page.openProject('TasksCards');
  await page.eval(async () => { window.SilinxApp.S.toolchain = await (await import('/js/api.js')).api.toolchain(); window.SilinxApp.renderProcesses(); });
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.waitFor(() => document.getElementById('proc-caption')?.textContent === 'Processes: vga', [], { what: 'the top\'s processes' });
  let procs = await procRows(page);
  assert.ok(procs.includes('Generate Programming File') && procs.includes('Generate Post-Synthesis Simulation Model'), procs.join(', '));
  for (const p of ['Emulate on Board', 'Emulate Behavioral Model (RTL)', 'Emulate Post-Synthesis Model']) assert.ok(!procs.includes(p), `${p} in Implement`);
  for (const p of ['Configure Target Device', 'Manage Configuration Project (iMPACT)']) assert.ok(procs.includes(p), `${p} in Implement`);
  // no card over another, its caption included, at every width from a tablet's to a lab desktop's
  const overlaps = () => page.eval(() => {
    const boxes = [...document.querySelectorAll('.doc:not([hidden]) .summary-table')].map((t) => {
      const r = t.getBoundingClientRect(), c = t.querySelector('caption')?.getBoundingClientRect() || r;
      return { name: t.querySelector('caption')?.textContent || 'status', top: Math.min(r.top, c.top), bottom: Math.max(r.bottom, c.bottom), left: r.left, right: r.right };
    });
    const out = [];
    for (const a of boxes) for (const b of boxes) if (a !== b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1 && a.top <= b.top) out.push(`${a.name} / ${b.name}`);
    return { cards: boxes.length, out };
  });
  const sweep = async (cards, when) => {
    for (let w = 820; w <= 1920; w += 50) {
      await page.setViewport(w, 900);
      await page.waitFor(() => new Promise((r) => requestAnimationFrame(() => r(true))));
      const o = await overlaps();
      assert.ok(o.cards >= cards, `${when}, ${w} px: ${o.cards} cards`);
      assert.deepEqual(o.out, [], `${when}, ${w} px: cards overlapping`);
    }
    await page.setViewport(1366, 768);
  };
  // before an implementation (the utilization "not yet implemented"), then after it (timing, programming file)
  await page.waitFor(() => /not yet implemented/.test(document.querySelector('.doc:not([hidden]) .summary-table caption')?.parentElement?.parentElement?.textContent || ''), [], { what: 'the summary before an implementation' });
  await sweep(3, 'before');
  await page.click('#task-bar [data-act="main"]');
  await page.waitConsole(/Process "Generate Programming File" (completed successfully|failed)/, { timeout: 120000 });
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) .summary-table caption')].some((c) => c.textContent === 'Programming File'), [], { what: 'the summary', timeout: 30000 });
  await sweep(5, 'after');
  // the modern interface: every process as before
  await page.setViewport(1366, 768);
  await page.eval(async () => (await import('/js/modern.js')).setInterface('classic'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  procs = await procRows(page);
  assert.ok(procs.includes('Emulate on Board') && procs.includes('Configure Target Device'), procs.join(', '));
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
  await noWarnings(page);
}, { build: DEV, timeout: 180000 });

// the lines of the message centre shown (its filter): [source, text]
const shownLines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].filter((l) => l.getClientRects().length).map((l) => [l.dataset.src, l.textContent]));
const pressed = (page) => page.eval(() => [...document.querySelectorAll('#mc-filters .filt[aria-pressed="true"]')].map((b) => b.dataset.src));

uiTest('Tasks: the message centre: every line\'s source, the filter following the task, ISim\'s console and command line in it', E, async (page) => {
  await makeProject(env, { name: 'TasksMsgs', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksMsgs');
  // (the Design Summary opened behind with the project does not bring Implement: the task stays Edit)
  await page.waitFor(() => document.querySelector('#doc-tabs > .tab.active')?.textContent.includes('Design Summary'), [], { what: 'the Design Summary behind' });
  assert.equal((await state(page)).task, 'edit');
  // Edit: Check (the task's action, enabled once the project is there): its lines only; All shows the application's too
  await page.waitFor(() => !document.querySelector('#task-bar [data-act="main"]').disabled, [], { what: 'Check enabled' });
  await page.click('#task-bar [data-act="main"]');
  await page.waitConsole(/Process "Check Syntax" completed successfully/);
  assert.deepEqual(await pressed(page), ['check']);
  let lines = await shownLines(page);
  assert.ok(lines.length >= 4 && lines.every(([src]) => src === 'check'), JSON.stringify(lines));
  assert.ok(lines.some(([, t]) => t === 'Started : "Check Syntax".'));
  await page.click('#mc-filters .filt[data-src="all"]');
  assert.deepEqual(await pressed(page), ['all']);
  lines = await shownLines(page);
  assert.ok(lines.some(([src, t]) => src === 'app' && /^Project "TasksMsgs" opened/.test(t)), JSON.stringify(lines));
  // Simulate: its filter (the picked one forgotten); ISim's console is not in its window, its lines are here
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await page.click('#task-empty button');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim .isim-console'), [], { what: 'ISim', timeout: 30000 });
  assert.ok(!(await shown(page, '.doc:not([hidden]) .isim-bottom')), 'ISim\'s console hidden');
  await page.click('#task-bar [data-act="console"]');
  assert.deepEqual(await pressed(page), ['sim']);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln[data-src="sim"]')].some((l) => /circuit initialization/.test(l.textContent)), [], { what: 'ISim\'s lines' });
  // one command line: ISim's while simulating
  assert.equal(await page.eval(() => document.querySelector('#mc-cmd .mc-prompt').textContent), 'SSim>');
  const before = await page.eval(() => document.querySelector('.isim-st-time').textContent);
  await page.showMessages();
  await page.click('#mc-cmd input');
  await page.type('run 2 us');
  await page.key('Enter');
  // (until the run has ended: Sim Time changes as it goes, #932)
  await page.waitFor((b) => { const t = document.querySelector('.isim-st-time').textContent; return t !== b && /3,000,000 ps/.test(t); }, [before], { what: 'ISim ran 2 us' });
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => l.textContent === 'SSim> run 2 us' && l.dataset.src === 'sim' && l.getClientRects().length), [], { what: 'the command in the message centre' });
  // folded: the last line of the filter
  await page.click('#task-bar [data-act="console"]');
  const last = await page.eval(() => [...document.querySelectorAll('#console-log .ln[data-src="sim"]')].filter((l) => l.textContent.trim()).pop().textContent);
  assert.ok(await shown(page, '#mc-last'));
  assert.equal(await page.eval(() => document.getElementById('mc-last').textContent), last);
  assert.ok(!(await shown(page, '#mc-cmd')) && !(await shown(page, '#mc-filters')));
  // Emulate: the emulator's line under Emulator; its Messages box is not in its window
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.click('#task-empty button');
  await page.waitConsole(/Board Emulator: 'top'/, { timeout: 30000 });
  await page.click('#task-bar [data-act="console"]');
  assert.deepEqual(await pressed(page), ['emu']);
  lines = await shownLines(page);
  assert.ok(lines.length && lines.every(([src]) => src === 'emu') && lines.some(([, t]) => /^Board Emulator: 'top'/.test(t)), JSON.stringify(lines));
  assert.ok(!(await shown(page, '.doc:not([hidden]) .emu-log')), 'the emulator\'s Messages box hidden');
  // Implement: Synthesis and Implementation; the command line outside ISim: the command palette
  await page.click('#task-switch .task-btn[data-task="impl"]');
  assert.deepEqual(await pressed(page), ['impl']);
  assert.equal(await page.eval(() => document.querySelector('#mc-cmd .mc-prompt').textContent), '›');
  await page.showMessages();
  await page.click('#mc-cmd input');
  await page.type('pin plan');
  await page.key('Enter');
  await page.waitFor(() => document.querySelector('.pal-input')?.value === 'pin plan', [], { what: 'the palette with the command line\'s text' });
  await page.key('Escape');
  // the classic interface: its Console shows every source again (its filters at All, #925)
  await page.eval(async () => (await import('/js/modern.js')).setInterface('classic'));
  await page.waitFor(() => document.querySelector('#mc-filters .filt[aria-pressed="true"]')?.dataset.src === 'all');
  assert.equal(await page.eval(() => document.querySelectorAll('#console-log .ln.mc-off').length), 0);
  await noWarnings(page);
}, { build: DEV });

// #1131, #1149: a release (and the local server) offers the Tasks interface as the modern one, the default: View ▸
// Interface is Modern and Classic; a stored tasks (the Tasks interface of before) opens it; the Development menu stays a
// development build's only
uiTest('#1149 without a development build: View ▸ Interface is Modern and Classic, the modern one the Tasks layout; a stored tasks opens it', E, async (page) => {
  await page.waitFor(() => window.Silinx?.startupChecked && document.querySelector('#start-page .start-box'), [], { what: 'app boot' });
  const items = await page.openMenu('View');
  assert.ok(!(await page.eval(() => [...document.querySelectorAll('#menubar .item')].some((e) => e.textContent === 'Development'))), 'no Development menu');
  await page.hover(await page.point('body > .menu-popup > .mi', { index: items.findIndex((x) => x.label === 'Interface') }));
  await page.waitForSelector('.menu-popup.sub .mi');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.menu-popup.sub .mi .lbl')].map((l) => l.textContent)), ['Modern', 'Classic']);
  await page.closeMenus();
  for (const stored of ['tasks', 'modern']) {
    await page.eval((x) => localStorage.setItem('silinx.ui', x), stored);
    await page.reload();
    await page.waitFor(() => window.Silinx?.startupChecked && document.querySelector('#start-page .start-box'), [], { what: 'app boot' });
    assert.deepEqual(await page.eval(() => [document.documentElement.dataset.ui, document.documentElement.dataset.layout ?? null]), ['modern', 'tasks'], stored);
    assert.ok((await shown(page, '#task-switch')) || (await shown(page, '#task-tabs')), stored);
  }
  // (a project opened: the start-up checks' warnings, which depend on the computer, are cleared)
  await makeProject(env, { name: 'TasksStored', template: 'gates' });
  await page.openProject('TasksStored');
  await noWarnings(page);
});

uiTest('#882 Tasks: Simulate and Emulate, their side panel open or folded, have no empty column where the Design pane is', E, async (page) => {
  await makeProject(env, { name: 'TasksLeft', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksLeft');
  // the Design pane as a viewer leaves it: wide (#left's width, from its splitter)
  await page.eval(() => { document.getElementById('left').style.width = '520px'; });
  // the gap between the activity bar and the task's document: #left is the activity bar only
  const gap = () => page.eval(() => {
    const l = document.getElementById('left').getBoundingClientRect(), t = document.getElementById('left-tabs').getBoundingClientRect();
    const d = document.querySelector('#workspace > .doc:not([hidden])').getBoundingClientRect();
    return { left: Math.round(l.width - t.width), doc: Math.round(d.left - t.right) };
  });
  const sideOpen = (open) => page.eval((o) => {
    if ((document.documentElement.dataset.side === 'open') !== o) document.querySelector('#task-bar [data-act="side"], [data-act="side"]').click();
  }, open);
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await page.click('#task-empty button');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim'), [], { what: 'ISim', timeout: 30000 });
  for (const open of [true, false]) {
    await sideOpen(open);
    await page.waitFor((o) => document.documentElement.dataset.side === (o ? 'open' : 'folded'), [open]);
    assert.deepEqual({ open, ...await gap() }, { open, left: 0, doc: 0 }, 'Simulate');
    assert.equal(await shown(page, '.isim .isim-left'), open, 'ISim\'s Instances and Objects: the side panel');
  }
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.click('#task-empty button');
  await page.waitConsole(/Board Emulator: 'top'/, { timeout: 30000 });
  for (const open of [true, false]) {
    await sideOpen(open);
    await page.waitFor((o) => document.documentElement.dataset.side === (o ? 'open' : 'folded'), [open]);
    assert.deepEqual({ open, ...await gap() }, { open, left: 0, doc: 0 }, 'Emulate');
  }
  // Edit: the Design pane, its width as left
  await page.click('#task-switch .task-btn[data-task="edit"]');
  await sideOpen(true);
  assert.equal(await page.eval(() => Math.round(document.getElementById('left').getBoundingClientRect().width)), 520);
  await noWarnings(page);
}, { build: DEV });

uiTest('#1102 Tasks ▸ Simulate: the test bench\'s Edit button has its label centred', E, async (page) => {
  await makeProject(env, { name: 'TasksEdit', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksEdit');
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await page.waitFor(() => document.querySelector('.task-bench-edit')?.getClientRects().length > 0, [], { what: 'the Edit button' });
  const off = await page.eval(() => {
    const b = document.querySelector('.task-bench-edit'), r = b.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(b);
    const t = range.getBoundingClientRect();
    return { text: b.textContent, dx: Math.round((t.left + t.width / 2) - (r.left + r.width / 2)), dy: Math.round((t.top + t.height / 2) - (r.top + r.height / 2)) };
  });
  assert.equal(off.text, 'Edit');
  assert.ok(Math.abs(off.dx) <= 1 && Math.abs(off.dy) <= 1, JSON.stringify(off));
}, { build: DEV });

// #1162: Implement's Processes for a project with no top module, opened after one with its processes and states: none of
// the last project's
uiTest('#1162 Tasks ▸ Implement: a project with no top opened after another shows none of its processes', E, async (page) => {
  await makeProject(env, { name: 'ImplFull', template: 'blinky' });
  await makeProject(env, { name: 'ImplEmpty' });
  await tasksInterface(page);
  await page.openProject('ImplFull');
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.waitFor(() => [...document.querySelectorAll('#procs .lbl')].some((e) => e.textContent.startsWith('Synthesize')), [], { what: 'the top\'s processes' });
  await page.eval(() => { window.SilinxApp.S.status.synth = 'ok'; window.SilinxApp.renderProcesses(); });
  await page.openProject('ImplEmpty');
  await page.click('#task-switch .task-btn[data-task="edit"]');
  await page.click('#task-switch .task-btn[data-task="impl"]');
  assert.deepEqual(await page.eval(() => ({ caption: document.getElementById('proc-caption').textContent, rows: [...document.querySelectorAll('#procs .lbl')].map((e) => e.textContent), states: document.querySelectorAll('#procs .status svg').length })),
    { caption: 'Processes: ', rows: ['Design Summary/Reports'], states: 0 });
  await page.eval(() => localStorage.removeItem('silinx.ui'));
}, { build: DEV });

// #1159, #1160: the side panel's tabs without a heading under them (Edit's pages: Start, Design, Files, Libraries);
// Implement's Processes under a tab of their own, as Edit's pages, with none of the top's drawing (View/Edit Schematic:
// Design's); in Portuguese; the classic interface keeps its headings and has no such tab
uiTest('#1159 #1160 Tasks: no heading under the side panel\'s tabs; Implement\'s Processes under a tab, without the top\'s drawing', E, async (page) => {
  await makeProject(env, { name: 'TasksHeads', template: 'gates' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksHeads');
  await page.click('#task-switch .task-btn[data-task="edit"]');
  const heading = () => page.eval(() => [...document.querySelectorAll('#left-pages .ise-panel > .caption')].filter((c) => c.getClientRects().length).map((c) => c.textContent));
  for (const p of ['start', 'design', 'files', 'libraries']) {
    await page.click(`#left-tabs .tab[data-page=${p}]`);
    assert.deepEqual(await heading(), [], p);
  }
  assert.equal(await shown(page, '#task-procs-tab'), false, 'not in Edit');
  // Implement: one tab, Processes, its name shown; the processes without View/Edit Schematic
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.waitFor(() => [...document.querySelectorAll('#procs .lbl')].some((e) => e.textContent.startsWith('Synthesize') && e.getClientRects().length), [], { what: 'Implement\'s Processes' });
  const impl = () => page.eval(() => ({
    tabs: [...document.querySelectorAll('#left-tabs .tab')].filter((t) => t.getClientRects().length).map((t) => [t.dataset.page, t.querySelector('.tab-lbl').getBoundingClientRect().width > 1 ? t.querySelector('.tab-lbl').textContent : '']),
    above: document.getElementById('left-tabs').getBoundingClientRect().bottom <= document.getElementById('procs').getBoundingClientRect().top + 1,
    drawing: [...document.querySelectorAll('#procs .row')].filter((r) => r.getClientRects().length).map((r) => r.querySelector('.lbl').textContent).filter((l) => /^View\/Edit/.test(l)),
  }));
  assert.deepEqual(await impl(), { tabs: [['procs', 'Processes']], above: true, drawing: [] });
  assert.deepEqual(await heading(), []);
  // (the top selected with its drawing, as Design's tree selects it: in the list, not shown)
  await page.eval(() => { const A = window.SilinxApp; A.S.sel = { type: 'module', module: 'gates', file: 'src/gates.vhd', sch: 'src/gates.sch.json' }; A.renderProcesses(); });
  assert.ok(await page.eval(() => [...document.querySelectorAll('#procs .lbl')].some((e) => e.textContent === 'View/Edit Schematic')), 'in the list');
  assert.deepEqual((await impl()).drawing, []);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  assert.deepEqual((await impl()).tabs, [['procs', 'Processos']]);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the classic interface: its headings, no Processes tab
  await page.eval(async () => (await import('/js/modern.js')).setInterface('classic'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.equal(await page.eval(() => document.getElementById('task-procs-tab')), null);
  assert.ok((await heading()).length > 0);
  await noWarnings(page);
}, { build: DEV });

// #1171: a project opens in Design (its Design page), whatever task its documents (the Design Summary: Implement's)
// or the last session left in front: opened from the app, or again at start-up after a reload
uiTest('#1171 #1191 Tasks: a project opens in Design, its Design page; at start-up where the user was; what is opened right after it in front', E, async (page) => {
  await makeProject(env, { name: 'TasksOpenA', template: 'blinky' });
  await makeProject(env, { name: 'TasksOpenB', template: 'gates' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  const where = () => page.eval(() => [document.documentElement.dataset.task, document.querySelector('#left-tabs .tab.active')?.dataset.page]);
  await page.openProject('TasksOpenA');
  await page.waitFor(() => document.documentElement.dataset.task === 'edit', [], { what: 'Design' });
  assert.deepEqual(await where(), ['edit', 'design']);
  // Implement in front, its Design Summary, and the Files page: another project opens in Design
  await page.click('#left-tabs .tab[data-page=files]');
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.waitFor(() => window.Silinx.active?.id === 'summary', [], { what: 'the Design Summary' });
  await page.openProject('TasksOpenB');
  await page.waitFor(() => document.documentElement.dataset.task === 'edit', [], { what: 'Design' });
  assert.deepEqual(await where(), ['edit', 'design']);
  // Implement in front again, a reload: the app reopens the project at start-up where the user was, in Implement (#1191)
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.waitFor(() => window.Silinx.active?.id === 'summary', [], { what: 'the Design Summary' });
  await page.reload();
  await page.waitFor(() => window.Silinx?.project?.name === 'TasksOpenB' && window.Silinx.active?.id === 'summary', [], { what: 'the project open again', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await page.eval(() => document.documentElement.dataset.task), 'impl');
  // a document opened right after the project opens: its task, not Design over it (#1191)
  await page.openProject('TasksOpenA');
  await page.eval(() => window.SilinxApp.openImpact());
  await page.waitFor(() => document.documentElement.dataset.task !== 'edit' && window.Silinx.active?.id === 'impact', [], { what: 'iMPACT in front' });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await page.eval(() => window.Silinx.active?.id), 'impact');
  await noWarnings(page);
}, { build: DEV });
