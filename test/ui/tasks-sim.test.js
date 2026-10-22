// UI: the Tasks interface's Simulate (web/js/tasks-sim.js, web/css/tasks.css; #800, #782): the simulator as the task
// shows it, the waves with the most room (#1017: no status line), the modern and classic interfaces as they were.
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
