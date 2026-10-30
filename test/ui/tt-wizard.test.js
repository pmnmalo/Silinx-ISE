// UI: the Boolean Algebra Wizard (#2140), New Source ▸ Boolean Algebra ▸ Wizard >: the inputs and the outputs named
// (the language chosen on New Source's page, the same page as every type's), or an expression that gives them and the
// output's column (ink.test.js: the handwritten one); the names refused with their messages; < Back to New Source;
// the source opened, its HDL compiling with no warnings; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { newSourceWizardOf, pickSourceType, waitNewSourcePage } from './new-source-helpers.js';
import { compile, elaborate } from '../../core/compile.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const h3 = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent);
const errText = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent);
const refused = async (page, msg) => {
  await page.dialogButton('Next >');
  await page.waitFor((m) => document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent === m, [msg], { what: msg });
  assert.equal(await h3(page), 'Inputs and Outputs');
};

uiTest('#2140 Boolean Algebra Wizard: the inputs and outputs named (Verilog), bad names refused, < Back to New Source; the source opened, its HDL compiling', E, async (page) => {
  await makeProject(env, { name: 'TwPj', top: '' });
  await page.openProject('TwPj');
  await newSourceWizardOf(page, 'Boolean Algebra', 'logic1', 'Boolean Algebra Wizard', { lang: 'verilog' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .wiz-side .step')].map((e) => e.textContent)), ['Inputs and Outputs', 'Summary']);
  assert.deepEqual(await page.eval(() => ['.tw-expr', '.tw-inputs', '.tw-outputs'].map((s) => document.querySelector(`.dlg-overlay ${s}`).value)), ['', 'a, b, c', 'f']);
  // an expression typed: the names fields greyed (it gives them)
  await page.fill('.dlg-overlay .tw-expr', 'y = a & b');
  assert.deepEqual(await page.eval(() => ['.tw-inputs', '.tw-outputs'].map((s) => document.querySelector(`.dlg-overlay ${s}`).disabled)), [true, true]);
  await page.fill('.dlg-overlay .tw-expr', '');
  assert.deepEqual(await page.eval(() => ['.tw-inputs', '.tw-outputs'].map((s) => document.querySelector(`.dlg-overlay ${s}`).disabled)), [false, false]);
  // the names: refused with their messages
  await page.fill('.dlg-overlay .tw-inputs', 'a b c d e f g');
  await refused(page, 'Inputs: 1 to 6 (there are 7).');
  await page.fill('.dlg-overlay .tw-inputs', 'a, 2b');
  await refused(page, "'2b' is not a valid name.");
  await page.fill('.dlg-overlay .tw-inputs', 'a, B');
  await page.fill('.dlg-overlay .tw-outputs', 'b');
  await refused(page, "'b' is used twice.");
  await page.fill('.dlg-overlay .tw-outputs', '');
  await refused(page, 'Outputs: at least one.');
  await page.fill('.dlg-overlay .tw-outputs', 'x, y');
  // < Back: New Source again, the name and the language as left
  await page.dialogButton('< Back');
  await page.waitDialog('New Source');
  await waitNewSourcePage(page, 'File Name and Location');
  assert.deepEqual(await page.eval(() => [document.querySelector('.dlg-overlay .wiz-main input[type=text]').value, document.querySelector('.dlg-overlay .wiz-main select').value]), ['logic1', 'verilog']);
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'logic2');
  await page.dialogButton('Wizard >');
  await page.waitDialog('Boolean Algebra Wizard');
  await page.fill('.dlg-overlay .tw-inputs', 'a, B');
  await page.fill('.dlg-overlay .tw-outputs', 'x, y');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Summary', [], { what: 'the summary' });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .tw-summary').textContent), [
    'The wizard will create the Boolean algebra source src/logic2.bool.json and open it in its editor.', '',
    'Module: logic2 (Verilog)', 'Inputs: a, B', 'Outputs: x, y'].join('\n'));
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/logic2.bool.json', [], { what: 'the editor' });
  const t = JSON.parse(await readWs(env, 'TwPj', 'src/logic2.bool.json'));
  assert.deepEqual([t.name, t.lang, t.inputs, t.outputs], ['logic2', 'verilog', ['a', 'B'], ['x', 'y']]);
  assert.equal(await page.eval(() => window.Silinx.project.files.some((f) => f.path === 'src/logic1.bool.json')), false);
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/logic2.v'), [], { what: 'its Verilog', timeout: 15000 });
  const lib = compile([{ path: 'src/logic2.v', lang: 'verilog', text: await readWs(env, 'TwPj', 'src/logic2.v') }]);
  assert.deepEqual([...lib.errors, ...elaborate(lib, 'logic2').diags].map((d) => `${d.severity}: ${d.message}`), []);
  assert.match(await page.consoleText(), /Boolean Algebra Wizard: created src\/logic2\.bool\.json with 2 input\(s\) and 2 output\(s\)\./);
});

uiTest('#2140 Boolean Algebra Wizard: a bad expression refused; New Source\'s Next > makes the default table (no expression on its page)', E, async (page) => {
  await makeProject(env, { name: 'TwPlain', top: '' });
  await page.openProject('TwPlain');
  await newSourceWizardOf(page, 'Boolean Algebra', 'ex', 'Boolean Algebra Wizard');
  await page.fill('.dlg-overlay .tw-expr', 'f = a b c d e f g');
  await page.dialogButton('Next >');
  await page.waitFor(() => /^Expression: /.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [], { what: 'the expression refused' });
  assert.match(await errText(page), /^Expression: /);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // the plain source: a, b, c -> f
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  await pickSourceType(page, 'Boolean Algebra');
  await page.dialogButton('Next >');
  await waitNewSourcePage(page, 'File Name and Location');
  assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay .tw-expr, .dlg-overlay .ns-tt-expr').length), 0);
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'plain');
  await page.dialogButton('Next >');
  await waitNewSourcePage(page, 'Summary');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/plain.bool.json', [], { what: 'the editor' });
  const t = JSON.parse(await readWs(env, 'TwPlain', 'src/plain.bool.json'));
  assert.deepEqual([t.inputs, t.outputs, t.lang], [['a', 'b', 'c'], ['f'], 'vhdl']);
});

uiTest('#2140 Portuguese: the Boolean Algebra Wizard\'s pages and messages translated', E, async (page) => {
  await makeProject(env, { name: 'TwPt', top: '' });
  await page.openProject('TwPt');
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const missing = [];
  const compare = async (where) => {
    await setLang('en'); const en = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay')));
    await setLang('pt'); const pt = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay')));
    for (const s of untranslated(en, pt, [/^(a, b, c|f)$/])) missing.push(`${where}: ${s}`);
    await setLang('en');
  };
  await newSourceWizardOf(page, 'Boolean Algebra', 'pt_tt', 'Boolean Algebra Wizard');
  await compare('Inputs and Outputs');
  for (const [field, value, re] of [['.tw-inputs', 'a 2b', /não é um nome válido/], ['.tw-inputs', 'a b c d e f g', /^Entradas: 1 a 6 \(há 7\)\.$/], ['.tw-inputs', 'a, a', /usado duas vezes/]]) {
    await page.fill(`.dlg-overlay ${field}`, value);
    await page.dialogButton('Next >');
    await setLang('pt');
    await page.waitFor((s, f) => new RegExp(s, f).test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [re.source, re.flags], { what: `${re}` });
    await setLang('en');
  }
  await page.fill('.dlg-overlay .tw-inputs', 'a, b');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Summary');
  await compare('Summary');
  await setLang('pt');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay').innerText), /Assistente de Álgebra Booleana/);
  await setLang('en');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(missing, [], `untranslated:\n${missing.join('\n')}`);
});
