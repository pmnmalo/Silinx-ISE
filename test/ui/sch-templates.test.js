// UI: the templates of the Schematic Wizard (#2180), their Template page first: a template and its parameters fill in
// the port table, a parameter refused with its message, a port renamed and one added, a template's port changed
// refused; the schematic created with its symbols wired, its HDL compiling with no warnings; the Empty template as
// before; every template's page in Portuguese. (The templates' schematics themselves: test/sch-templates.test.js.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { newSourceWizardOf } from './new-source-helpers.js';
import { compile, elaborate } from '../../core/compile.js';
import { SCH_TEMPLATES } from '../../core/chart-templates.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const errText = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent);
const go = async (page, button, title) => {
  await page.dialogButton(button);
  if (title) await page.waitFor((t) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === t, [title], { what: `page ${title}` });
};
const portRows = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay .mw-pname')].map((e, k) => `${e.value}:${document.querySelectorAll('.dlg-overlay .mw-pdir')[k].value}:${document.querySelectorAll('.dlg-overlay .mw-pwidth')[k].value}`));
const logWarnings = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent).filter((t) => /^(WARNING|ERROR)/.test(t)));

uiTest('#2180 Schematic Wizard templates: a register of 4 bits (its table filled in, N refused), a port renamed, then a port\'s width refused; the shift register instead; the schematic created, its Verilog compiling', E, async (page) => {
  await makeProject(env, { name: 'StPj', top: '' });
  await page.openProject('StPj');
  await newSourceWizardOf(page, 'Schematic', 'regs', 'Schematic Wizard', { lang: 'verilog' });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3').textContent), 'Template');
  assert.deepEqual(await page.eval(() => [...document.querySelector('.dlg-overlay .tp-template').options].map((o) => o.value)), SCH_TEMPLATES.map((t) => t.id));
  await page.fill('.dlg-overlay .tp-template', 'register');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .tp-text').textContent), /^N flip-flops side by side/);
  await page.fill('.dlg-overlay .tp-n', '0');
  await page.dialogButton('Next >');
  await page.waitFor(() => /a whole number/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [], { what: 'N refused' });
  assert.equal(await errText(page), 'Width (bits): a whole number from 1 to 32.');
  await page.fill('.dlg-overlay .tp-n', '4');
  await go(page, 'Next >', 'Inputs and Outputs');
  assert.deepEqual(await portRows(page), ['d:in:4', 'ce:in:1', 'clk:in:1', 'rst:in:1', 'q:out:4']);
  // a width of the template's: refused
  await page.fill('.dlg-overlay .mw-pwidth', '5', { index: 0 });
  await page.dialogButton('Next >');
  await page.waitFor(() => /wired by the template/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [], { what: 'the width refused' });
  assert.equal(await errText(page), "The port 'd' is wired by the template, with its direction and width: change them on the Template page, or in the schematic editor after creating it.");
  // back: the shift register replaces the table
  await go(page, '< Back', 'Template');
  await page.fill('.dlg-overlay .tp-template', 'shift');
  await page.fill('.dlg-overlay .tp-n', '4');
  await go(page, 'Next >', 'Inputs and Outputs');
  assert.deepEqual(await portRows(page), ['si:in:1', 'ce:in:1', 'clk:in:1', 'rst:in:1', 'q:out:4']);
  // renamed, and one added
  await page.fill('.dlg-overlay .mw-pname', 'serial', { index: 0 });
  await page.click('.dlg-overlay .mw-add');
  await page.fill('.dlg-overlay .mw-pname', 'spare', { index: 5 });
  await go(page, 'Next >', 'Summary');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .mw-summary').textContent), /\nTemplate: Shift register \(3 symbol\(s\), \d+ wire\(s\)\)\nInput markers \(left edge\): serial, ce, clk, rst, spare\nOutput markers \(right edge\): q \[3:0\]\n\nThen change it in the schematic editor as you wish\./);
  await go(page, 'Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/regs.sch.json', [], { what: 'the schematic opened' });
  const d = JSON.parse(await readWs(env, 'StPj', 'src/regs.sch.json'));
  assert.deepEqual(d.symbols.map((s) => s.type), ['busjoin', 'slice', 'fdce']);
  assert.ok(d.wires.length > 5);
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/regs.v'), [], { what: 'its Verilog', timeout: 15000 });
  const text = await readWs(env, 'StPj', 'src/regs.v');
  const lib = compile([{ path: 'src/regs.v', lang: 'verilog', text }]);
  assert.deepEqual([...lib.errors, ...elaborate(lib, 'regs').diags].map((x) => `${x.severity}: ${x.message}`), []);
  assert.deepEqual(await logWarnings(page), []);
});

uiTest('#2180 Schematic Wizard: a template\'s port removed is refused; going back to Empty empties the table', E, async (page) => {
  await makeProject(env, { name: 'SePj', top: '' });
  await page.openProject('SePj');
  await newSourceWizardOf(page, 'Schematic', 'addr', 'Schematic Wizard', { lang: 'vhdl' });
  await page.fill('.dlg-overlay .tp-template', 'adder');
  await go(page, 'Next >', 'Inputs and Outputs');
  await page.click('.dlg-overlay .mw-pdel');
  await page.dialogButton('Next >');
  await page.waitFor(() => /was removed/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [], { what: 'the removal refused' });
  assert.equal(await errText(page), "The template's port 'a' was removed: put it back, or choose another template or parameters on the Template page.");
  await go(page, '< Back', 'Template');
  await page.fill('.dlg-overlay .tp-template', 'empty');
  await go(page, 'Next >', 'Inputs and Outputs');
  assert.deepEqual(await portRows(page), []);
  await go(page, 'Next >', 'Summary');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .mw-summary').textContent), /Then place the symbols in the middle of the sheet/);
  await go(page, 'Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/addr.sch.json', [], { what: 'the schematic opened' });
  const d = JSON.parse(await readWs(env, 'SePj', 'src/addr.sch.json'));
  assert.deepEqual([d.symbols, d.wires, d.ports], [[], [], []]);
});

uiTest('#2180 Portuguese: the Template page of every template of the Schematic Wizard, a parameter\'s and a port\'s messages', E, async (page) => {
  await makeProject(env, { name: 'StPt', top: '' });
  await page.openProject('StPt');
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const missing = [];
  const compare = async (where) => {
    await setLang('en'); const en = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay')));
    await setLang('pt'); const pt = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay')));
    for (const s of untranslated(en, pt, [/^Reset:$/])) missing.push(`${where}: ${s}`);
    await setLang('en');
  };
  await newSourceWizardOf(page, 'Schematic', 'pt_s', 'Schematic Wizard');
  for (const t of SCH_TEMPLATES) {
    await page.fill('.dlg-overlay .tp-template', t.id);
    await compare(t.id);
  }
  await page.fill('.dlg-overlay .tp-template', 'mux');
  await page.fill('.dlg-overlay .tp-k', '9');
  await page.dialogButton('Next >');
  await setLang('pt');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent === 'Bits de seleção: um número inteiro de 1 a 4.', [], { what: 'the select bits in Portuguese' });
  await page.fill('.dlg-overlay .tp-k', '1');
  await page.dialogButton('Seguinte >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Entradas e Saídas', [], { what: 'the ports page' });
  await page.click('.dlg-overlay .mw-pdel');
  await page.dialogButton('Seguinte >');
  await page.waitFor(() => /^O porto 'd0' do modelo foi removido/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [], { what: 'the removal in Portuguese' });
  await page.dialogButton('< Anterior');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Modelo', [], { what: 'back' });
  await page.fill('.dlg-overlay .tp-template', 'adder');
  await page.dialogButton('Seguinte >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Entradas e Saídas', [], { what: 'the ports page' });
  await page.fill('.dlg-overlay .mw-pwidth', '3', { index: 0 });
  await page.dialogButton('Seguinte >');
  await page.waitFor(() => /^O porto 'a' é ligado pelo modelo/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [], { what: 'the width in Portuguese' });
  await page.fill('.dlg-overlay .mw-pwidth', '8', { index: 0 });
  await page.dialogButton('Seguinte >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Resumo', [], { what: 'the summary' });
  await setLang('en');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(missing, [], `untranslated:\n${missing.join('\n')}`);
});
