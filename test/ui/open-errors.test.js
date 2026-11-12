// UI: a drawing or a file that cannot be opened (#3540): an ERROR line of the console, in its Errors tab, the tab in
// front; no toast (docs/UI-GUIDELINES.md: every message goes to the console, a toast only says an action was done).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BLINK = 'module blink(input clk, output reg led);\n  always @(posedge clk) led <= ~led;\nendmodule\n';
const front = (page) => page.eval(() => document.querySelector('#console-tabs .tab.active').dataset.page);
const errorsTab = (page) => page.eval(() => [...document.querySelectorAll('#console-errors .diag')].map((d) => d.textContent));
const toasts = (page) => page.eval(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent));

uiTest('a drawing that is not JSON, and a file that is gone: ERROR lines of the console, the Errors tab in front, no toast (#3540)', E, async (page) => {
  await makeProject(env, { name: 'OpenErr', top: 'blink', files: { 'src/blink.v': BLINK, 'notes/bad.json': '{ not json' } });
  await page.openProject('OpenErr');
  await page.eval(async () => (await import('/js/console.js')).showConsolePage('console'));
  assert.equal(await front(page), 'console');
  // (a file that is not a drawing's JSON: the read refused, as a damaged one's)
  await page.eval(() => window.SilinxApp.openAsm('notes/bad.json'));
  await page.waitConsole(/^ERROR: cannot open notes\/bad\.json: .+$/m);
  await page.waitFor(() => document.querySelector('#console-tabs .tab.active').dataset.page === 'errors', [], { what: 'the Errors tab in front' });
  // a truth table's, and a file that is gone
  await page.eval(async () => (await import('/js/console.js')).showConsolePage('console'));
  await page.eval(async () => (await import('/js/drawings-tt.js')).openTt('notes/bad.json'));
  await page.waitConsole(/^ERROR: cannot open notes\/bad\.json: .+\n(.*\n)*ERROR: cannot open notes\/bad\.json: /m);
  assert.equal(await front(page), 'errors');
  await page.eval(async () => (await import('/js/app.js')).openFile('src/gone.v'));
  await page.waitConsole(/^ERROR: cannot open src\/gone\.v: .+$/m);
  await page.waitFor(() => document.querySelectorAll('#console-errors .diag').length === 3, [], { what: 'the Errors tab listing them' });
  const errs = await errorsTab(page);
  assert.equal(errs.length, 3, errs.join('\n'));
  assert.deepEqual(errs.map((e) => /cannot open (\S+):/.exec(e)?.[1]), ['notes/bad.json', 'notes/bad.json', 'src/gone.v']);
  assert.equal(await front(page), 'errors');
  assert.deepEqual(await toasts(page), []);
  // no document opened for them, and no warning
  assert.deepEqual(await page.eval(() => window.Silinx.docs.map((d) => d.path).filter((p) => /bad|gone/.test(p || ''))), []);
  assert.equal(await page.eval(() => document.querySelectorAll('#console-warnings .diag').length), 0);
});
