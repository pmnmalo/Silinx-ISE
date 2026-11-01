// UI: the Tasks interface (#804, web/js/tasks.js, web/css/tasks.css), the Silinx one since #1149: the task
// switcher in the header (a tab bar at the bottom of a narrow screen), each task with its own arrangement
// and documents (the side panel and the messages folded or open, the last document in front), a task with
// no document offering its action, a maximized document; at a laptop's and a tablet's sizes, in English and
// Portuguese; its message centre (#798: the bottom panel's sources and filters, ISim's console and command
// line in it). The ISE style interface is unchanged (test/ui/modern.test.js).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, chromeOnly, tick } from './harness.js';
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

// (#1149: the Tasks interface is the Silinx one: chosen as View ▸ Interface ▸ Silinx, from the ISE style one)
uiTest('View ▸ Interface ▸ Silinx: the task switcher in the header, the task\'s bar; live, remembered, and back to ISE style', E, async (page) => {
  await page.setViewport(1366, 768);
  // from the ISE style interface (whatever interface the suite runs in: SILINX_UI_INTERFACE)
  await page.eval(() => localStorage.setItem('silinx.ui', 'ise'));
  await page.reload();
  await page.waitFor(() => window.Silinx?.startupChecked && document.querySelector('#start-page .start-box'), [], { what: 'app boot' });
  // the ISE style interface has none of it
  assert.ok(!(await shown(page, '#task-switch')) && !(await shown(page, '#task-bar')) && !(await shown(page, '#task-tabs')));
  assert.ok(await shown(page, '#statusbar'), 'the ISE style interface keeps its status bar');
  const items = await page.openMenu('View');
  await page.hover(await page.point('body > .menu-popup > .mi', { index: items.findIndex((x) => x.label === 'Interface') }));
  await page.waitForSelector('.menu-popup.sub .mi');
  const subs = await page.eval(() => [...document.querySelectorAll('.menu-popup.sub .mi .lbl')].map((l) => l.textContent));
  assert.deepEqual(subs, ['Silinx', 'ISE style']);
  await page.click('.menu-popup.sub .mi', { index: 0 });
  await page.waitFor(() => document.documentElement.dataset.layout === 'tasks', [], { what: 'the Tasks interface' });
  const L = await page.eval(() => ({
    ui: document.documentElement.dataset.ui, stored: localStorage.getItem('silinx.ui'),
    tasks: [...document.querySelectorAll('#task-switch .task-btn')].map((b) => b.textContent),
    bar: [...document.querySelectorAll('#task-bar [title]')].map((b) => b.title),
    view: [...document.querySelectorAll('#task-view [title]')].map((b) => b.title),
  }));
  assert.deepEqual(L, {
    ui: 'silinx', stored: 'silinx', tasks: ['Design', 'Simulate', 'Emulate', 'Implement'],   // (no Program: Implement's, #1172)
    bar: ['Close'],   // (Close: a single document's, #854; Simulate's choices on its page, #1291; no action button, #1292)
    // (in the header, #1218; the Split button before Maximize, #1652, #1657)
    view: ['Show or hide the side panel', 'Show or hide the messages', 'Split the editor: two documents side by side, each side with its tabs', 'Maximize the document (double-click its tab)'],
  });
  assert.ok(await shown(page, '#task-switch'));
  assert.ok(!(await shown(page, '#task-tabs')), 'the bottom tab bar: on a narrow screen only');
  assert.ok(!(await shown(page, '#statusbar')), 'no status bar in the Tasks interface (#1039)');
  // with no project: Edit, its page says what it does, no button (Check Design is under the tree, #1349)
  assert.deepEqual(await state(page), { task: 'edit', side: 'open', console: 'open', max: 'off', current: ['edit'], tabs: [], empty: true });
  assert.deepEqual(await page.eval(() => [document.querySelector('#task-empty p').textContent, document.querySelector('#task-empty .m-step').getClientRects().length]), ['Open a source from the Design panel.', 0]);
  // the theme menu (not the ISE style interface's)
  assert.ok((await page.openMenu('View')).some((x) => x.label === 'Theme'));
  await page.closeMenus();
  // remembered: the page loads in the Tasks interface (set before the first paint)
  await page.reload();
  await page.waitFor(() => window.Silinx?.startupChecked, [], { what: 'app boot' });
  assert.deepEqual(await page.eval(() => [document.documentElement.dataset.ui, document.documentElement.dataset.layout]), ['silinx', 'tasks']);
  assert.deepEqual(await noOverflow(page), { page: true, over: [] });
  // back to ISE style: none of it, its status bar again
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.ok(!(await shown(page, '#task-switch')) && !(await shown(page, '#task-bar')));
  assert.ok(await shown(page, '#statusbar'), 'back in the ISE style interface, the status bar again');
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
  // Simulate, nothing simulated yet: its page and its action; the editor is not shown, the messages shown (#1429), its
  // side panel open (#1408)
  await page.click('#task-switch .task-btn[data-task="sim"]');
  s = await state(page);
  assert.deepEqual(s, { task: 'sim', side: 'open', console: 'open', max: 'off', current: ['sim'], tabs: [], empty: true });
  assert.ok(!(await shown(page, '.doc .cm-editor')));
  assert.ok(!(await shown(page, '#hier')) && !(await shown(page, '#left-tabs')), 'no Design pane, no activity bar (Edit\'s, #876)');
  assert.ok(await shown(page, '#console-body') && await shown(page, '#console-tabs'));
  assert.equal(await page.eval(() => document.querySelector('#task-empty h2').textContent), 'Simulate');
  // its action: the simulation of the top module (as the toolbar's Simulate of the Silinx interface)
  await page.click('#task-sim-panel .task-sim-bench .row.sel');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim'), [], { what: 'ISim', timeout: 30000 });
  s = await state(page);
  assert.equal(s.task, 'sim');
  assert.equal(s.empty, false);
  assert.deepEqual(s.tabs, ['SSim (tb_top)'], 'its tab: several simulations may be open (#1161)');
  assert.equal(await page.eval(() => window.Silinx.active.title), 'SSim (tb_top)', 'the test bench (#800)');
  // the side panel open (#1408), folded from the task's bar, kept for Simulate, open again
  assert.equal((await state(page)).side, 'open');
  await page.click('#task-view [data-act="side"]');
  assert.equal((await state(page)).side, 'folded');
  await page.click('#task-view [data-act="side"]');
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
  await page.click('#task-view [data-act="max"]');
  assert.equal((await state(page)).max, 'off');
  assert.ok(await shown(page, '#left'));
  // the messages: shown in Simulate (#1429), folded and open again from the bar
  await page.click('#task-switch .task-btn[data-task="sim"]');
  assert.equal((await state(page)).console, 'open');
  await page.click('#task-view [data-act="console"]');
  assert.equal((await state(page)).console, 'folded');
  await page.click('#task-view [data-act="console"]');
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

uiTest('Tasks on a tablet: the tab bar at the bottom in portrait, the header\'s switcher in landscape; the side panel docked (#1463)', E, async (page) => {
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
  // the side panel docked beside the document, not a drawer (#1463): Design's hierarchy shown, a document opened beside it,
  // at most 45 % of the window, no drawer button nor scrim
  const docked = () => page.eval(() => {
    const l = document.getElementById('left').getBoundingClientRect(), w = document.getElementById('workspace').getBoundingClientRect();
    return { side: document.documentElement.dataset.side, hier: document.getElementById('hier').getClientRects().length > 0, beside: w.left >= l.right - 1,
      share: l.width > 200 && l.width <= innerWidth * 0.45 + 1, drawer: ['drawer-btn', 'drawer-scrim'].filter((id) => document.getElementById(id).getClientRects().length),
      pressed: document.querySelector('#task-view [data-act="side"]').getAttribute('aria-pressed') };
  });
  await page.waitFor(() => document.getElementById('hier').getClientRects().length > 0, [], { what: 'the Design hierarchy' });
  assert.deepEqual(await docked(), { side: 'open', hier: true, beside: true, share: true, drawer: [], pressed: 'true' });
  await page.dblclick('#hier .row .lbl', { text: 'gates' });
  await page.waitFor(() => document.querySelector('#doc-tabs > .tab.active')?.textContent.includes('gates.sch'), [], { what: 'the schematic opened' });
  assert.deepEqual(await docked(), { side: 'open', hier: true, beside: true, share: true, drawer: [], pressed: 'true' });
  // Implement brought to the front: its Processes docked as well
  await page.click('#task-tabs .task-btn[data-task="impl"]');
  await page.waitFor(() => document.querySelector('#doc-tabs > .tab.active')?.textContent.includes('Design Summary'), [], { what: 'the Design Summary' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#task-tabs .task-btn[aria-current="true"]')].map((b) => b.dataset.task)), ['impl']);
  assert.ok(await shown(page, '#procs'));
  // the bar's side button folds it (the document from the window's left edge) and opens it again
  await page.click('#task-view [data-act="side"]');
  await page.waitFor(() => document.documentElement.dataset.side === 'folded', [], { what: 'folded' });
  assert.ok(!(await shown(page, '#left')) && await page.eval(() => document.getElementById('workspace').getBoundingClientRect().left) < 4);
  await page.click('#task-view [data-act="side"]');
  await page.waitFor(() => document.documentElement.dataset.side === 'open', [], { what: 'open again' });
  assert.ok(await shown(page, '#procs'));
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
  assert.equal(await page.eval(() => document.querySelector('#task-empty p').textContent), 'Abra uma fonte no painel Projeto.');
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
    // (#1217: with no Project, Process and Tools menus every label may fit there too)
    else assert.ok((f.fit === '' && f.labels.length === 4) || (['current', 'icons', 'tight'].includes(f.fit) && f.labels.length <= 1), `${w} px: every label, or the current label at most (${f.fit}; how short the header is depends on the system's fonts)`);
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
  // (#1217: with no Project, Process and Tools menus every label may fit down to the narrow layout: none then)
  if (current) assert.deepEqual((await fit(page)).labels, ['edit']);
  else assert.deepEqual((await fit(page)).labels, ['edit', 'sim', 'emu', 'impl'], 'every label down to 1040 px');
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

// #854: Emulate has one document (a new one replaces the old; Simulate its tabs, #1161; iMPACT Implement's, #1172); its tab,
// as the other tasks', no document's title in the task's bar (#1426); Edit keeps its tabs
const docInfo = (page) => page.eval(() => {
  const vis = (e) => !!e && e.getClientRects().length > 0;
  const i = document.getElementById('task-doc');
  return { tabs: vis(document.getElementById('doc-tabs')), info: vis(i) ? [...i.querySelectorAll('span')].filter(vis).map((x) => x.textContent) : null };
});
uiTest('#854 #1161 #1426 Tasks: Emulate\'s document in its tab, no title in the task\'s bar; Simulate its tabs', E, async (page) => {
  await makeProject(env, { name: 'TasksSingle', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksSingle');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitForSelector('.doc:not([hidden]) .cm-editor');
  assert.deepEqual(await docInfo(page), { tabs: true, info: null }, 'Edit keeps its tabs, even with one file');
  // Simulate: none open, its page alone (no tab bar, #1289); then ISim in its tab, its tab bar as Edit's (several
  // simulations may be open, #1161)
  await page.click('#task-switch .task-btn[data-task="sim"]');
  assert.deepEqual(await docInfo(page), { tabs: false, info: null });
  await page.click('#task-sim-panel .task-sim-bench .row.sel');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim'), [], { what: 'ISim', timeout: 30000 });
  assert.deepEqual(await docInfo(page), { tabs: true, info: null });
  // Emulate: the board, RTL
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.dblclick('#task-emu-panel .row .lbl', { text: 'Emulate Behavioral Model (RTL)' });
  await page.waitConsole(/Board Emulator: 'top'/, { timeout: 30000 });
  assert.deepEqual(await docInfo(page), { tabs: true, info: null });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#doc-tabs > .tab')].filter((t) => t.getClientRects().length).map((t) => t.textContent)), ['Board Emulator (top)✕']);
  // its tab's close: the emulator closes, the task's page again
  await page.click('#doc-tabs > .tab.active .tclose');
  await page.waitFor(() => !window.SilinxApp.findDoc('emulator'), [], { what: 'the emulator closed' });
  assert.deepEqual(await docInfo(page), { tabs: false, info: null });
  assert.ok(await shown(page, '#task-empty'));
  // back to Edit: its tabs
  await page.click('#task-switch .task-btn[data-task="edit"]');
  assert.deepEqual(await docInfo(page), { tabs: true, info: null });
  // the ISE style interface: its tab bar as before
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.equal(await page.eval(() => document.documentElement.dataset.single), undefined);
  assert.ok(await shown(page, '#doc-tabs'));
  await noWarnings(page);
}, { build: DEV });

// #799: Edit's Design pane is one tree, no views: the design, then the constraints; the test benches are Simulate's
// (its Simulation and Instances, #1161); Check checks the selected module
// the task's action, as its design-flow button runs it (no button in the task's bar: #1292)
const STEP = { edit: 'check', sim: 'simulate', emu: 'emulate', impl: 'implement' };
const taskAction = (page) => page.eval((m) => document.querySelector(`#toolbar .m-step[data-step="${m[document.documentElement.dataset.task]}"]`).click(), STEP);
const hierRows = (page) => page.eval(() => [...document.querySelectorAll('#hier .row')].filter((r) => r.getClientRects().length)
  .map((r) => [r.querySelector('.lbl').textContent, ...[...r.querySelectorAll('.badge')].map((b) => b.textContent)].join(' ')));
uiTest('#799 Tasks ▸ Edit: one design tree (the design, no constraints: #1250), no views; Check of the selected module', E, async (page) => {
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
  assert.ok(at('Test Benches') === -1 && at('tb_top') === -1, rows.join(' | '));   // (Simulate's, #1161)
  assert.ok(at('Constraints') === -1 && !rows.some((r) => /\.ucf\b/.test(r)), rows.join(' | '));   // (#1250)
  // Check of the selected module, no error
  await page.treeRow('#hier', 'top', { exact: true });
  await taskAction(page);
  await page.waitConsole(/Process "Check Syntax" completed successfully/);
  assert.equal(await page.eval(() => document.getElementById('err-count').textContent), '');
  // the ISE style interface: its views and Processes again, no constraints either
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.ok(await shown(page, '#design-panel .view-select') && await shown(page, '#proc-panel'));
  assert.ok(!(await hierRows(page)).some((r) => r === 'Test Benches' || r === 'Constraints' || /\.ucf\b/.test(r)));
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
  await taskAction(page);
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
  if (await page.eval(() => document.documentElement.dataset.console === 'open')) await page.click('#task-view [data-act="console"]');
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
  // the Silinx interface: the editor's panel, as before
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  await page.click(`${ED} .se-btn[data-act=check]`);
  await page.waitFor((sel) => { const d = document.querySelector(`${sel} .se-diags`); return d && !d.hidden && /^Check Schematic: 1 error/.test(d.textContent); }, [ED], { what: 'the editor\'s panel' });
}, { build: DEV });

// #1042: no project chip in the header, in any interface (a project is opened from File and the Start page, its
// name is in Design)
uiTest('#1042 no project chip in the header: Silinx (Tasks) and ISE style', E, async (page) => {
  await makeProject(env, { name: 'TasksChip', template: 'gates' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksChip');
  for (const ui of ['silinx', 'ise']) {
    if (ui !== 'silinx') await page.eval(async (x) => (await import('/js/modern.js')).setInterface(x), ui);
    await page.waitFor((x) => (x === 'silinx') === (document.documentElement.dataset.layout === 'tasks'), [ui], { what: ui });
    assert.equal(await page.eval(() => document.getElementById('title-project')), null, ui);
    // (ISE style's title is ISE's, "TasksChip - [Design Summary]": the project there is the window's title, not a chip)
    if (ui !== 'ise') assert.doesNotMatch(await page.eval(() => document.getElementById('titlebar').innerText), /TasksChip/, ui);
  }
  await page.eval(async () => (await import('/js/modern.js')).setInterface('silinx'));
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
    [['?', 'Select simulation model...'], ['', 'Behavioral'], ['postsynth', 'Post-Synthesis'], ['posttrans', 'Post-Translate'], ['postmap', 'Post-Map'], ['postpar', 'Post-Place & Route']]);
  // (a test bench: the side panel's rows, the choices not shown, #1378)
  assert.ok(await shown(page, '#task-sim-panel .task-sim-bench') && !(await shown(page, '#task-model')));
  await page.click('#task-sim-panel .task-sim-bench .row.sel');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim .isim-wavewin'), [], { what: 'ISim', timeout: 30000 });
  await page.waitFor(() => window.Silinx.active?.title === 'SSim (tb_top)', [], { what: 'the test bench simulated' });
  // no ISim title bar, no Design pane, no console; its Instances and Objects shown at first (#1408)
  assert.ok(!(await shown(page, '.doc:not([hidden]) .isim-title')) && await shown(page, '.doc:not([hidden]) .isim-left'));
  assert.ok(!(await shown(page, '#left-pages')) && !(await shown(page, '#left-tabs')));
  // the side panel folded: the waves get the screen
  await page.click('#task-view [data-act="side"]');
  await page.waitFor(() => !document.querySelector('.doc:not([hidden]) .isim-left')?.getClientRects().length, [], { what: 'folded' });
  const W = await page.eval(() => {
    const w = document.querySelector('.doc:not([hidden]) .isim-wavewin').getBoundingClientRect(), ws = document.getElementById('workspace').getBoundingClientRect();
    return { width: Math.round(w.width), ws: Math.round(ws.width), height: Math.round(w.height) };
  });
  assert.ok(W.width >= W.ws - 4, `the wave window has the workspace's width: ${JSON.stringify(W)}`);
  assert.ok(W.height >= 0.55 * 768, `and most of the height: ${JSON.stringify(W)}`);
  // the side panel: ISim's Instances and Objects (not the Design pane)
  await page.click('#task-view [data-act="side"]');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim-left')?.getClientRects().length > 0, [], { what: 'Instances and Objects' });
  assert.ok(!(await shown(page, '#left-pages')));
  // not in the other tasks
  await page.click('#task-switch .task-btn[data-task="edit"]');
  assert.ok(!(await shown(page, '#task-model')) && await shown(page, '#left-pages'));
  // in Portuguese: the models
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelectorAll('#task-model option')[1].textContent === 'Comportamental', [], { what: 'Portuguese' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#task-model option')].map((o) => o.textContent)),
    ['Selecione o modelo de simulação...', 'Comportamental', 'Pós-Síntese', 'Pós-Translate', 'Pós-Map', 'Pós-Place & Route']);
  assert.equal(await page.eval(() => document.getElementById('task-model').title), 'O modelo a simular');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // a tablet in portrait: the same (the side button folds ISim's columns, not the drawer, which Simulate has not)
  await page.setViewport(820, 1180);
  assert.ok(!(await shown(page, '#drawer-btn')));
  await page.click('#task-view [data-act="side"]');
  await page.waitFor(() => !document.querySelector('.doc:not([hidden]) .isim-left')?.getClientRects().length, [], { what: 'the columns folded' });
  const P = await page.eval(() => [Math.round(document.querySelector('.doc:not([hidden]) .isim-wavewin').getBoundingClientRect().width), Math.round(document.getElementById('workspace').getBoundingClientRect().width)]);
  assert.ok(P[0] >= P[1] - 4, `portrait: the waves have the width: ${P}`);
  assert.deepEqual(await noOverflow(page), { page: true, over: [] });
  await page.setViewport(1366, 768);
  // the Silinx interface: ISim as it was (its title bar, its Instances and Objects)
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
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
  await page.setViewport(1680, 1050);   // (a laptop: the side panel, the board and the Watch side by side, #1399)
  await tasksInterface(page);
  await page.openProject('TasksEmu');
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.dblclick('#task-emu-panel .row .lbl', { text: 'Emulate Behavioral Model (RTL)' });
  await page.waitConsole(/Board Emulator: 'top'/, { timeout: 30000 });
  await page.waitFor(() => +document.querySelector('.doc:not([hidden]) .emu-board-wrap')?.style.zoom > 0, [], { what: 'the board zoomed' });
  assert.ok(!(await shown(page, '#design-panel')) && await shown(page, '#task-emu-panel'), 'no Design pane in Emulate: its Processes (#1399)');
  // the emulator's Watch, shown at first (#1020), beside the board; the board still fits
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .emu-side')?.getClientRects().length > 0, [], { what: 'Watch' });
  await page.waitFor(() => new Promise((r) => requestAnimationFrame(() => r(true))));
  // (refitted once the side panel is in place: the Watch beside the board)
  await page.waitFor(() => { const e = document.querySelector('.doc:not([hidden]) .emu'), w = e.querySelector('.emu-side').getBoundingClientRect(); return w.left >= e.querySelector('.emu-board-wrap').getBoundingClientRect().right - 1; }, [], { what: 'the Watch beside the board' });
  let f = await boardFit(page);
  // (the board at its proper size at least, #1021: on a screen 768 high its note may be scrolled to)
  assert.ok(f.controls >= 12 && f.inside && f.aim && f.side === 'beside', JSON.stringify(f));
  // a tablet in portrait: the board at its size (#1021), Watch below it
  await page.setViewport(820, 1180);
  // (the side panel docked there, as Implement's, #1463)
  await page.waitFor(() => { const e = document.querySelector('.doc:not([hidden]) .emu'); const s = e.querySelector('.emu-side').getBoundingClientRect(); const b = e.querySelector('.emu-board-wrap').getBoundingClientRect(); return s.top >= b.bottom - 1 && b.right <= innerWidth; }, [], { what: 'Watch below the board, the board refitted' });
  f = await boardFit(page);
  assert.ok(f.inside && f.aim && f.side === 'below', JSON.stringify(f));
  assert.deepEqual(await noOverflow(page), { page: true, over: [] });
  // a lab desktop, the side panel folded (the Watch kept, beside the board, #1399): a larger board
  await page.setViewport(1920, 1080);
  await page.click('#task-view [data-act="side"]');
  await page.waitFor(() => +document.querySelector('.doc:not([hidden]) .emu-board-wrap').style.zoom > 1, [], { what: 'a larger board' });
  f = await boardFit(page);
  assert.ok(f.inside && f.aim && f.side === 'beside', JSON.stringify(f));
  // the Silinx interface: the board at its own size again
  await page.setViewport(1366, 768);
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-board-wrap').style.zoom), '');
  await noWarnings(page);
}, { build: DEV });

// #1021, #1999: the board fits the window (zoomed up on a large window; down on a smaller one, a tablet, to 0.7 at
// least), the emulator's bar above it, never under it; when the width runs short, the Watch and the VGA monitor wrap to
// the next row, below the board, and the emulator's area scrolls down, not across; a laptop, a tablet in landscape and
// in portrait; the ISE style interface as before
const emuLayout = (page) => page.eval(() => {
  const emu = document.querySelector('.doc:not([hidden]) .emu'), wrap = emu.querySelector('.emu-board-wrap'), pcb = wrap.querySelector('.emu-pcb');
  const wr = wrap.getBoundingClientRect(), pr = pcb.getBoundingClientRect();
  const where = (el) => { const r = el.getBoundingClientRect(); return !el.getClientRects().length ? 'folded' : r.left >= wr.right - 1 ? 'beside' : r.top >= wr.bottom - 1 ? 'below' : 'over'; };
  return { zoom: +wrap.style.zoom || 1, proper: pr.width >= parseFloat(pcb.style.width) - 0.5 && pr.height >= parseFloat(pcb.style.height) - 0.5,
    watch: where(emu.querySelector('.emu-side')), vga: where(emu.querySelector('.emu-vga')),
    scrollsDown: emu.scrollHeight > emu.clientHeight + 1, scrollsAcross: emu.scrollWidth > emu.clientWidth + 1 };
});
uiTest('#1021 #1999 Tasks ▸ Emulate: the board fits the window; the Watch and the VGA monitor wrap below it, scrolling down; ISE style as before', E, async (page) => {
  await makeProject(env, { name: 'TasksWrap', template: 'vga' });
  await page.setViewport(1280, 800);
  await tasksInterface(page);
  await page.openProject('TasksWrap');
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.dblclick('#task-emu-panel .row .lbl', { text: 'Emulate Behavioral Model (RTL)' });
  await page.waitConsole(/Board Emulator: 'vga'/, { timeout: 60000 });
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .emu-vga'), [], { what: 'the VGA monitor' });
  const at = async (w, hgt) => {
    await page.setViewport(w, hgt);
    await page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return emuLayout(page);
  };
  // a laptop: the board a little larger, the Watch beside it, the VGA monitor below (scrolled to); a smaller one, the
  // Emulate side panel beside them (#1399): the Watch below too
  let L = await at(1680, 1050);
  assert.ok(L.zoom >= 1, JSON.stringify(L));
  assert.deepEqual({ ...L, zoom: undefined }, { zoom: undefined, proper: true, watch: 'beside', vga: 'below', scrollsDown: true, scrollsAcross: false });
  // (smaller than its proper size, down to 0.7, and the bar above the board, #1999; the Watch below it, or beside it
  // when the board, fitting the height, leaves it the room: the Basys2 in its proportions, #2479)
  const fits = (L, what, watch = ['below']) => assert.ok(L.zoom >= 0.7 && L.zoom < 1 && !L.proper && watch.includes(L.watch) && L.vga === 'below' && !L.scrollsAcross, `${what}: ${JSON.stringify(L)}`);
  const barAbove = () => page.eval(() => { const e = document.querySelector('.doc:not([hidden]) .emu'); return e.querySelector('.emu-bar').getBoundingClientRect().bottom <= e.querySelector('.emu-board-wrap').getBoundingClientRect().top; });
  L = await at(1280, 800);
  fits(L, 'a smaller laptop', ['below', 'beside']);
  // a tablet in landscape: the side panel docked, not a drawer (#1418); the board smaller beside it, the Watch and the
  // VGA monitor below it, the area scrolling down only; the emulator's bar (two rows) above the board
  L = await at(1024, 768);
  fits(L, 'a tablet in landscape');
  assert.equal(await barAbove(), true, 'the bar above the board');
  assert.deepEqual(await page.eval(() => [document.getElementById('task-emu-panel').getClientRects().length > 0, !!document.getElementById('drawer-btn').getClientRects().length]), [true, false], 'docked');
  // a tablet in portrait: the board smaller, the area scrolling down only, not the page
  L = await at(768, 1024);
  fits(L, 'a tablet in portrait');
  assert.equal(await barAbove(), true, 'the bar above the board');
  assert.deepEqual(await noOverflow(page), { page: true, over: [] });
  // the side panel folded on the smaller laptop: the Watch kept, beside the board again (#1399), the VGA monitor below it
  L = await at(1280, 800);
  await page.click('#task-view [data-act="side"]');
  await page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  L = await emuLayout(page);
  // (the board fitting the height: a little smaller than its proper size, #1999)
  assert.ok(L.zoom >= 0.7 && L.watch === 'beside' && L.vga === 'below' && !L.scrollsAcross, JSON.stringify(L));
  // the Silinx and ISE style interfaces: the board at its own size, the side column and the VGA monitor in their order
  for (const ui of ['ise']) {
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
// board's line ("Digilent Basys2 — top · Clock clk: 50 MHz on the board"), in English and Portuguese; the ISE style
// interface keeps it at the end of the emulator's bar, the board's line below the board
const emuStatus = (page) => page.eval(() => {
  const emu = document.querySelector('.doc:not([hidden]) .emu'), stat = emu.querySelector('.stat'), note = emu.querySelector('.emu-board-note');
  const pr = emu.querySelector('.emu-pcb').getBoundingClientRect(), sr = stat.getBoundingClientRect();
  const hit = document.elementFromPoint(sr.left + sr.width / 2, sr.top + sr.height / 2);
  return { where: stat.parentNode.classList.contains('emu-bar') ? 'bar' : stat.parentNode.classList.contains('emu-board-wrap') ? 'board' : '?',
    below: sr.top >= pr.bottom - 1 && sr.top - pr.bottom < 16 && sr.left >= pr.left - 1, seen: !!hit && stat.contains(hit),
    note: note.getClientRects().length > 0, text: stat.textContent, noteText: note.textContent };
});
uiTest('#1022 Tasks ▸ Emulate: the emulation\'s time and rate right below the board, in place of the board\'s line; in Portuguese; ISE style as before', E, async (page) => {
  await makeProject(env, { name: 'TasksStat', template: 'blinky' });
  await page.setViewport(1280, 800);
  await tasksInterface(page);
  await page.openProject('TasksStat');
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.dblclick('#task-emu-panel .row .lbl', { text: 'Emulate Behavioral Model (RTL)' });
  await page.waitConsole(/Board Emulator: 'top'/, { timeout: 30000 });
  // (the messages folded: the board's room on this screen, #1429)
  await page.click('#task-view [data-act="console"]');
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
  // the Silinx and ISE style interfaces: at the end of the emulator's bar, the board's line below the board
  for (const ui of ['ise']) {
    await page.eval(async (u) => (await import('/js/modern.js')).setInterface(u), ui);
    await page.waitFor(() => !document.documentElement.dataset.layout);
    await page.waitFor(() => /^t = .* cycles .* kHz \(.*% of real time\)$/.test(document.querySelector('.doc:not([hidden]) .emu .stat')?.textContent || ''), [], { what: `the status in ${ui}` });
    s = await emuStatus(page);
    assert.deepEqual({ where: s.where, note: s.note, last: await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-bar').lastElementChild.classList.contains('stat')) },
      { where: 'bar', note: true, last: true }, ui);
    assert.match(s.noteText, /^Digilent Basys2 — top · Clock clk: 50 MHz on the board/, ui);
  }
  // and back to Tasks: below the board again
  await page.eval(async () => (await import('/js/modern.js')).setInterface('silinx'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .emu-board-wrap > .stat'), [], { what: 'the status below the board again' });
  await noWarnings(page);
}, { build: DEV });

// #1020: Emulate opens with its Watch shown (the task's side panel open), the design's signals to add; folded by the
// viewer, it stays folded; the ISE style interface shows it as before
uiTest('#1020 #1399 Tasks ▸ Emulate: the Watch shown at first; the side panel folded, it stays folded, the Watch kept; ISE style as before', E, async (page) => {
  await makeProject(env, { name: 'TasksWatch', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksWatch');
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.dblclick('#task-emu-panel .row .lbl', { text: 'Emulate Behavioral Model (RTL)' });
  await page.waitConsole(/Board Emulator: 'top'/, { timeout: 30000 });
  const watch = () => page.eval(() => {
    const side = document.querySelector('.doc:not([hidden]) .emu-side');
    return { side: document.documentElement.dataset.side ?? null, pressed: document.querySelector('#task-view [data-act="side"]')?.getAttribute('aria-pressed') ?? null,
      panel: !!document.getElementById('task-emu-panel')?.getClientRects().length, shown: !!side && side.getClientRects().length > 0, title: side?.querySelector('.emu-box h4')?.textContent, add: side?.querySelector('select option')?.textContent };
  });
  assert.deepEqual(await watch(), { side: 'open', pressed: 'true', panel: true, shown: true, title: 'Watch', add: 'Add a signal to watch…' });
  // the side panel folded by the viewer (its Processes, the Watch kept, #1399): folded again when Emulate comes back to the
  // front
  await page.click('#task-view [data-act="side"]');
  await page.click('#task-switch .task-btn[data-task="edit"]');
  await page.click('#task-switch .task-btn[data-task="emu"]');
  assert.deepEqual(await watch(), { side: 'folded', pressed: 'false', panel: false, shown: true, title: 'Watch', add: 'Add a signal to watch…' });
  // the Silinx and ISE style interfaces: the emulator's side column shown, as before
  for (const ui of ['ise']) {
    await page.eval(async (u) => (await import('/js/modern.js')).setInterface(u), ui);
    await page.waitFor(() => !document.documentElement.dataset.layout);
    assert.deepEqual(await watch(), { side: null, pressed: null, panel: false, shown: true, title: 'Watch', add: 'Add a signal to watch…' }, ui);
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

// #1483: a document opens in the task it is asked from: View RTL Schematic from a module's menu in Design opens in Design
uiTest('#1483 Tasks ▸ Design: View RTL Schematic from a module\'s menu opens in Design, not in Implement', E, async (page) => {
  await makeProject(env, { name: 'TasksRtlDesign', template: 'gates' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksRtlDesign');
  await page.waitFor(() => document.documentElement.dataset.task === 'edit', [], { what: 'Design' });
  await page.click('#left-tabs .tab[data-page="design"]');
  await page.rightClick('#hier .row .lbl', { text: 'gates' });
  await page.click('body > .menu-popup .mi', { text: 'View RTL Schematic' });
  await page.waitFor(() => window.SilinxApp.S.active?.id === 'rtl:gates', [], { what: 'the RTL Schematic', timeout: 60000 });
  const s = await state(page);
  assert.equal(s.task, 'edit', 'Design stays in front');
  assert.deepEqual(s.current, ['edit']);
  assert.ok(s.tabs.some((t) => /RTL/.test(t)), `among Design's documents: ${s.tabs}`);
  assert.ok(await shown(page, '#workspace > .doc:not([hidden])'), 'the RTL Schematic shown in Design');
  // Implement does not list it
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.waitFor(() => document.documentElement.dataset.task === 'impl', [], { what: 'Implement' });
  assert.ok(!(await state(page)).tabs.some((t) => /RTL/.test(t)), 'not among Implement\'s documents');
  await noWarnings(page);
}, { build: DEV });

uiTest('#802 Tasks ▸ Implement: the top\'s Processes, the Design Summary as cards; it comes forward, links to Program', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'TasksImpl', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksImpl');
  await page.eval(async () => { window.SilinxApp.S.toolchain = await (await import('/js/api.js')).api.toolchain(); window.SilinxApp.renderProcesses(); });
  // another module selected in Edit: Implement still lists the top's processes
  await page.click('#task-switch .task-btn[data-task="edit"]');
  await page.treeRow('#hier', 'u_knight', { exact: false });
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
  await taskAction(page);
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
  // the ISE style interface: the summary's tables as before, no link; its tree and its views
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
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
  // (its text centred in it, vertically too, however tall the button: a touch screen's, #1504)
  assert.ok(await page.eval(() => {
    const b = document.querySelector('.doc:not([hidden]) .task-prog-settings');
    b.style.height = '44px';
    const r = b.getBoundingClientRect(), rg = document.createRange();
    rg.selectNodeContents(b);
    const t = rg.getBoundingClientRect();
    b.style.height = '';
    // (centred by the flex box itself, as WebKit does not centre a flex button's text as Chromium does)
    if (getComputedStyle(b).alignItems !== 'center') return false;
    return Math.abs((t.top + t.bottom) / 2 - (r.top + r.bottom) / 2) <= 1.5 && Math.abs((t.left + t.right) / 2 - (r.left + r.right) / 2) <= 1.5;
  }), 'the button\'s text centred');
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
  // the Silinx interface: iMPACT as it was (its fields and every PROM button, nothing added)
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
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
    return { bar: vis('#left-tabs'), left: vis('#left'), side: vis('#task-view [data-act="side"]'), procs: vis('#proc-panel'), files: vis('#files-page') };
  });
  await page.click('#task-switch .task-btn[data-task="edit"]');
  assert.deepEqual(await L(), { bar: true, left: true, side: true, procs: false, files: false });
  // Edit's Files page in front: still Edit's only
  await page.click('#left-tabs .tab[data-page="files"]');
  assert.deepEqual(await L(), { bar: true, left: true, side: true, procs: false, files: true });
  await page.click('#task-switch .task-btn[data-task="sim"]');
  // (Simulate with nothing simulated: its own side panel, its button folding it as the other tasks', #1376, #1428)
  assert.deepEqual(await L(), { bar: false, left: false, side: true, procs: false, files: false }, 'sim');
  // (the workspace from the window's left edge: no empty column)
  assert.ok(await page.eval(() => document.getElementById('workspace').getBoundingClientRect().left) < 4, 'sim: no empty column');
  // Emulate: its Processes, as Implement's, under their tab (#1399)
  await page.click('#task-switch .task-btn[data-task="emu"]');
  assert.deepEqual(await L(), { bar: true, left: true, side: true, procs: false, files: false }, 'emu');
  await page.click('#task-switch .task-btn[data-task="impl"]');
  assert.deepEqual(await L(), { bar: true, left: true, side: true, procs: true, files: false }, 'Implement: its Processes (under their tab, #1160), not the Files page');
  // back to Edit: its Files page as it was left
  await page.click('#task-switch .task-btn[data-task="edit"]');
  assert.deepEqual(await L(), { bar: true, left: true, side: true, procs: false, files: true });
  // the Silinx interface: the activity bar as before
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.ok(await shown(page, '#left-tabs'));
  await noWarnings(page);
}, { build: DEV });

// #984: Edit's pages (Start, Design, Files, Libraries) are tabs at the top of its side panel, not a column of their own:
// the open page's name shown, the others' their tooltip; folded, neither; on a narrow screen the same (docked, #1463)
uiTest('#984 Tasks ▸ Edit: its pages are tabs at the top of the side panel; folded, none; a narrow screen\'s the same; Portuguese', E, async (page) => {
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
  assert.deepEqual(await T(), { row: true, names: ['design'], titles: ['Start', 'Design', 'Files', 'Libraries', 'Implementation', 'Emulate'] });   // (no Test: Simulate's benches, #1161; Implement's tab, #1160, #1207; Emulate's, #1399)
  // (no column of its own: the hierarchy from the window's left edge)
  assert.ok(await page.eval(() => document.querySelector('#hier').getBoundingClientRect().left) < 12);
  await page.click('#left-tabs .tab[data-page="files"]');
  assert.deepEqual((await T()).names, ['files']);
  assert.ok(await shown(page, '#files-page'));
  // folded: neither the tabs nor the pages; the document from the window's left edge
  await page.click('#task-view [data-act="side"]');
  await page.waitFor(() => document.documentElement.dataset.side === 'folded');
  assert.ok(!(await shown(page, '#left-tabs')) && !(await shown(page, '#left')));
  assert.ok(await page.eval(() => document.getElementById('workspace').getBoundingClientRect().left) < 4);
  await page.click('#task-view [data-act="side"]');
  await page.waitFor(() => document.documentElement.dataset.side === 'open');
  assert.deepEqual((await T()).row, true);
  // a narrow screen: the same, docked (#1463): its tabs its top row, the document beside it; folded, nothing at the left
  await page.setViewport(900, 700);
  await page.waitFor(() => document.getElementById('left-tabs').getClientRects().length > 0, [], { what: 'the tabs' });
  assert.deepEqual((await T()).row, true);
  assert.ok(await page.eval(() => document.getElementById('workspace').getBoundingClientRect().left >= document.getElementById('left').getBoundingClientRect().right - 1));
  await page.click('#task-view [data-act="side"]');
  await page.waitFor(() => document.documentElement.dataset.side === 'folded');
  assert.ok(!(await shown(page, '#left-tabs')));
  assert.ok(await page.eval(() => document.getElementById('workspace').getBoundingClientRect().left) < 4);
  await page.click('#task-view [data-act="side"]');
  await page.waitFor(() => document.documentElement.dataset.side === 'open');
  await page.setViewport(1366, 768);
  // Portuguese: the tooltips
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  assert.deepEqual((await T()).titles, ['Início', 'Projeto', 'Ficheiros', 'Bibliotecas', 'Implementação', 'Emular']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the Silinx interface: the activity bar as before, a column with every name, no tooltips
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
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
uiTest('#917 #1378 Tasks ▸ Simulate: no test bench, the module and the model chosen on their prompts in the side panel, the wizard there; with one, the test benches\' rows', E, async (page) => {
  await makeProject(env, { name: 'TasksBench', top: 'and2', files: { 'src/and2.vhd': AND2 } });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksBench');
  await page.click('#task-switch .task-btn[data-task="sim"]');
  const choice = (id) => page.eval((i) => { const s = document.getElementById(i); return { value: s.value, options: [...s.options].map((o) => [o.value, o.textContent, o.disabled]) }; }, id);
  const set = (id, v) => page.eval((i, x) => { const s = document.getElementById(i); s.value = x; s.dispatchEvent(new Event('change')); }, id, v);
  const panel = () => page.eval(() => {
    const p = document.getElementById('task-sim-panel'), e = document.getElementById('task-empty').getBoundingClientRect(), r = p.getBoundingClientRect();
    const rows = [...p.querySelectorAll('.tree > li > .row')].filter((x) => x.getClientRects().length);
    return { tab: p.querySelector('.task-sim-tabs .tab.active').textContent, rows: rows.map((x) => (x.querySelector('select')?.id || x.textContent) + (x.classList.contains('sel') ? '*' : '')),
      beside: Math.round(r.right) <= Math.round(e.left) + 1, side: !!document.querySelector('#task-view [data-act="side"]')?.getClientRects().length };
  });
  const PROMPTS = { bench: { value: '', options: [['', 'Select design module to simulate...', true], ['and2', 'and2', false]] },
    model: ['?', 'Select simulation model...'] };
  const prompts = async () => { const m = await choice('task-model'); return { bench: await choice('task-bench'), model: [m.value, m.options[0][1]] }; };
  // no test bench: said; the side panel beside the page (no button on it, #1376): the module and the model, each on its
  // prompt; no Simulate row (#1378), the wizard the bar's New Test Bench (#1385)
  await page.waitFor(() => document.querySelector('#task-sim-panel [data-act=new-bench]')?.getClientRects().length > 0, [], { what: 'the wizard offered' });
  assert.equal(await page.eval(() => document.querySelector('#task-empty p').textContent),
    'The project has no test bench yet: create one with the wizard, or choose a module to simulate with stimuli drawn in SSim.');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#task-empty button')].filter((b) => b.getClientRects().length).length), 0);
  assert.deepEqual(await panel(), { tab: 'Simulation', rows: ['task-bench', 'task-model'], beside: true, side: true });
  // (folded by the side panel's button, as the other tasks', #1428)
  await page.click('#task-view [data-act="side"]');
  assert.ok(!(await shown(page, '#task-sim-panel')) && Math.round(await page.eval(() => document.getElementById('task-empty').getBoundingClientRect().left)) <= Math.round(await page.eval(() => document.getElementById('workspace').getBoundingClientRect().left)) + 1, 'folded');
  await page.click('#task-view [data-act="side"]');
  assert.ok(await shown(page, '#task-sim-panel'));
  assert.deepEqual(await prompts(), PROMPTS);
  // the module chosen: not simulated yet, the model still to choose; the model chosen: simulated
  await set('task-bench', 'and2');
  await page.waitFor(() => window.Silinx.project.simTop === 'and2' && document.getElementById('task-bench').value === 'and2', [], { what: 'and2 chosen' });
  await tick(600);
  assert.ok(!(await page.eval(() => window.SilinxApp.S.docs.some((d) => /^isim:/.test(d.id)))), 'not simulated before the model is chosen');
  await set('task-model', '');
  await page.waitFor(() => window.Silinx.active?.title === 'SSim (and2)' && document.getElementById('task-sim-panel').hidden, [], { what: 'ISim of and2', timeout: 30000 });
  // its simulation closed: the panel again, its choices on their prompts again
  await page.eval(() => window.SilinxApp.closeDoc(window.Silinx.active));
  await page.waitFor(() => !document.getElementById('task-sim-panel').hidden, [], { what: 'the panel again' });
  assert.deepEqual(await prompts(), PROMPTS);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.getElementById('task-bench').options[0].textContent === 'Selecione o módulo do projeto a simular...', [], { what: 'Portuguese' });
  assert.deepEqual(await page.eval(() => [document.getElementById('task-model').options[0].textContent, ...[...document.querySelectorAll('#task-sim-panel .tab, #task-sim-panel .lbl')].filter((e) => e.getClientRects().length).map((e) => e.textContent)]),
    ['Selecione o modelo de simulação...', 'Simulação', 'Ficheiros']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the wizard: its test bench becomes the one Simulate runs; the panel lists the test benches, the choices gone
  await page.click('#task-sim-panel [data-act=new-bench]');
  await page.waitDialog('Test Bench Wizard');
  for (let k = 0; k < 4; k++) await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project.simTop === 'tb_and2', [], { what: 'the new test bench chosen' });
  // (still in Simulate, its file opened there, #1392)
  await page.waitFor(() => window.Silinx.active?.id === 'file:sim/tb_and2.vhd', [], { what: 'its file open' });
  assert.deepEqual(await page.eval(() => [document.documentElement.dataset.task, window.Silinx.active.task]), ['sim', 'sim']);
  await page.eval(() => window.SilinxApp.closeDoc(window.Silinx.active));
  await page.waitFor(() => document.querySelector('#task-sim-panel .task-sim-bench .row.sel')?.textContent === '▸tb_and2', [], { what: 'its row' });
  assert.deepEqual(await panel(), { tab: 'Simulation', rows: ['▸tb_and2*'], beside: true, side: true });
  assert.notEqual(await page.eval(() => document.querySelector('#task-empty p').textContent), 'The project has no test bench yet: create one with the wizard, or choose a module to simulate with stimuli drawn in SSim.');
  // its row clicked: simulated
  await page.click('#task-sim-panel .task-sim-bench .row.sel');
  await page.waitFor(() => window.Silinx.active?.title === 'SSim (tb_and2)', [], { what: 'ISim of tb_and2', timeout: 30000 });
  await page.eval(() => window.SilinxApp.closeDoc(window.Silinx.active));
  await page.waitFor(() => !document.getElementById('task-sim-panel').hidden, [], { what: 'the panel again' });
  // the toolbar fits: a laptop, a tablet in either orientation
  for (const [w, hgt] of [[1280, 800], [1180, 820], [820, 1180]]) {
    await page.setViewport(w, hgt);
    assert.deepEqual(await noOverflow(page), { page: true, over: [] }, `${w} px`);
  }
  await page.setViewport(1366, 768);
  // not in the other tasks
  await page.click('#task-switch .task-btn[data-task="edit"]');
  assert.ok(!(await shown(page, '#task-bench')) && !(await shown(page, '#task-sim-panel')));
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
  // (no Generate Post-… Simulation Model: Simulate generates them, #1265)
  assert.ok(procs.includes('Generate Programming File') && !procs.includes('Generate Post-Synthesis Simulation Model'), procs.join(', '));
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
  await taskAction(page);
  await page.waitConsole(/Process "Generate Programming File" (completed successfully|failed)/, { timeout: 120000 });
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) .summary-table caption')].some((c) => c.textContent === 'Programming File'), [], { what: 'the summary', timeout: 30000 });
  await sweep(5, 'after');
  // the Silinx interface: every process as before
  await page.setViewport(1366, 768);
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
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
  await page.waitFor(() => document.querySelector('#toolbar .m-step[data-step="check"]')._enabled(), [], { what: 'Check enabled' });
  await taskAction(page);
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
  await page.click('#task-sim-panel .task-sim-bench .row.sel');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim .isim-console'), [], { what: 'ISim', timeout: 30000 });
  assert.ok(!(await shown(page, '.doc:not([hidden]) .isim-bottom')), 'ISim\'s console hidden');
  await page.click('#task-view [data-act="console"]');
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
  await page.click('#task-view [data-act="console"]');
  const last = await page.eval(() => [...document.querySelectorAll('#console-log .ln[data-src="sim"]')].filter((l) => l.textContent.trim()).pop().textContent);
  assert.ok(await shown(page, '#mc-last'));
  assert.equal(await page.eval(() => document.getElementById('mc-last').textContent), last);
  assert.ok(!(await shown(page, '#mc-cmd')) && !(await shown(page, '#mc-filters')));
  // Emulate: the emulator's line under Emulator; its Messages box is not in its window
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.dblclick('#task-emu-panel .row .lbl', { text: 'Emulate Behavioral Model (RTL)' });
  await page.waitConsole(/Board Emulator: 'top'/, { timeout: 30000 });
  // (its messages shown at first, #1429)
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
  // the ISE style interface: its Console shows every source again (its filters at All, #925)
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
  await page.waitFor(() => document.querySelector('#mc-filters .filt[aria-pressed="true"]')?.dataset.src === 'all');
  assert.equal(await page.eval(() => document.querySelectorAll('#console-log .ln.mc-off').length), 0);
  await noWarnings(page);
}, { build: DEV });

// #1131, #1149: a release (and the local server) offers the Tasks interface as the Silinx one, the default: View ▸
// Interface is Silinx and ISE style; a stored tasks (the Tasks interface of before) opens it; the Development menu stays a
// development build's only
uiTest('#1149 without a development build: View ▸ Interface is Silinx and ISE style, the Silinx one the Tasks layout; a stored tasks opens it', E, async (page) => {
  await page.waitFor(() => window.Silinx?.startupChecked && document.querySelector('#start-page .start-box'), [], { what: 'app boot' });
  const items = await page.openMenu('View');
  assert.ok(!(await page.eval(() => [...document.querySelectorAll('#menubar .item')].some((e) => e.textContent === 'Development'))), 'no Development menu');
  await page.hover(await page.point('body > .menu-popup > .mi', { index: items.findIndex((x) => x.label === 'Interface') }));
  await page.waitForSelector('.menu-popup.sub .mi');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.menu-popup.sub .mi .lbl')].map((l) => l.textContent)), ['Silinx', 'ISE style']);
  await page.closeMenus();
  for (const stored of ['tasks', 'silinx']) {
    await page.eval((x) => localStorage.setItem('silinx.ui', x), stored);
    await page.reload();
    await page.waitFor(() => window.Silinx?.startupChecked && document.querySelector('#start-page .start-box'), [], { what: 'app boot' });
    assert.deepEqual(await page.eval(() => [document.documentElement.dataset.ui, document.documentElement.dataset.layout ?? null]), ['silinx', 'tasks'], stored);
    assert.ok((await shown(page, '#task-switch')) || (await shown(page, '#task-tabs')), stored);
  }
  // (a project opened: the start-up checks' warnings, which depend on the computer, are cleared)
  await makeProject(env, { name: 'TasksStored', template: 'gates' });
  await page.openProject('TasksStored');
  await noWarnings(page);
});

// #2451 the interfaces' ids became silinx and ise: a preference saved with an old one (modern, classic) opens its
// interface and is stored with the new id, before the first paint (web/index.html) as by the app (web/js/modern.js)
uiTest('#2451 a stored modern or classic opens the Silinx or the ISE style interface, stored with its new id', E, async (page) => {
  await page.waitFor(() => window.Silinx?.startupChecked && document.querySelector('#start-page .start-box'), [], { what: 'app boot' });
  for (const [old, now, layout] of [['classic', 'ise', null], ['modern', 'silinx', 'tasks']]) {
    await page.eval((x) => localStorage.setItem('silinx.ui', x), old);
    await page.reload();
    await page.waitFor(() => window.Silinx?.startupChecked && document.querySelector('#start-page .start-box'), [], { what: 'app boot' });
    assert.deepEqual(await page.eval(() => [document.documentElement.dataset.ui, document.documentElement.dataset.layout ?? null, localStorage.getItem('silinx.ui')]), [now, layout, now], old);
  }
  // (a project opened: the start-up checks' warnings, which depend on the computer, are cleared)
  await makeProject(env, { name: 'OldIds', template: 'gates' });
  await page.openProject('OldIds');
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
    if ((document.documentElement.dataset.side === 'open') !== o) document.querySelector('#task-view [data-act="side"], [data-act="side"]').click();
  }, open);
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await page.click('#task-sim-panel .task-sim-bench .row.sel');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim'), [], { what: 'ISim', timeout: 30000 });
  for (const open of [true, false]) {
    await sideOpen(open);
    await page.waitFor((o) => document.documentElement.dataset.side === (o ? 'open' : 'folded'), [open]);
    assert.deepEqual({ open, ...await gap() }, { open, left: 0, doc: 0 }, 'Simulate');
    assert.equal(await shown(page, '.isim .isim-left'), open, 'ISim\'s Instances and Objects: the side panel');
  }
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.dblclick('#task-emu-panel .row .lbl', { text: 'Emulate Behavioral Model (RTL)' });
  await page.waitConsole(/Board Emulator: 'top'/, { timeout: 30000 });
  // (Emulate: its Processes the side panel, as Implement's, #1399: the board from its edge, or the window's, folded)
  for (const open of [true, false]) {
    await sideOpen(open);
    await page.waitFor((o) => document.documentElement.dataset.side === (o ? 'open' : 'folded'), [open]);
    assert.deepEqual({ open, ...await page.eval(() => {
      const l = document.getElementById('left'), d = document.querySelector('#workspace > .doc:not([hidden])').getBoundingClientRect();
      return { doc: Math.round(d.left - (l.getClientRects().length ? l.getBoundingClientRect().right : 0)) };
    }) }, { open, doc: open ? 1 : 0 }, 'Emulate');   // (the panel's border)
  }
  // Edit: the Design pane, its width as left
  await page.click('#task-switch .task-btn[data-task="edit"]');
  await sideOpen(true);
  assert.equal(await page.eval(() => Math.round(document.getElementById('left').getBoundingClientRect().width)), 520);
  await noWarnings(page);
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
    { caption: 'Processes: ', rows: [], states: 0 });   // (no top: no processes, no Design Summary, #1287)
  // Implement's page: its text, no button (the processes from the Implementation panel, #1367)
  assert.deepEqual(await page.eval(() => [document.querySelector('#task-empty h2').textContent, document.querySelector('#task-empty .m-step').getClientRects().length]), ['Implement', 0]);
  await page.eval(() => localStorage.removeItem('silinx.ui'));
}, { build: DEV });

// #1208: Implement's Processes are the top's, whatever the Design pane selects while Implement is in front (a drawing,
// the UCF, the project; the tree redrawn, its selection restored); the selection's again in Design
uiTest('#1208 Tasks ▸ Implement: the top\'s processes whatever is selected in the Design pane; the selection\'s in Design', E, async (page) => {
  await makeProject(env, { name: 'ImplSel', template: 'gates' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('ImplSel');
  await page.click('#task-switch .task-btn[data-task="impl"]');
  const rows = () => page.eval(() => [...document.querySelectorAll('#procs .row')].filter((r) => r.getClientRects().length).map((r) => r.querySelector('.lbl').textContent));
  await page.waitFor(() => [...document.querySelectorAll('#procs .lbl')].some((e) => e.textContent.startsWith('Synthesize')), [], { what: 'the top\'s processes' });
  const full = await rows();
  assert.deepEqual(full.slice(0, 5), ['Design Summary/Reports', 'User Constraints', 'I/O Pin Planning', 'Edit Constraints (Text)', 'Check Constraints']);
  assert.ok(full.includes('Implement Design') && full.includes('Generate Programming File'), full.join(', '));
  for (const sel of [{ type: 'sch', file: 'src/gates.sch.json' }, { type: 'ucf', file: 'constraints/gates.ucf' }, { type: 'project' }, { type: 'device' }]) {
    await page.eval((s) => { window.SilinxApp.S.sel = s; window.SilinxApp.renderProcesses(); }, sel);
    assert.deepEqual(await rows(), full, sel.type);
  }
  // the tree redrawn, the project's row its selection
  await page.eval(() => { const A = window.SilinxApp; A.S.selKey = 'project'; A.renderHierarchy(); A.S.sel = { type: 'project' }; A.renderProcesses(); });
  assert.deepEqual(await rows(), full, 'tree redrawn');
  assert.equal(await page.eval(() => document.getElementById('proc-caption').textContent), 'Processes: gates');
  // Design: the selection's processes again (the drawing's)
  await page.eval(() => { window.SilinxApp.S.sel = { type: 'sch', file: 'src/gates.sch.json' }; });
  await page.click('#task-switch .task-btn[data-task="edit"]');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#procs .lbl')].map((e) => e.textContent)), ['Design Summary/Reports', 'View/Edit Schematic']);
  await noWarnings(page);
}, { build: DEV });

// #1159, #1160: the side panel's tabs without a heading under them (Edit's pages: Start, Design, Files, Libraries);
// Implement's Processes under a tab of their own, as Edit's pages, with none of the top's drawing (View/Edit Schematic:
// Design's); in Portuguese; the ISE style interface keeps its headings and has no such tab
// #1207: the tab named Implementation (#1257), across the panel's width
uiTest('#1159 #1160 #1207 Tasks: no heading under the side panel\'s tabs; Implement\'s Processes under its tab, Implementation, the panel\'s width, without the top\'s drawing', E, async (page) => {
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
  // Implement: one tab, Implement, its name shown, as wide as the panel; the processes without View/Edit Schematic
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.waitFor(() => [...document.querySelectorAll('#procs .lbl')].some((e) => e.textContent.startsWith('Synthesize') && e.getClientRects().length), [], { what: 'Implement\'s Processes' });
  const impl = () => page.eval(() => ({
    tabs: [...document.querySelectorAll('#left-tabs .tab')].filter((t) => t.getClientRects().length).map((t) => [t.dataset.page, t.querySelector('.tab-lbl').getBoundingClientRect().width > 1 ? t.querySelector('.tab-lbl').textContent : '']),
    above: document.getElementById('left-tabs').getBoundingClientRect().bottom <= document.getElementById('procs').getBoundingClientRect().top + 1,
    drawing: [...document.querySelectorAll('#procs .row')].filter((r) => r.getClientRects().length).map((r) => r.querySelector('.lbl').textContent).filter((l) => /^View\/Edit/.test(l)),
  }));
  assert.deepEqual(await impl(), { tabs: [['procs', 'Implementation']], above: true, drawing: [] });
  const width = await page.eval(() => { const b = document.getElementById('left-tabs'), cs = getComputedStyle(b); return [document.getElementById('task-procs-tab').getBoundingClientRect().width, b.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)]; });
  assert.ok(Math.abs(width[0] - width[1]) < 1, `the tab across the panel: ${width}`);
  assert.deepEqual(await heading(), []);
  // (the top selected with its drawing, as Design's tree selects it: Implement's list the top's, no drawing, #1208)
  await page.eval(() => { const A = window.SilinxApp; A.S.sel = { type: 'module', module: 'gates', file: 'src/gates.vhd', sch: 'src/gates.sch.json' }; A.renderProcesses(); });
  assert.deepEqual((await impl()).drawing, []);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  assert.deepEqual((await impl()).tabs, [['procs', 'Implementação']]);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the ISE style interface: its headings, no Processes tab
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.equal(await page.eval(() => document.getElementById('task-procs-tab')), null);
  assert.ok((await heading()).length > 0);
  await noWarnings(page);
}, { build: DEV });

// #1309: Design's Close Project, under its tree; off with no project; Portuguese; not in the ISE style interface
uiTest('#1309 #1384 Tasks ▸ Design: Close Project under the Design tree, off with no project; the tree\'s empty space\'s menu; Portuguese; ISE style none', E, async (page) => {
  await makeProject(env, { name: 'TasksClose', template: 'gates' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksClose');
  await page.click('#left-tabs .tab[data-page="design"]');
  const btn = () => page.eval(() => { const b = document.querySelector('#task-close-bar button:not([data-act])'), t = document.getElementById('hier').getBoundingClientRect(); return b && b.getClientRects().length ? { text: b.textContent, off: b.disabled, under: b.getBoundingClientRect().top >= t.bottom - 1 } : null; });
  assert.deepEqual(await btn(), { text: 'Close Project', off: false, under: true });
  // a right-click on the tree's empty space (under its rows): New Source, Add Copy of Source, Close Project (#1384); on a
  // row, the row's menu
  const empty = await page.eval(() => { const t = document.getElementById('hier').getBoundingClientRect(), rows = [...document.querySelectorAll('#hier .row')].filter((r) => r.getClientRects().length);
    return { x: Math.round(t.left + 40), y: Math.round((rows.at(-1).getBoundingClientRect().bottom + t.bottom) / 2) }; });
  const menu = () => page.waitFor(() => { const m = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => i.textContent.trim()); return m.length ? m : null; }, [], { what: 'the context menu' });
  await page.rightClick(empty);
  assert.deepEqual(await menu(), ['New Source…', 'Import Source…', 'Close Project']);
  await page.closeMenus();
  await page.rightClick('#hier .row .lbl', { text: 'gates' });
  assert.ok((await menu()).includes('Rename…'), 'a module\'s menu');
  await page.closeMenus();
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.rightClick(empty);
  assert.deepEqual(await menu(), ['Nova Fonte…', 'Importar Fonte…', 'Fechar Projeto']);
  await page.closeMenus();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await page.click('#task-close-bar button:not([data-act])');
  await page.waitFor(() => !window.Silinx.project, [], { what: 'closed' });
  await page.waitFor(() => document.querySelector('#task-close-bar button:not([data-act])').disabled, [], { what: 'off with no project' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#task-close-bar button:not([data-act])').textContent === 'Fechar Projeto', [], { what: 'Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.equal(await page.eval(() => document.getElementById('task-close-bar')), null);
  await noWarnings(page);
}, { build: DEV });

// #1329, #1330: Design's Check Design beside Close Project (the top's Check Syntax, whatever the tree selects; off with no
// top); no Create Test Bench (Wizard) in a module's right-click menu (the ISE style interface keeps it); Portuguese
uiTest('#1329 #1330 Tasks ▸ Design: Check Design beside Close Project, the top\'s Check Syntax; no Create Test Bench in a module\'s menu; Portuguese; ISE style keeps it', E, async (page) => {
  await makeProject(env, { name: 'TasksCheckDesign', template: 'gates' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksCheckDesign');
  await page.click('#left-tabs .tab[data-page="design"]');
  const bar = () => page.eval(() => [...document.querySelectorAll('#task-close-bar button')].map(b => [b.textContent, b.disabled]));
  await page.waitFor(() => !document.querySelector('#task-close-bar [data-act="check-design"]').disabled, [], { what: 'Check Design on' });
  assert.deepEqual(await bar(), [['Check Design', false], ['Close Project', false]]);
  // the top's Check Syntax, with no module selected in the tree
  await page.eval(() => document.querySelectorAll('#hier .row.sel').forEach(r => r.classList.remove('sel')));
  await page.click('#task-close-bar [data-act="check-design"]');
  await page.waitConsole(/Process "Check Syntax" completed successfully/);
  // a module's right-click menu: Check Syntax and the others, no Create Test Bench (Wizard)
  const top = await page.eval(() => window.Silinx.project.top);
  await page.treeRow('#hier', top, { right: true });
  const menu = await page.waitFor(() => { const m = [...document.querySelectorAll('body > .menu-popup .mi')].map(i => i.textContent.trim()); return m.length ? m : null; }, [], { what: 'the menu' });
  await page.closeMenus();
  assert.ok(menu.includes('Check Syntax') && menu.includes('View RTL Schematic'), menu.join(' | '));
  assert.ok(!menu.includes('Create Test Bench (Wizard)…'), menu.join(' | '));
  // off with no top module
  await page.eval(async () => (await import('/js/design.js')).unsetTop());
  await page.waitFor(() => document.querySelector('#task-close-bar [data-act="check-design"]').disabled, [], { what: 'Check Design off with no top' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#task-close-bar [data-act="check-design"]').textContent === 'Verificar Projeto', [], { what: 'Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the ISE style interface: no bar, the wizard in the module's menu
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.equal(await page.eval(() => document.getElementById('task-close-bar')), null);
  await page.treeRow('#hier', top, { right: true });
  const ise = await page.waitFor(() => { const m = [...document.querySelectorAll('body > .menu-popup .mi')].map(i => i.textContent.trim()); return m.length ? m : null; }, [], { what: 'the ISE style menu' });
  await page.closeMenus();
  assert.ok(ise.includes('Create Test Bench (Wizard)…'), ise.join(' | '));
  await noWarnings(page);
}, { build: DEV });

// #1321: no menu bar; the toolbar in the header where it was, without Stop, Toolchain Settings and About; back in the ISE style one
uiTest('#1321 Tasks: no menu bar, the toolbar in the header in its place, without Stop, Toolchain Settings and About; ISE style as before', E, async (page) => {
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await makeProject(env, { name: 'TasksToolbar', template: 'gates' });
  await page.openProject('TasksToolbar');
  const L = () => page.eval(() => {
    const vis = (e) => !!e && e.getClientRects().length > 0, tb = document.getElementById('toolbar');
    return { menubar: vis(document.getElementById('menubar')), inHeader: tb.parentElement.id === 'topbar',
      cmds: [...tb.querySelectorAll('.tb-btn')].filter(vis).map((b) => b.dataset.cmd), oneLine: document.getElementById('topbar').getBoundingClientRect().height <= 64 };
  });
  assert.deepEqual(await L(), { menubar: false, inHeader: true, cmds: ['newProject', 'open', 'closeProject', 'print', 'undo', 'redo', 'cut', 'copy', 'paste', 'find'], oneLine: true });
  assert.ok(await page.eval(() => document.getElementById('toolbar').getBoundingClientRect().left < document.getElementById('task-switch').getBoundingClientRect().left), 'before the tasks');
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  const c = await L();
  assert.ok(c.menubar && !c.inHeader && ['stop', 'gear', 'help'].every((x) => c.cmds.includes(x)), JSON.stringify(c));
  await noWarnings(page);
}, { build: DEV });

// #1337: a reload comes back to the task in front, also one with no document of its own (Implement with no top), whatever
// task the reopened documents (a simulation) bring forward
uiTest('#1337 Tasks: a reload in Implement with no top module comes back in Implement, not in Simulate (its simulation reopened)', E, async (page) => {
  await makeProject(env, { name: 'TasksReloadImpl', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksReloadImpl');
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await page.click('#task-sim-panel .task-sim-bench .row.sel');
  await page.waitFor(() => /^isim:/.test(window.Silinx.active?.id || ''), [], { what: 'the simulation', timeout: 60000 });
  await page.eval(async () => { const A = window.SilinxApp; A.S.project.top = ''; await A.saveProjectJson(); A.renderProcesses(); });
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.waitFor(() => !!document.querySelector('#procs .task-no-top'), [], { what: 'Implement with no top' });
  await page.reload();
  await page.waitFor(() => window.Silinx?.project?.name === 'TasksReloadImpl' && window.SilinxApp.findDoc('isim:tb_top'), [], { what: 'the project and its simulation again', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(await page.eval(() => document.documentElement.dataset.task), 'impl');
  assert.ok(await page.eval(() => !!document.querySelector('#procs .task-no-top')), 'its note');
  // and from Simulate: Simulate again
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await page.reload();
  await page.waitFor(() => window.Silinx?.project?.name === 'TasksReloadImpl' && window.SilinxApp.findDoc('isim:tb_top'), [], { what: 'reopened', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(await page.eval(() => document.documentElement.dataset.task), 'sim');
}, { build: DEV });

// #1339: a reload reopens the documents out of sight: every document brought to the front before the last one was, while
// the work area was hidden; shown again at the end, where the user was
uiTest('#1339 Tasks: a reload reopens the documents out of sight, the work area shown once where the user was', E, async (page) => {
  await makeProject(env, { name: 'TasksReloadHidden', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksReloadHidden');
  for (const f of ['src/top.vhd', 'src/knight.vhd', 'src/counter.v']) await page.eval((p) => window.SilinxApp.openFile(p), f);
  await page.eval(() => window.SilinxApp.openAsm('src/speed_ctrl.asm.json'));
  await page.waitFor(() => window.Silinx.active?.asmEditor, [], { what: 'the ASM chart' });
  await page.eval(() => window.SilinxApp.openFile('src/knight.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/knight.vhd');
  // (every change of the document in front noted, and whether the work area was hidden then)
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__fronts = []; new MutationObserver(() => {
    const a = document.querySelector('#doc-tabs > .tab.active'), h = document.documentElement.hasAttribute('data-restoring');
    const w = document.getElementById('workspace'), shown = !!w && getComputedStyle(w).visibility !== 'hidden';
    if (a && window.__fronts.at(-1)?.tab !== a.textContent) window.__fronts.push({ tab: a.textContent, hidden: h && !shown });
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-restoring'] });` });
  await page.reload();
  await page.waitFor(() => window.Silinx?.project?.name === 'TasksReloadHidden' && window.Silinx.active?.id === 'file:src/knight.vhd' && !document.documentElement.hasAttribute('data-restoring'), [], { what: 'reopened', timeout: 60000 });
  const fronts = await page.eval(() => window.__fronts);
  assert.ok(fronts.length >= 2, JSON.stringify(fronts));
  assert.deepEqual(fronts.slice(0, -1).filter((f) => !f.hidden), [], `documents shown while reopening: ${JSON.stringify(fronts)}`);
  assert.ok(/knight\.vhd/.test(fronts.at(-1).tab), JSON.stringify(fronts));
  assert.equal(await page.eval(() => getComputedStyle(document.getElementById('workspace')).visibility), 'visible');
}, { build: DEV, skip: chromeOnly });

// #1403: a reload at start-up shows nothing of the project opening: the app hidden from the first paint until it is back
// where the user was (its task, its document in front, its side panel), then shown once
uiTest('#1403 Tasks: a reload shows the app only once back where the user was, nothing of the project opening', E, async (page) => {
  await makeProject(env, { name: 'TasksReloadStill', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksReloadStill');
  for (const f of ['src/top.vhd', 'src/knight.vhd']) await page.eval((p) => window.SilinxApp.openFile(p), f);
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await page.click('#task-sim-panel .task-sim-bench .row.sel');
  await page.waitFor(() => window.Silinx.active?.id === 'isim:tb_top' && !window.Silinx.active.view.state.running, [], { what: 'SSim', timeout: 60000 });
  // (every change noted while the app is shown: the task, the document in front, the page of the side panel)
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__seen = []; new MutationObserver(() => {
    const app = document.getElementById('app'); if (!app || getComputedStyle(app).visibility === 'hidden') return;
    const d = document.documentElement.dataset, s = [d.task || '', document.querySelector('#doc-tabs > .tab.active')?.textContent || '', d.side || ''].join('|');
    if (window.__seen.at(-1) !== s) window.__seen.push(s);
  }).observe(document, { subtree: true, childList: true, attributes: true });` });
  await page.reload();
  await page.waitFor(() => window.Silinx?.project?.name === 'TasksReloadStill' && window.Silinx.active?.id === 'isim:tb_top' && !document.documentElement.hasAttribute('data-starting'), [], { what: 'reopened', timeout: 60000 });
  await page.eval(() => new Promise((r) => setTimeout(r, 500)));
  const seen = await page.eval(() => window.__seen);
  assert.ok(seen.length >= 1, JSON.stringify(seen));
  assert.deepEqual([...new Set(seen.map((x) => x.split('|')[0]))], ['sim'], `only Simulate seen: ${JSON.stringify(seen)}`);
  assert.equal(await page.eval(() => getComputedStyle(document.getElementById('app')).visibility), 'visible');
}, { build: DEV, skip: chromeOnly });

// #1289: a task with no document open has no tab bar (Simulate with no test bench yet: its page alone)
uiTest('#1289 Tasks: no tab bar while the task has no document open (Simulate with no test bench); shown with one', E, async (page) => {
  await makeProject(env, { name: 'TasksNoTabs', template: 'gates', files: {}, roles: {} });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksNoTabs');
  const bar = () => page.eval(() => { const t = document.getElementById('doc-tabs'); return t.getClientRects().length > 0 && t.getBoundingClientRect().height > 0; });
  // Design, nothing open: no bar
  await page.eval(() => [...window.SilinxApp.S.docs].forEach((d) => window.SilinxApp.closeDoc(d)));
  await page.click('#task-switch .task-btn[data-task="edit"]');
  await page.waitFor(() => document.documentElement.dataset.nodocs === 'on', [], { what: 'Design with no document' });
  assert.equal(await bar(), false, 'Design: no tab bar');
  // Simulate with no test bench: its page alone, no bar
  await page.eval(async () => { const A = window.SilinxApp; A.S.project.files = A.S.project.files.filter((f) => f.role !== 'sim'); await A.saveProjectJson(); await A.reloadProject(); });
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await page.waitFor(() => !document.getElementById('task-empty').hidden, [], { what: 'Simulate\'s page' });
  assert.equal(await bar(), false, 'Simulate: no tab bar');
  // a document open in Design: its bar again
  await page.click('#task-switch .task-btn[data-task="edit"]');
  await page.eval(() => window.SilinxApp.openFile(window.SilinxApp.S.project.files.find((f) => /\.vhd$/.test(f.path)).path));
  await page.waitFor(() => window.Silinx.active?.editor && document.documentElement.dataset.nodocs === undefined, [], { what: 'a document' });
  assert.equal(await bar(), true, 'Design with a document: its tab bar');
  await noWarnings(page);
}, { build: DEV });

// #1265: Implement's processes: no Generate Post-… Simulation Model (Simulate generates them); Edit Constraints (Text) in Implement
uiTest('#1265 Tasks ▸ Implement: no Generate Post-… Simulation Model processes; Edit Constraints (Text) opens the UCF in Implement; ISE style keeps them', E, async (page) => {
  await makeProject(env, { name: 'TasksImplProcs', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksImplProcs');
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.waitFor(() => [...document.querySelectorAll('#procs .lbl')].some((e) => e.textContent.startsWith('Synthesize') && e.getClientRects().length), [], { what: 'Implement\'s Processes' });
  const labels = () => page.eval(() => [...document.querySelectorAll('#procs .lbl')].map((e) => e.textContent));
  let all = await labels();
  assert.deepEqual(all.filter((l) => /Simulation Model/.test(l)), [], all.join(' | '));
  for (const l of ['Edit Constraints (Text)', 'Generate Text Power Report', 'Generate Post-Place & Route Static Timing', 'Back-annotate Pin Locations']) assert.ok(all.includes(l), l);
  // Edit Constraints (Text): the UCF in Implement, its tab there
  await page.treeRow('#procs', 'Edit Constraints (Text)', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'file:constraints/top.ucf' && window.Silinx.active.editor, [], { what: 'the UCF' });
  assert.equal(await page.eval(() => document.documentElement.dataset.task), 'impl');
  assert.ok(await page.eval(() => [...document.querySelectorAll('#doc-tabs > .tab')].some((t) => t.getClientRects().length && /top\.ucf/.test(t.textContent))), 'its tab in Implement');
  // in Design: not its tab
  await page.click('#task-switch .task-btn[data-task="edit"]');
  assert.ok(!(await page.eval(() => [...document.querySelectorAll('#doc-tabs > .tab')].some((t) => t.getClientRects().length && /top\.ucf/.test(t.textContent)))));
  // the ISE style interface: its Processes keep the simulation models
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  await page.treeRow('#hier', 'top', {});
  await page.waitFor(() => [...document.querySelectorAll('#procs .lbl')].some((e) => e.textContent === 'Generate Post-Synthesis Simulation Model'), [], { what: 'ISE style: the models' });
  all = await labels();
  for (const m of ['Post-Synthesis', 'Post-Translate', 'Post-Map', 'Post-Place & Route']) assert.ok(all.includes(`Generate ${m} Simulation Model`), m);
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

// #1218: the side panel, messages and maximize buttons in the header, right of the theme button, at its right end;
// none in the toolbar's task bar; they still fold and maximize; ISE style none
uiTest('#1218 Tasks: the layout buttons at the top right, after the theme button', E, async (page) => {
  await makeProject(env, { name: 'TasksView', template: 'gates' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksView');
  const where = () => page.eval(() => {
    const v = document.getElementById('task-view'), th = document.getElementById('settings-btn'), top = document.getElementById('topbar');
    const btns = [...v.querySelectorAll('.tb-btn')], r = btns.map((b) => b.getBoundingClientRect()), t = th.getBoundingClientRect();
    return {
      acts: btns.map((b) => b.dataset.act || b.dataset.cmd), inHeader: top.contains(v), afterSettings: th.nextElementSibling === v && r.every((x) => x.left >= t.right && Math.abs((x.top + x.bottom) / 2 - (t.top + t.bottom) / 2) < 2),
      rightEnd: top.getBoundingClientRect().right - r.at(-1).right < 24, inBar: document.querySelectorAll('#task-bar [data-act=side], #task-bar [data-act=console], #task-bar [data-act=max]').length,
    };
  });
  assert.deepEqual(await where(), { acts: ['side', 'console', 'split', 'max'], inHeader: true, afterSettings: true, rightEnd: true, inBar: 0 });
  // they still act
  await page.click('#task-view [data-act="side"]');
  assert.equal((await state(page)).side, 'folded');
  await page.click('#task-view [data-act="side"]');
  await page.click('#task-view [data-act="max"]');
  assert.equal((await state(page)).max, 'on');
  assert.equal(await page.eval(() => document.querySelector('#task-view [data-act="max"]').getAttribute('aria-pressed')), 'true');
  await page.click('#task-view [data-act="max"]');
  // the ISE style interface: none
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.equal(await page.eval(() => document.getElementById('task-view')), null);
  // (the Split button: at the ISE style toolbar's right end, #1652)
  assert.equal(await page.eval(() => document.getElementById('split-btn').parentNode.id), 'toolbar');
  await noWarnings(page);
}, { build: DEV });

// #1260: no project open, Design only (its Start page): Simulate, Emulate and Implement off; a project closed brings Design back
uiTest('#1260 Tasks: with no project, Simulate, Emulate and Implement are off and Design is in front; a project closed while Simulate is in front brings Design back', E, async (page) => {
  await page.eval(() => localStorage.setItem('silinx.tasks', JSON.stringify({ task: 'sim' })));   // (a task kept from before)
  await tasksInterface(page);
  const btns = () => page.eval(() => Object.fromEntries([...document.querySelectorAll('#task-switch .task-btn')].map((b) => [b.dataset.task, !b.disabled])));
  await page.waitFor(() => document.documentElement.dataset.task === 'edit', [], { what: 'Design in front' });
  assert.deepEqual(await btns(), { edit: true, sim: false, emu: false, impl: false });
  // (drawn once the projects are listed: waited for, #1272)
  await page.waitFor(() => { const e = document.querySelector('#start-page .start-box'); return !!e && e.getClientRects().length > 0; }, [], { what: 'the Start page' });
  // a click on an off task does nothing
  await page.eval(() => document.querySelector('#task-switch .task-btn[data-task="impl"]').click());
  assert.equal(await page.eval(() => document.documentElement.dataset.task), 'edit');
  // a project: every task on
  await makeProject(env, { name: 'TasksNoPj', template: 'blinky' });
  await page.openProject('TasksNoPj');
  await page.waitFor(() => [...document.querySelectorAll('#task-switch .task-btn')].every((b) => !b.disabled), [], { what: 'the tasks on' });
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await page.waitFor(() => document.documentElement.dataset.task === 'sim');
  // closed while Simulate is in front: Design again, the others off
  await page.eval(() => window.SilinxApp.closeProject());
  await page.waitFor(() => !window.Silinx.project && document.documentElement.dataset.task === 'edit', [], { what: 'Design after the close' });
  await page.waitFor(() => document.querySelector('#task-switch .task-btn[data-task="sim"]').disabled, [], { what: 'Simulate off' });
  assert.deepEqual(await btns(), { edit: true, sim: false, emu: false, impl: false });
  await noWarnings(page);
}, { build: DEV });

// #1398: Implement's I/O Pin Planning and Program FPGA above its Processes (I/O Pin Planning off with no top); Program FPGA
// iMPACT's (the design implemented first when it is not); Portuguese; ISE style none
uiTest('#1398 Tasks ▸ Implement: I/O Pin Planning and Program FPGA above the Processes; Portuguese; ISE style none', E, async (page) => {
  await makeProject(env, { name: 'TasksImplBar', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksImplBar');
  await page.click('#task-switch .task-btn[data-task="impl"]');
  const bar = () => page.eval(() => {
    const b = [...document.querySelectorAll('#task-impl-bar .btn')].filter((x) => x.getClientRects().length), p = document.getElementById('procs').getBoundingClientRect();
    return { buttons: b.map((x) => `${x.textContent}${x.disabled ? ' (off)' : ''}`), above: b.every((x) => x.getBoundingClientRect().bottom <= p.top + 1) };
  });
  await page.waitFor(() => !document.querySelector('#task-impl-bar [data-act=pins]')?.disabled, [], { what: 'on' });
  assert.deepEqual(await bar(), { buttons: ['I/O Pin Planning', 'Program FPGA'], above: true });
  await page.click('#task-impl-bar [data-act=pins]');
  await page.waitFor(() => window.Silinx.active?.id === 'pins', [], { what: 'I/O Pin Planning' });
  // Program FPGA: iMPACT opened beside, its Program FPGA run: not implemented yet, offered first
  await page.click('#task-impl-bar [data-act=program]');
  await page.waitDialog('Program FPGA');
  await page.dialogButton('No');
  await page.waitNoDialog();
  assert.deepEqual(await page.eval(() => [window.Silinx.active?.id, document.documentElement.dataset.task]), ['impact', 'impl']);
  // an iMPACT open from before, without its Program FPGA to run from here: opened again, and run (#1421)
  await page.eval(() => { delete window.SilinxApp.findDoc('impact').program; });
  await page.click('#task-impl-bar [data-act=program]');
  await page.waitDialog('Program FPGA');
  await page.dialogButton('No');
  await page.waitNoDialog();
  // no top: I/O Pin Planning off
  await page.eval(async () => { window.SilinxApp.S.project.top = ''; await window.SilinxApp.saveProjectJson(); });
  await page.waitFor(() => document.querySelector('#task-impl-bar [data-act=pins]').disabled, [], { what: 'off with no top' });
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#task-impl-bar [data-act=program]').textContent === 'Programar FPGA', [], { what: 'Portuguese' });
  assert.deepEqual((await bar()).buttons, ['Planeamento de Pinos de E/S (off)', 'Programar FPGA']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.equal(await page.eval(() => document.getElementById('task-impl-bar')), null);
  await noWarnings(page);
}, { build: DEV });

// #1409: the four tasks' side panels alike: their width (as the viewer leaves it), background and text, their tabs'
// row (as high as the documents' tabs beside it) and label, the bar above the tree and its buttons, the tree's rows and
// how far in its first row starts; Simulate's with a simulation as with none; the Start page's buttons a bar as the
// others', its commands' icons shown; the Files page's rows as the trees'
for (const theme of ['light', 'dark']) uiTest(`#1409 Tasks (${theme}): the side panels of Design, Simulate, Emulate and Implement alike (width, background, text, tabs, bars, rows)`, E, async (page) => {
  await makeProject(env, { name: `TasksAlike-${theme}`, template: 'blinky' });
  await page.setViewport(1440, 900);
  await page.eval((t) => localStorage.setItem('silinx.theme', t), theme);
  await tasksInterface(page);
  assert.equal(await page.eval(() => document.documentElement.dataset.theme), theme);
  await page.openProject(`TasksAlike-${theme}`);
  const look = (panel, tabs, lbl, bar, btn, row) => page.eval((p, t, l, b, bt, rw) => {
    const vis = (e) => e && e.getClientRects().length > 0;
    const q = (s) => [...document.querySelectorAll(s)].find(vis);
    const c = (s, f) => { const e = q(s); return e ? f(getComputedStyle(e), e.getBoundingClientRect()) : null; };
    return { width: c(p, (s, r) => Math.round(r.width)), bg: c(p, (s) => s.backgroundColor), text: c(p, (s) => s.fontSize),
      tabs: c(t, (s, r) => Math.round(r.height)), label: c(l, (s) => `${s.fontSize} ${s.fontWeight}`), bar: c(b, (s, r) => Math.round(r.height)),
      button: c(bt, (s, r) => `${Math.round(r.height)} ${s.fontSize}`), row: c(rw, (s, r) => `${Math.round(r.height)} ${s.fontSize}`),
      // (the first row's twisty from the panel's left edge, its selection as far from both edges)
      indent: Math.round(q(`${rw} .twisty`).getBoundingClientRect().left - q(p).getBoundingClientRect().left),
      inset: Math.round(q(rw).getBoundingClientRect().left - q(p).getBoundingClientRect().left) };
  }, panel, tabs, lbl, bar, btn, row);
  const docTabs = () => page.eval(() => Math.round(document.getElementById('doc-tabs').getBoundingClientRect().height));
  const go = async (t) => { await page.click(`#task-switch .task-btn[data-task="${t}"]`); await page.waitFor((x) => document.documentElement.dataset.task === x, [t]); };
  await go('edit');
  // (the side panel made wider by the viewer: every task's the same)
  await page.eval(() => { document.getElementById('left').style.width = '380px'; });
  await go('impl');
  const impl = await look('#left', '#left-tabs', '#task-procs-tab .tab-lbl', '#task-impl-bar', '#task-impl-bar .btn', '#procs .row');
  // (the Design Summary open: the documents' tabs beside the side panel's, as high)
  await page.waitFor(() => document.querySelector('#doc-tabs .tab')?.getClientRects().length > 0, [], { what: 'the Design Summary' });
  assert.equal(await docTabs(), impl.tabs, 'the documents\' tabs as high as the side panel\'s');
  await go('edit');
  const edit = await look('#left', '#left-tabs', '#left-tabs .tab.active .tab-lbl', '#task-src-bar', '#task-src-bar .btn', '#hier .row');
  await go('emu');
  const emu = await look('#left', '#left-tabs', '#task-emu-tab .tab-lbl', '#task-emu-bar', '#task-emu-bar .btn', '#task-emu-panel .row');
  await go('sim');
  await page.waitFor(() => document.getElementById('task-sim-panel')?.getClientRects().length > 0, [], { what: 'Simulate\'s panel' });
  const sim = await look('#task-sim-panel', '#task-sim-panel .task-sim-tabs', '#task-sim-panel .task-sim-tabs .tab.active .tab-lbl', '#task-sim-panel .task-sim-src-bar', '#task-sim-panel .task-sim-src-bar .btn', '#task-sim-panel .row');
  assert.equal(impl.width, 380);
  assert.deepEqual([impl.tabs, impl.bar, impl.button, impl.row, impl.indent, impl.inset], [38, 40, '32 12px', '26 13px', 8, 6]);
  for (const [name, x] of Object.entries({ edit, sim, emu })) assert.deepEqual(x, impl, `${name} as Implement's`);
  // a simulation: its side panel as with none (its width, tabs, bar, rows), its tabs as high as the documents' beside it
  await page.click('#task-sim-panel .task-sim-bench .row');
  await page.waitFor(() => [...document.querySelectorAll('.doc .isim-left .isim-tree .row')].some((r) => r.getClientRects().length), [], { what: 'the simulation', timeout: 60000 });
  const running = await look('.doc:not([hidden]) .isim-left', '.doc:not([hidden]) .isim-left .task-sim-tabs', '.doc:not([hidden]) .isim-left .task-sim-tabs .tab.active .tab-lbl',
    '.doc:not([hidden]) .isim-left .task-sim-src-bar', '.doc:not([hidden]) .isim-left .task-sim-src-bar .btn', '.doc:not([hidden]) .isim-left .isim-tree .row');
  assert.deepEqual(running, impl, 'Simulate\'s side panel with a simulation as with none');
  // the Start page: its buttons a bar as Design's, its commands' icons shown (none were: 0 px wide)
  await go('edit');
  await page.leftTab('start');
  await page.waitFor(() => document.querySelector('#start-page .start-box h3')?.getClientRects().length > 0, [], { what: 'the Start page' });
  const start = await page.eval(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect(), b = document.querySelector('#start-page .start-btns .btn');
    return { bar: Math.round(r('#start-page .start-btns').height), button: `${Math.round(b.getBoundingClientRect().height)} ${getComputedStyle(b).fontSize}`,
      icons: [...new Set([...document.querySelectorAll('#start-page .entry .ico')].map((e) => Math.round(e.getBoundingClientRect().width)))] };
  });
  assert.deepEqual(start, { bar: edit.bar, button: edit.button, icons: [16] });
  // the Files page: its rows as the trees', its folders' icon the app's
  await page.leftTab('files');
  await page.waitFor(() => document.querySelector('#files-page tr[data-file]')?.getClientRects().length > 0, [], { what: 'the Files page' });
  assert.deepEqual(await page.eval(() => ({ rows: [...new Set([...document.querySelectorAll('#files-page tr:not(:first-child)')].map((t) => Math.round(t.getBoundingClientRect().height)))],
    folder: document.querySelector('#files-page .folder-row td').textContent, icon: !!document.querySelector('#files-page .folder-row .ico svg') })),
  { rows: [26], folder: 'constraints/', icon: true });
  await noWarnings(page);
});
// #1409: the ISE style interface keeps its look; what the Start and Files pages share: the commands' icons shown, the
// folders' icon the app's (its rows as high as before, the files' and the folders')
uiTest('#1409 ISE style: the Start page\'s commands with their icons, the Files page\'s folders with the app\'s icon', E, async (page) => {
  await makeProject(env, { name: 'IseAlike', template: 'blinky' });
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
  await page.waitFor(() => document.documentElement.dataset.ui === 'ise' && !document.documentElement.dataset.layout, [], { what: 'ise' });
  await page.openProject('IseAlike');
  await page.leftTab('start');
  await page.waitFor(() => document.querySelector('#start-page .start-box h3')?.getClientRects().length > 0, [], { what: 'the Start page' });
  assert.deepEqual(await page.eval(() => ({ icons: [...new Set([...document.querySelectorAll('#start-page .entry .ico')].map((e) => Math.round(e.getBoundingClientRect().width)))],
    pad: getComputedStyle(document.querySelector('#start-page > .page')).padding, bar: getComputedStyle(document.querySelector('#start-page .start-btns')).padding })),
  { icons: [16], pad: '14px 18px', bar: '0px' });
  await page.leftTab('files');
  await page.waitFor(() => document.querySelector('#files-page tr[data-file]')?.getClientRects().length > 0, [], { what: 'the Files page' });
  assert.deepEqual(await page.eval(() => ({ folder: document.querySelector('#files-page .folder-row td').textContent, icon: Math.round(document.querySelector('#files-page .folder-row .ico').getBoundingClientRect().width),
    rows: [...new Set([...document.querySelectorAll('#files-page tr:not(:first-child)')].map((t) => Math.round(t.getBoundingClientRect().height)))] })), { folder: 'constraints/', icon: 16, rows: [17] });
  await noWarnings(page);
});

// #1564: a maximized task whose last document is closed leaves maximize: its side panel and messages shown again with its
// page, kept; a document of several closed keeps it maximized
uiTest('#1564 Tasks: the last document of a maximized task closed shows the side panel and the messages again', E, async (page) => {
  await makeProject(env, { name: 'TasksMaxClose', template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('TasksMaxClose');
  const closeTab = () => page.click('#doc-tabs > .tab.active .tclose');
  const maximize = async () => { await page.click('#task-view [data-act="max"]'); assert.equal((await state(page)).max, 'on'); };
  const restored = async (t) => {
    await page.waitFor(() => document.documentElement.dataset.max === 'off', [], { what: `${t}: maximize left` });
    const s = await state(page);
    assert.deepEqual([s.task, s.side, s.console, s.empty], [t, 'open', 'open', true], t);
    assert.ok(await shown(page, '#left') && await shown(page, '#console-body'), t);
    assert.equal(await page.eval((t) => JSON.parse(localStorage.getItem('silinx.tasks')).tasks[t].max, t), false, `${t}: kept`);
  };
  // Design: two sources, maximized; one closed: still maximized; the last closed: the side panel and the messages
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitForSelector('.doc:not([hidden]) .cm-editor');
  await page.eval(() => window.SilinxApp.openFile('src/knight.vhd'));
  await page.waitFor(() => (window.Silinx.active?.title || '').includes('knight.vhd'), [], { what: 'the second source' });
  assert.equal((await state(page)).task, 'edit');
  await maximize();
  await closeTab();
  await page.waitFor(() => !(window.Silinx.active?.title || '').includes('knight.vhd'), [], { what: 'the second source closed' });
  assert.deepEqual([(await state(page)).max, (await state(page)).tabs.length], ['on', 1], 'one left: maximized');
  await closeTab();
  await restored('edit');
  // Implement: its Design Summary maximized, closed
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.waitFor(() => document.querySelector('#doc-tabs > .tab.active')?.textContent.includes('Design Summary'), [], { what: 'the Design Summary' });
  await maximize();
  await closeTab();
  await restored('impl');
  // Emulate: the board maximized, closed
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.dblclick('#task-emu-panel .row .lbl', { text: 'Emulate Behavioral Model (RTL)' });
  await page.waitConsole(/Board Emulator: 'top'/, { timeout: 30000 });
  await maximize();
  await closeTab();
  await restored('emu');
  await noWarnings(page);
}, { build: DEV });
