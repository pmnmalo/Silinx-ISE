// UI: a name that is a reserved word of VHDL or Verilog (#679). New Source refuses it (any letter case) on its
// File Name page, Rename refuses it for a module, both said in English and in Portuguese; a project that
// already has such a module is warned when it is opened and at Check Syntax.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const setLang = (page, l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
const wizErr = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent);

uiTest('a reserved word refused: New Source (a schematic named AND) and Rename (a module renamed Or), in English and in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'RwPj' });
  await page.openProject('RwPj');
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  await page.eval(() => [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => e.lastChild.textContent.trim() === 'Schematic').click());
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'File Name and Location');
  await page.fill('.dlg-overlay input[placeholder="file name"]', 'AND');
  await page.dialogButton('Next >');
  await page.waitFor(() => /reserved word/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent));
  assert.equal(await wizErr(page), "'AND' is a reserved word of VHDL and Verilog: choose another name.");
  await setLang(page, 'pt');
  await page.waitFor(() => /palavra reservada/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent));
  assert.equal(await wizErr(page), "'AND' é uma palavra reservada de VHDL e Verilog: escolha outro nome.");
  await setLang(page, 'en');
  // another letter case, a word of one language only: refused too; nothing was created
  await page.fill('.dlg-overlay input[placeholder="file name"]', 'Module');
  await page.dialogButton('Next >');
  await page.waitFor(() => /'Module'/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent));
  assert.equal(await wizErr(page), "'Module' is a reserved word of Verilog: choose another name.");
  assert.ok(!(await page.eval(() => window.Silinx.fileTree.some((f) => /^src\/(AND|Module)\./.test(f)))));
  // a near miss is fine
  await page.fill('.dlg-overlay input[placeholder="file name"]', 'and1');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Summary');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.modules.some((m) => m.name === 'and1'), [], { what: 'module and1' });

  // Rename: the module to Or (a word of both languages, another letter case) refused, said under the fields
  await page.treeRow('#hier', 'and1', { right: true });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Rename…' });
  await page.waitDialog('Rename');
  await page.fill('.dlg-overlay input[type=text]', 'Or', { index: 0 });
  await page.dialogButton('Rename');
  const hint = () => page.eval(() => [...document.querySelectorAll('.dlg-overlay .hint')].pop().textContent);
  await page.waitFor(() => /reserved/.test([...document.querySelectorAll('.dlg-overlay .hint')].pop().textContent));
  assert.equal(await hint(), "'Or' is a reserved word of VHDL and Verilog: choose another name.");
  await setLang(page, 'pt');
  await page.waitFor(() => /reservada/.test([...document.querySelectorAll('.dlg-overlay .hint')].pop().textContent));
  assert.equal(await hint(), "'Or' é uma palavra reservada de VHDL e Verilog: escolha outro nome.");
  await setLang(page, 'en');
  assert.equal(await page.topDialogTitle(), 'Rename');
  await page.fill('.dlg-overlay input[type=text]', 'or_gate', { index: 0 });
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.modules.some((m) => m.name === 'or_gate'), [], { what: 'module or_gate' });
});

uiTest('a project with a module named with a reserved word: warned when it is opened and at Check Syntax', E, async (page) => {
  // (legal Verilog, but Wire is a reserved word of Verilog in another letter case, and its instance in VHDL)
  await makeProject(env, { name: 'RwOld', files: { 'src/Wire.v': 'module Wire(input a, output y);\n  assign y = a;\nendmodule\n' }, top: 'Wire' });
  await page.openProject('RwOld');
  const W = 'WARNING:Silinx - "src/Wire.v" Line 1: The module name \'Wire\' is a reserved word of Verilog: rename it (Rename in the Design pane), or its HDL may not compile.';
  await page.waitConsole(/reserved word of Verilog/);
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)\b/.test(l) && !/ISE/.test(l)), [W]);
  // Check Syntax: the same warning, and nothing else
  const before = (await page.consoleText()).length;
  await page.treeRow('#hier', 'Wire');
  await page.treeRow('#procs', 'Check Syntax', { dbl: true, exact: true });
  await page.waitFor((b) => /Process "Check Syntax" (failed|completed)/.test(window.__console().slice(b)), [before], { what: 'Check Syntax', timeout: 60000 });
  const log = (await page.consoleText()).slice(before);
  assert.match(log, /Process "Check Syntax" completed successfully with 1 warning\(s\)/, log);
  assert.deepEqual(log.split('\n').filter((l) => /^(WARNING|ERROR)\b/.test(l)), [W]);
});
