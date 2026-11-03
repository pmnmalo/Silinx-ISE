// UI (#2692): the constraints' checks are Implementation's: a UCF's Check Syntax (its editor's button) and the Check
// Constraints process write their lines to the Implementation console, not to Design's (a module's Check Syntax
// stays Design's); with the filter on Design (picked, or the Design task's), the filter turns to Implementation. Both interfaces; the warnings asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'module top(input sw, output led);\n  assign led = sw;\nendmodule\n';
const UCF = 'NET "led" LOC = "M5" ;\n';
const WARN = 'WARNING:ConstraintSystem - "constraints/top.ucf" Line 1: 1 port bit(s) of \'top\' have no LOC: sw';

// the Console's lines from the last `header` on: [source, text] (the blank ones left out)
const linesFrom = (page, header) => page.eval((hd) => {
  const ls = [...document.querySelectorAll('#console-log .ln')];
  let i = ls.length - 1;
  while (i >= 0 && !ls[i].textContent.includes(hd)) i--;
  return ls.slice(i).filter((l) => l.textContent.trim()).map((l) => [l.dataset.src, l.textContent.trim()]);
}, header);
const pressed = (page) => page.eval(() => [...document.querySelectorAll('#mc-filters .filt[aria-pressed="true"]')].map((b) => b.dataset.src));

uiTest('#2692 a UCF\'s Check Syntax and Check Constraints: their lines in the Implementation console, not Design\'s', E, async (page) => {
  await makeProject(env, { name: 'UcfCon', top: 'top', board: 'basys2', constraints: 'constraints/top.ucf',
    files: { 'src/top.v': TOP, 'constraints/top.ucf': UCF } });
  await page.openProject('UcfCon');
  await page.showMessages();
  // a module's Check Syntax: Design's
  await page.eval(() => window.SilinxApp.openFile('src/top.v'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.v' && window.Silinx.active.editor);
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
  await page.waitConsole(/Process "Check Syntax" completed successfully/);
  assert.deepEqual([...new Set((await linesFrom(page, 'Started : "Check Syntax"')).map(([s]) => s))], ['check']);
  // the UCF's Check Syntax, the filter on Design: its lines Implementation's, the filter turned to Implementation
  await page.click('#mc-filters .filt[data-src="check"]');
  await page.eval(() => window.SilinxApp.openFile('constraints/top.ucf'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:constraints/top.ucf' && window.Silinx.active.editor);
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
  await page.waitConsole(/Process "Check Constraints" completed successfully with 1 warning\(s\)/);
  const expected = [
    ['impl', 'Started : "Check Constraints" of constraints/top.ucf.'],
    ['impl', WARN],
    ['impl', 'Process "Check Constraints" completed successfully with 1 warning(s)'],
  ];
  assert.deepEqual(await linesFrom(page, 'Started : "Check Constraints"'), expected);
  assert.deepEqual(await pressed(page), ['impl']);
  assert.equal(await page.eval(() => [...document.querySelectorAll('#console-log .ln.mc-off')].filter((l) => /Check Constraints|ConstraintSystem/.test(l.textContent)).length), 0);
  // the Check Constraints process: the same
  await page.click('#mc-filters .filt[data-src="check"]');
  await page.treeRow('#hier', 'top');
  await page.treeRow('#procs', 'Check Constraints', { dbl: true, exact: true });
  await page.waitFor(() => window.__console().split('Started : "Check Constraints"').length === 3, [], { what: 'Check Constraints run again' });
  await page.waitConsole(/(Process "Check Constraints" completed successfully with 1 warning\(s\)[^]*){2}/);
  assert.deepEqual(await linesFrom(page, 'Started : "Check Constraints"'), expected);
  assert.deepEqual(await pressed(page), ['impl']);
  assert.equal(await page.eval(() => [...document.querySelectorAll('#console-log .ln.mc-off')].filter((l) => /Check Constraints|ConstraintSystem/.test(l.textContent)).length), 0);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
