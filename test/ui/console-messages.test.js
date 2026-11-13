// UI: the app's messages that were toasts (#3591): a busy refusal, a menu action's error, a command that does nothing
// are lines of the console of their level (ERROR / INFO), the Errors tab or the console's page in front, in the
// interface's language; no toast (docs/UI-GUIDELINES.md: every message goes to the console, a toast only says an
// action was done).
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
const toConsole = (page) => page.eval(async () => (await import('/js/console.js')).showConsolePage('console'));
// (an implementation running: Implement Design refused)
const busyRun = (page) => page.eval(async () => {
  window.Silinx.busy = true;
  try { return await (await import('/js/implement.js')).runImpl('blink', ['synth']); } finally { window.Silinx.busy = false; }
});

uiTest('#3591 a busy refusal, a menu action\'s error, Stop with nothing running: lines of the console, no toast', E, async (page) => {
  await makeProject(env, { name: 'MsgPj', top: 'blink', files: { 'src/blink.v': BLINK } });
  await page.openProject('MsgPj');
  await toConsole(page);
  assert.equal(await front(page), 'console');

  // the busy refusal: an ERROR line, the Errors tab in front and listing it
  assert.equal(await busyRun(page), false);
  await page.waitConsole(/^ERROR: An implementation is already running \(use Stop to cancel it\)$/m);
  await page.waitFor(() => document.querySelector('#console-tabs .tab.active').dataset.page === 'errors', [], { what: 'the Errors tab in front' });
  await page.waitFor(() => document.querySelectorAll('#console-errors .diag').length === 1, [], { what: 'the Errors tab listing it' });
  assert.match((await errorsTab(page))[0], /An implementation is already running \(use Stop to cancel it\)$/);

  // a menu action that fails: its label and its error, an ERROR line
  page.allowErrors.push(/it went wrong/);   // (its stack in the browser's console too)
  await toConsole(page);
  await page.eval(async () => {
    const { popupMenu } = await import('/js/ui.js');
    popupMenu([{ label: 'Do It', action: () => { throw new Error('it went wrong'); } }], 100, 100);
  });
  await page.click('.menu-popup .mi', { text: 'Do It' });
  await page.waitConsole(/^ERROR: Do It: it went wrong$/m);
  await page.waitFor(() => document.querySelector('#console-tabs .tab.active').dataset.page === 'errors', [], { what: 'the Errors tab in front' });
  await page.waitFor(() => document.querySelectorAll('#console-errors .diag').length === 2, [], { what: 'the Errors tab listing it' });

  // Stop with nothing running: an INFO line, the console's page in front, neither an error nor a warning
  await page.eval(async () => (await import('/js/implement.js')).stopProcesses());
  await page.waitConsole(/^INFO: No process is running$/m);
  assert.equal(await front(page), 'console');
  assert.equal(await page.eval(() => document.querySelectorAll('#console-errors .diag').length), 2);
  assert.equal(await page.eval(() => document.querySelectorAll('#console-warnings .diag').length), 0);
  assert.deepEqual(await toasts(page), []);
});

uiTest('#3591 in Portuguese: the busy refusal and Stop\'s line in the interface\'s language, no toast', E, async (page) => {
  await makeProject(env, { name: 'MsgPt', top: 'blink', files: { 'src/blink.v': BLINK } });
  await page.openProject('MsgPt');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    assert.equal(await busyRun(page), false);
    await page.waitConsole(/^ERROR: Já está uma implementação em curso \(use Parar para a cancelar\)$/m);
    assert.equal(await front(page), 'errors');
    await page.eval(async () => (await import('/js/implement.js')).stopProcesses());
    await page.waitConsole(/^INFO: Nenhum processo em curso$/m);
    assert.equal(await front(page), 'console');
    assert.equal(await page.eval(() => document.querySelectorAll('#console-warnings .diag').length), 0);
    assert.deepEqual(await toasts(page), []);
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
});

// a top whose only port is matched by nothing of the board (an inout, neither a switch nor a LED)
const ODD = `library ieee; use ieee.std_logic_1164.all;
entity top is port (zz : inout std_logic); end top;
architecture rtl of top is begin zz <= 'Z'; end rtl;
`;

uiTest('#3591 I/O Pin Planning\'s Auto-assign that assigns nothing: a WARNING line, the Warnings tab in front, no toast', E, async (page) => {
  await makeProject(env, { name: 'MsgPins', board: 'basys2', files: { 'src/top.vhd': ODD }, top: 'top' });
  await page.openProject('MsgPins');
  await toConsole(page);
  await page.menu('Tools', 'I/O Pin Planning');
  const P = '.doc:not([hidden]) .pin-planner';
  await page.waitFor((p) => window.Silinx.active?.id === 'pins' && document.querySelector(`${p} .pp-table`), [P], { what: 'the planner' });
  await page.click(`${P} .pp-bar .asm-btn`, { text: 'Auto-assign from Board' });
  await page.waitConsole(/^WARNING: I\/O Pin Planning: 0 I\/Os assigned from Digilent Basys2; not assigned: zz\.$/m);
  await page.waitFor(() => document.querySelector('#console-tabs .tab.active').dataset.page === 'warnings', [], { what: 'the Warnings tab in front' });
  await page.waitFor(() => document.querySelectorAll('#console-warnings .diag').length === 1, [], { what: 'the Warnings tab listing it' });
  assert.equal(await page.eval(() => document.querySelectorAll('#console-errors .diag').length), 0);
  assert.deepEqual(await toasts(page), []);
});
