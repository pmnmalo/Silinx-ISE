// UI: New Source's Wizard > button (#958, #2082). The list has no "(Wizard)" types; the File Name and Location page
// has the buttons Wizard > | < Back | Next > | Cancel (Wizard > on that page only): Next > the plain source, Wizard >
// the type's wizard at its own pages, with the name, the location and the language typed (Module, Schematic, FSM, ASM,
// Petri Net, Test Bench, Clocking Wizard, Block Memory, UCF; no page "Name and Language", #2082); Wizard > disabled
// for a type with none, Next > for a type that is only a wizard; in Portuguese; in the Tasks interface's Edit task.
// Each wizard's module, compiled and simulated: modwizard, inout, petri, chart-wizards, tbwizard, clock-wizard and
// bram-wizard.test.js (through the same button).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newSourceWizardOf, pickSourceType, waitNewSourcePage } from './new-source-helpers.js';
import { compile, elaborate } from '../../core/compile.js';
const IMPORT = process.env.SILINX_UI_INTERFACE === 'classic' ? 'Add Copy of Source' : 'Import Source';   // (#1501)

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TYPES = ['Boolean Algebra', 'Module (HDL)', 'Schematic', 'Finite State Machine (FSM)', 'Algorithmic State Machine (ASM)', 'Petri Net',
  'Clock Manager (DCM / PLL)', 'Block Memory', 'Test Bench', 'Implementation Constraints File', 'Memory Initialization File (.mem)', 'C Function (HLS)', 'C++ Function (HLS)'];
// each type: its wizard's dialog (null: none), only a wizard (Next > disabled)
const WIZARD = {
  'Module (HDL)': 'Module Wizard', 'Schematic': 'Schematic Wizard', 'Finite State Machine (FSM)': 'FSM Wizard',
  'Algorithmic State Machine (ASM)': 'ASM Wizard', 'Petri Net': 'Petri Net Wizard',
  'Clock Manager (DCM / PLL)': 'Clocking Wizard', 'Block Memory': 'Block Memory', 'Test Bench': 'Test Bench Wizard',
  'Implementation Constraints File': 'UCF Wizard',
};
// each wizard's pages opened from New Source: its own, no "Name and Language" (#2082)
const STEPS = {
  'Module Wizard': ['Inputs and Outputs', 'Kind of Logic', 'Summary'], 'Schematic Wizard': ['Inputs and Outputs', 'Summary'],
  'FSM Wizard': ['Inputs and Outputs', 'States and Transitions', 'Summary'], 'ASM Wizard': ['Inputs and Outputs', 'States', 'Summary'],
  'Petri Net Wizard': ['Inputs and Outputs', 'Summary'], 'Clocking Wizard': ['Input Clock', 'Output Clocks', 'Summary'], 'Block Memory': ['Memory', 'Summary'],
  'Test Bench Wizard': ['Unit Under Test', 'Clock and Reset', 'Input Vectors', 'Vectors and Expected Outputs', 'Summary'], 'UCF Wizard': ['Ports and Pins', 'Summary'],
};
// the types whose File Name and Location page asks the language (an HDL file's, the extension follows it, or a
// drawing's HDL, #2082)
const LANGUAGE = new Set(['Boolean Algebra', 'Module (HDL)', 'Schematic', 'Finite State Machine (FSM)', 'Algorithmic State Machine (ASM)', 'Petri Net',
  'Clock Manager (DCM / PLL)', 'Block Memory', 'Test Bench']);
const ONLY = new Set(['Clock Manager (DCM / PLL)', 'Block Memory']);
const ADDER = 'library ieee;\nuse ieee.std_logic_1164.all;\nentity adder is\n  port (a, b : in std_logic; s : out std_logic);\nend adder;\narchitecture rtl of adder is\nbegin\n  s <= a xor b;\nend rtl;\n';

// the buttons shown in New Source and whether each is enabled
const buttons = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')]
  .filter((b) => b.getClientRects().length).map((b) => `${b.textContent.trim()}${b.disabled ? ' (disabled)' : ''}`));
const listed = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay .src-types .st')].map((e) => e.lastChild.textContent.trim()));
const h3 = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent);

uiTest('New Source (#958, #2082): no "(Wizard)" types; Wizard > | < Back | Next > | Cancel on File Name and Location only; Wizard > disabled for a type with none, Next > for a wizard-only type', E, async (page) => {
  await makeProject(env, { name: 'NsWiz', top: 'adder', files: { 'src/adder.vhd': ADDER } });
  await page.openProject('NsWiz');
  for (const type of TYPES) {
    await page.menu('Project', 'New Source…');
    await page.waitDialog('New Source');
    if (type === TYPES[0]) {
      const list = await listed(page);
      assert.deepEqual(list, TYPES);
      assert.ok(!list.some((t) => /wizard/i.test(t)), list.join(' | '));
    }
    await pickSourceType(page, type);
    // page 1: no Wizard
    assert.deepEqual(await buttons(page), ['< Back (disabled)', 'Next >', 'Cancel'], type);
    await page.dialogButton('Next >');
    await waitNewSourcePage(page, 'File Name and Location');
    const last = ONLY.has(type) ? 'Finish' : 'Next >';
    assert.deepEqual(await buttons(page), [`Wizard >${WIZARD[type] ? '' : ' (disabled)'}`, '< Back', `${last}${ONLY.has(type) ? ' (disabled)' : ''}`, 'Cancel'], type);
    // the language asked on this page by the HDL types only
    assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .wiz-main label')].some((l) => l.textContent === 'Language:')), LANGUAGE.has(type), type);
    // an invalid name: Wizard > refuses it on this page too
    if (WIZARD[type]) {
      await page.fill('.dlg-overlay .wiz-main input[type=text]', '9x');
      await page.dialogButton('Wizard >');
      await page.waitFor(() => /Enter a valid file name/.test(document.querySelector('.dlg-overlay').innerText), [], { what: 'the name refused' });
      assert.equal(await h3(page), 'File Name and Location');
      assert.equal(await page.dialogCount(), 1);
    }
    // the next page (a plain source's): no Wizard there
    if (!ONLY.has(type)) {
      await page.fill('.dlg-overlay .wiz-main input[type=text]', 'n1');
      await page.dialogButton('Next >');
      await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent !== 'File Name and Location', [], { what: `${type}: the next page` });
      assert.ok(!(await buttons(page)).some((b) => b.startsWith('Wizard')), type);
    }
    await page.dialogButton('Cancel');
    await page.waitNoDialog();
  }
});

uiTest('New Source (#958): Next > keeps the plain path (Module (HDL): Define Module, the skeleton, no wizard header; compiles)', E, async (page) => {
  await makeProject(env, { name: 'NsPlain', top: '' });
  await page.openProject('NsPlain');
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  await pickSourceType(page, 'Module (HDL)');
  await page.dialogButton('Next >');
  await waitNewSourcePage(page, 'File Name and Location');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'plain');
  await page.dialogButton('Next >');
  await waitNewSourcePage(page, 'Define Module');
  await page.dialogButton('Next >');
  await waitNewSourcePage(page, 'Summary');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/plain.vhd'), [], { what: 'src/plain.vhd registered' });
  const text = await readWs(env, 'NsPlain', 'src/plain.vhd');
  assert.match(text, /entity plain is/);
  assert.match(text, /architecture Behavioral of plain is/);
  assert.doesNotMatch(text, /silinx-wizard|Wizard/);
  const lib = compile([{ path: 'src/plain.vhd', lang: 'vhdl', text }]);
  const d = elaborate(lib, 'plain');
  assert.deepEqual([...lib.errors, ...d.diags].map((x) => `${x.severity}: ${x.message}`), []);
});

uiTest('New Source (#958, #2082): Wizard > opens each type\'s wizard at its own pages, no "Name and Language"', E, async (page) => {
  await makeProject(env, { name: 'NsOpen', top: 'adder', files: { 'src/adder.vhd': ADDER } });
  await page.openProject('NsOpen');
  await page.treeRow('#hier', 'adder');   // (the Test Bench Wizard's module)
  for (const [type, title] of Object.entries(WIZARD)) {
    await newSourceWizardOf(page, type, 'w_one', title);
    assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay').length), 1, `${type}: New Source closed`);
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .wiz-side .step')].map((e) => e.textContent)), STEPS[title], type);
    assert.equal(await h3(page), STEPS[title][0], type);
    // the Test Bench Wizard's own first page has the name and the location typed (the others': their summaries,
    // modwizard, petri, chart-wizards, clock-wizard and bram-wizard.test.js)
    if (type === 'Test Bench') {
      assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .wiz-main input[type=text]')].map((i) => i.value).filter((v) => v === 'w_one' || v === 'sim')), ['w_one', 'sim']);
    }
    await page.dialogButton('Cancel');
    await page.waitNoDialog();
  }
  // nothing written by a cancelled wizard
  assert.deepEqual(await page.eval(() => window.Silinx.project.files.map((f) => f.path)), ['src/adder.vhd']);
});

uiTest('New Source (#958, #2082) in Portuguese: Assistente > | < Anterior | Seguinte > | Cancelar, the types translated', E, async (page) => {
  await makeProject(env, { name: 'NsPt', top: '' });
  await page.openProject('NsPt');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.menu('Projeto', 'Nova Fonte…');
    await page.waitFor(() => /Nova Fonte/.test(document.querySelector('.dlg-overlay')?.innerText || ''), [], { what: 'the wizard in Portuguese' });
    const list = await listed(page);
    for (const s of ['Módulo (HDL)', 'Esquemático', 'Máquina de Estados Finitos (FSM)', 'Máquina de Estados Algorítmica (ASM)', 'Rede de Petri', 'Gestor de Relógio (DCM / PLL)', 'Memória de Bloco', 'Bancada de Teste']) assert.ok(list.includes(s), `${s} in ${list}`);
    assert.ok(!list.some((s) => /Assistente/.test(s)), list.join(' | '));
    await pickSourceType(page, 'Gestor de Relógio (DCM / PLL)');
    await page.dialogButton('Seguinte >');
    await waitNewSourcePage(page, 'Nome do Ficheiro e Localização');
    assert.deepEqual(await buttons(page), ['Assistente >', '< Anterior', 'Concluir (disabled)', 'Cancelar']);
    assert.ok(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .wiz-main label')].some((l) => l.textContent === 'Linguagem:')));
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
    await newSourceWizardOf(page, 'Memória de Bloco', 'mem_pt', 'Memória de Bloco', {
      menu: 'Projeto', item: 'Nova Fonte…', dialog: 'Nova Fonte', next: 'Seguinte >', wizard: 'Assistente >', file: 'Nome do Ficheiro e Localização',
    });
    assert.equal(await h3(page), 'Memória');
    await page.dialogButton('Seguinte >');
    await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Resumo', [], { what: 'the summary' });
    assert.match(await page.eval(() => document.querySelector('.dlg-overlay .bw-summary').textContent), /src\/mem_pt\.vhd/);
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
});

uiTest('New Source (#958) in the Tasks interface\'s Edit task: the same buttons, Wizard > opens the Module Wizard', E, async (page) => {
  await makeProject(env, { name: 'NsTasks', top: '' });
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  try {
    await page.reload();
    await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await page.openProject('NsTasks');
    assert.equal(await page.eval(() => document.documentElement.dataset.task), 'edit');
    await page.menu('Project', 'New Source…');
    await page.waitDialog('New Source');
    await pickSourceType(page, 'Module (HDL)');
    await page.dialogButton('Next >');
    await waitNewSourcePage(page, 'File Name and Location');
    assert.deepEqual(await buttons(page), ['Wizard >', '< Back', 'Next >', 'Cancel']);
    await page.fill('.dlg-overlay .wiz-main input[type=text]', 'tk');
    await page.dialogButton('Wizard >');
    await page.waitDialog('Module Wizard');
    assert.equal(await h3(page), 'Inputs and Outputs');
    await page.dialogButton('Cancel');
    await page.waitNoDialog();
  } finally {
    await page.eval(() => localStorage.removeItem('silinx.ui'));
  }
}, { build: { commit: 'abc1234', date: '2026-10-21 12:00' } });

// #1326: Add Copy of Source's Files input within the dialog, as wide as the Association choice under it, at every width
uiTest('#1326 Add Copy of Source: the Files input inside the dialog, as wide as its column (a laptop, a tablet either way, a phone)', E, async (page) => {
  await makeProject(env, { name: 'CopyFit', template: 'gates' });
  await page.openProject('CopyFit');
  for (const [w, hgt] of [[1366, 768], [1180, 820], [820, 1180], [390, 844]]) {
    await page.setViewport(w, hgt);
    await page.eval(async () => { (await import('/js/wizards.js')).addSourceDialog(); });   // (not awaited: it ends when closed)
    await page.waitDialog(IMPORT);
    const g = await page.eval(() => {
      const r = (s) => document.querySelector(`.dlg-overlay ${s}`).getBoundingClientRect();
      // (the modern interface asks no association, #1501: the Files input alone in its column)
      const d = r('.dlg'), f = r('input[type=file]'), s = document.querySelector('.dlg-overlay select') ? r('select') : f;
      return { inside: f.left >= d.left && f.right <= d.right + 0.5 && d.right <= innerWidth + 0.5, column: Math.abs(f.right - s.right) < 1.5 && Math.abs(f.left - s.left) < 1.5 };
    });
    assert.deepEqual(g, { inside: true, column: true }, `${w} px`);
    await page.dialogButton('Cancel');
    await page.waitNoDialog();
  }
  await page.setViewport(1366, 768);
});
