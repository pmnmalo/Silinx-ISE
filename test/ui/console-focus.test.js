// UI (#2733): an error or a warning written to the console brings its Errors or Warnings tab to the front, whoever
// wrote it (Check Syntax, a line of the console as the emulator's and the editors' problems): an error the Errors tab,
// else a warning the Warnings tab; a mix the Errors tab; info changes nothing; a later warning leaves the Errors tab in
// front while it lists errors; the keyboard's focus stays in the editor; the Silinx interface's folded messages open.
// Both interfaces; the warnings asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, tick } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const CLEAN = 'module top(input a, output y);\n  assign y = a;\nendmodule\n';
const UNUSED = 'module top(input a, input b, output y);\n  assign y = a;\nendmodule\n';
const UNUSED_B = 'WARNING:Silinx:647 - "src/top.v" Line 1: Input <b> is never used.';
const BROKEN = 'module top(input a, input b, output y);\n  assign y = a\nendmodule\n';

const shown = (page) => page.eval(() => document.querySelector('#console-tabs .tab.active').dataset.page);
const visible = (page) => page.eval(() => document.querySelector('.console-page:not([hidden])').dataset.page);
const rows = (page, which) => page.eval((w) => [...document.querySelectorAll(`#console-${w} .diag`)].map((d) => d.textContent.replace(/(▸|Fix: ).*/, '').trim()), which);
const waitShown = (page, p) => page.waitFor((x) => document.querySelector('#console-tabs .tab.active').dataset.page === x, [p], { what: `the ${p} tab in front` });
const log = (page, text, cls) => page.eval((t, c) => window.SilinxApp.log(t, c), text, cls);
async function check(page, text) {
  await page.eval((t) => window.Silinx.active.editor.setValue(t), text);
  const n = await page.eval(() => window.__console().split('Started : "Check Syntax"').length);
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
  await page.waitFor((k) => window.__console().split('Started : "Check Syntax"').length > k && /Process "Check Syntax" (completed|failed)[^\n]*$/.test(window.__console().trimEnd()), [n], { what: 'Check Syntax done' });
}

uiTest('#2733 an error or a warning written to the console: its Errors or Warnings tab in front; info changes nothing', E, async (page) => {
  await makeProject(env, { name: 'ConFocus', top: 'top', files: { 'src/top.v': CLEAN } });
  await page.openProject('ConFocus');
  await page.showMessages();
  await page.eval(() => window.SilinxApp.openFile('src/top.v'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.v' && window.Silinx.active.editor);
  await page.click('#console-tabs .tab[data-page=console]');
  // info and a clean Check Syntax: the Console tab stays
  await log(page, 'INFO: a note', 'info');
  await log(page, 'Done.', 'ok');
  await check(page, CLEAN);
  await tick(200);
  assert.equal(await shown(page), 'console');
  assert.deepEqual([await rows(page, 'errors'), await rows(page, 'warnings')], [[], []]);
  // a warning only: the Warnings tab
  await check(page, UNUSED);
  await waitShown(page, 'warnings');
  assert.equal(await visible(page), 'warnings');
  assert.deepEqual(await rows(page, 'warnings'), [UNUSED_B]);
  assert.deepEqual(await rows(page, 'errors'), []);
  // an error: the Errors tab
  await page.click('#console-tabs .tab[data-page=console]');
  await check(page, BROKEN);
  await waitShown(page, 'errors');
  assert.equal(await visible(page), 'errors');
  const errs = await rows(page, 'errors');
  assert.equal(errs.length, 1);
  assert.match(errs[0], /^ERROR:\S+ - "src\/top\.v" Line [23]: /);
  assert.deepEqual(await rows(page, 'warnings'), []);   // (a syntax error: no more checks)
  // a later warning (the emulator's line, say): the Errors tab stays in front
  await log(page, 'WARNING: Board Emulator: a later warning', 'warn');
  await page.waitFor(() => /a later warning/.test(document.getElementById('console-warnings').textContent));
  await tick(200);
  assert.equal(await shown(page), 'errors');
  // lines written in one batch, a warning then an error: the Errors tab, the keyboard's focus left in the editor
  await page.click('#console-tabs .tab[data-page=console]');
  await page.eval(() => window.Silinx.active.editor.focus());
  const focused = () => page.eval(() => !!document.activeElement?.closest('.doc:not([hidden]) .cm-editor'));
  assert.equal(await focused(), true);
  await page.eval(() => { window.SilinxApp.log('WARNING: Board Emulator: w1', 'warn'); window.SilinxApp.log('ERROR: Board Emulator: e1', 'err'); });
  await waitShown(page, 'errors');
  assert.equal(await focused(), true);
  // the same messages again: not new, the tab left as the viewer put it
  await page.click('#console-tabs .tab[data-page=console]');
  await page.eval(() => window.SilinxApp.setDiagnostics(window.Silinx.diags.filter((d) => d.source !== 'console')));
  await tick(200);
  assert.equal(await shown(page), 'console');
  // cleared (the tab left as it is), then a warning only: the Warnings tab
  await page.click('#console-clear');
  await tick(200);
  assert.equal(await shown(page), 'console');
  await check(page, UNUSED);
  await waitShown(page, 'warnings');
  assert.deepEqual(await rows(page, 'errors'), []);
  assert.deepEqual(await rows(page, 'warnings'), [UNUSED_B]);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});

uiTest('#2733 the Silinx interface: its messages folded open for a new warning, the Warnings tab in front', E, async (page, _env, t) => {
  if (!await page.eval(() => document.documentElement.dataset.layout === 'tasks')) { t.skip('the ISE style: its console always shown'); return; }
  await makeProject(env, { name: 'ConFold', top: 'top', files: { 'src/top.v': CLEAN } });
  await page.openProject('ConFold');
  await page.showMessages();
  await page.click('#task-view [data-act=console]');
  await page.waitFor(() => document.documentElement.dataset.console === 'folded', [], { what: 'the messages folded' });
  await log(page, 'INFO: a note', 'info');
  await tick(200);
  assert.equal(await page.eval(() => document.documentElement.dataset.console), 'folded');
  await log(page, 'WARNING: Board Emulator: a warning', 'warn');
  await page.waitFor(() => document.documentElement.dataset.console === 'open', [], { what: 'the messages open' });
  await waitShown(page, 'warnings');
  assert.deepEqual(await rows(page, 'warnings'), ['WARNING:Silinx - Board Emulator: a warning']);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
