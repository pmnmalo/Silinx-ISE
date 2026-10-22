// UI: the Tasks interface's Simulate (web/js/tasks-sim.js, web/css/tasks.css; #800, #782): the simulator as the task
// shows it, the waves with the most room (#1017: no status line; #1026: its icons in the wave window's line), the
// modern and classic interfaces as they were.
// The rest of the Tasks interface: test/ui/tasks.test.js.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
// the Tasks interface is a development build's only, for now (#838)
const DEV = { commit: 'abc1234', date: '2026-10-21 12:00' };

// the page in the Tasks interface (kept, as View ▸ Interface keeps it), booted again
async function tasksInterface(page) {
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
}
// what is shown: displayed, with a size
const shown = (page, sel) => page.eval((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0; }, sel);
// the interface switched (View ▸ Interface)
const setInterface = (page, ui) => page.eval(async (u) => (await import('/js/modern.js')).setInterface(u), ui);
// no warnings: the page's console, the Warnings tab
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}
// Simulate in the Tasks interface, its test bench simulated (the initial 1 us run done)
async function simulateBench(page, name) {
  await makeProject(env, { name, template: 'blinky' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject(name);
  await page.click('#task-switch .task-btn[data-task="sim"]');
  await page.click('#task-empty button');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim .isim-wavewin') && /Sim Time: 1,000,000 ps/.test(document.querySelector('.doc:not([hidden]) .isim-st-time')?.textContent || '')
    && !window.Silinx.active.view.state.running, [], { what: 'ISim ran', timeout: 30000 });
}

uiTest('#1017 Tasks ▸ Simulate: no "Ready … Sim Time" status line; the modern and classic interfaces keep it', E, async (page) => {
  await simulateBench(page, 'TasksSimStatus');
  assert.ok(!(await shown(page, '.doc:not([hidden]) .isim-status')), 'no status line');
  // the waves go down to the bottom of the simulator (where the status line was)
  const gap = await page.eval(() => Math.round(document.querySelector('.doc:not([hidden]) .isim').getBoundingClientRect().bottom - document.querySelector('.doc:not([hidden]) .isim-wavewin').getBoundingClientRect().bottom));
  assert.ok(gap <= 2, `the waves to the bottom: ${gap}`);
  // the simulator's state still kept (the other interfaces show it), and its console in the message centre
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .isim-st-msg').textContent), 'Ready');
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln[data-src="sim"]')].some((l) => /circuit initialization/.test(l.textContent)), [], { what: 'ISim\'s lines in the message centre' });
  // the modern and the classic interfaces: the status line as it was
  for (const ui of ['modern', 'classic']) {
    await setInterface(page, ui);
    await page.waitFor(() => !document.documentElement.dataset.layout, [], { what: ui });
    assert.ok(await shown(page, '.doc:not([hidden]) .isim-status'), `${ui}: the status line`);
    assert.match(await page.eval(() => document.querySelector('.doc:not([hidden]) .isim-st-time').textContent), /^Sim Time: 1,000,000 ps$/);
  }
  await noWarnings(page);
}, { build: DEV });

// the simulator's toolbar: in the wave window's line (Tasks), or its own line under the title bar (as ISim made it)
const toolbarAt = (page) => page.eval(() => {
  const root = document.querySelector('.doc:not([hidden]) .isim'), tb = root.querySelector('.isim-toolbar');
  return tb.parentElement.matches('.isim-wavewin > .caption') ? 'caption' : tb.previousElementSibling?.matches('.isim-title') ? 'top' : 'elsewhere';
});
uiTest('#1026 Tasks ▸ Simulate: the simulator\'s icons in the wave window\'s line, no "Default.wcfg" nor cursor text; in Portuguese; modern and classic unchanged', E, async (page) => {
  await simulateBench(page, 'TasksSimToolbar');
  assert.equal(await toolbarAt(page), 'caption');
  assert.ok(!(await shown(page, '.doc:not([hidden]) .isim-wcfg')) && !(await shown(page, '.doc:not([hidden]) .isim-cursor-info')), 'no name, no cursor text');
  // one line: the wave window at the top of the simulator, its icons shown and working
  const L = await page.eval(() => {
    const root = document.querySelector('.doc:not([hidden]) .isim'), r = (s) => root.querySelector(s).getBoundingClientRect();
    const btns = [...root.querySelectorAll('.isim-wavewin > .caption .tb-btn')];
    return { top: Math.round(r('.isim-wavewin').top - r('.isim-main').top), main: Math.round(r('.isim-main').top - root.getBoundingClientRect().top),
      shown: btns.filter((b) => b.getClientRects().length && b.getBoundingClientRect().width > 0).length, all: btns.length,
      caption: Math.round(r('.isim-wavewin > .caption').height), titles: btns.map((b) => b.title) };
  });
  assert.equal(L.main, 0, 'no toolbar line above the simulator\'s panes');
  assert.ok(L.top <= 1, `the wave window at the top: ${L.top}`);
  assert.equal(L.shown, L.all, `every icon shown: ${JSON.stringify(L)}`);
  assert.ok(L.caption <= 48, `one line: ${L.caption}`);
  assert.deepEqual(L.titles.slice(0, 4), ['Restart', 'Run All', 'Run for the specified time', 'Step (advance to the next scheduled event)']);
  // the icons work there: Zoom In, Run for
  const scale = await page.eval(() => window.Silinx.active.view.state.scale);
  await page.click('.doc:not([hidden]) .isim-wavewin > .caption .tb-btn[title="Zoom In"]');
  await page.waitFor((s) => window.Silinx.active.view.state.scale < s, [scale], { what: 'zoomed in' });
  await page.click('.doc:not([hidden]) .isim-wavewin > .caption .tb-btn[title="Run for the specified time"]');
  await page.waitFor(() => /Sim Time: 2,000,000 ps/.test(document.querySelector('.doc:not([hidden]) .isim-st-time').textContent) && !window.Silinx.active.view.state.running, [], { what: 'ran 1 us more' });
  // in Portuguese: the icons' tooltips
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim-wavewin > .caption .tb-btn').title === 'Reiniciar', [], { what: 'Portuguese' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .isim-wavewin > .caption .tb-btn')].slice(0, 4).map((b) => b.title)),
    ['Reiniciar', 'Executar Tudo', 'Executar durante o tempo indicado', 'Passo (avançar para o próximo evento)']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the modern and the classic interfaces: the toolbar on its own line again, the name and the cursor's text shown
  for (const ui of ['modern', 'classic']) {
    await setInterface(page, ui);
    await page.waitFor(() => !document.documentElement.dataset.layout, [], { what: ui });
    assert.equal(await toolbarAt(page), 'top', ui);
    assert.ok(await shown(page, '.doc:not([hidden]) .isim-wcfg') && await shown(page, '.doc:not([hidden]) .isim-cursor-info'), `${ui}: the name and the cursor`);
  }
  // and back to Tasks: in the line again
  await setInterface(page, 'tasks');
  await page.waitFor(() => document.documentElement.dataset.layout === 'tasks', [], { what: 'tasks' });
  assert.equal(await toolbarAt(page), 'caption');
  await noWarnings(page);
}, { build: DEV });
