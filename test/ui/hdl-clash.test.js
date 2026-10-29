// UI: a drawing whose HDL file name is taken (#230). Every drawn source gets its HDL file
// (src/<module>.vhd, #207); when a file of that name is in the way, the drawing is not left silently
// without it: one console warning per opening of the project (no dialog), a [No HDL] badge on its row
// in the Design pane (its tip says why), and its menu's Generate HDL File… resolves it: the file that
// defines its module already is replaced by the generated HDL once the user says Yes (No: nothing
// changes); a file holding something else is left alone and the HDL goes to <module>_<kind>.vhd. The New
// Source wizards refuse a name whose HDL file is taken. A Petri net (the case reported) and a truth table;
// the Portuguese interface.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { viewHdl } from '../../core/view-hdl.js';
import { newPetri } from '../../core/petri.js';
import { newTable } from '../../core/logic.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// every row of the tree, indented by its depth: "icon label [base*] [badge] (meta)"
const rows = (page) => page.eval(() => [...document.querySelectorAll('#hier .row')].map((r) => {
  let d = 0;
  for (let u = r.parentElement.parentElement; u && u.id !== 'hier'; u = u.parentElement) if (u.tagName === 'UL') d++;
  const b = [...r.querySelectorAll('.badge')].map((x) => `[${x.textContent}${x.classList.contains('base') ? '*' : ''}${x.classList.contains('warn') ? '!' : ''}]`);
  return `${'  '.repeat(d - 1)}${r.querySelector('.ico')?.dataset.ico} ${r.querySelector('.lbl').textContent}${b.length ? ` ${b.join(' ')}` : ''}${r.querySelector('.meta') ? ` ${r.querySelector('.meta').textContent}` : ''}`;
}));
const warnTip = (page) => page.eval(() => document.querySelector('#hier .badge.warn')?.title ?? null);
const menuLabels = (page) => page.waitFor(() => { const m = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => i.textContent.trim()); return m.length ? m : null; }, [], { what: 'the context menu' });
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)\b/.test(l));
const topText = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().innerText);

const PN = JSON.stringify(newPetri('ctl', 'vhdl'), null, 2);
// an earlier HDL of the net (its module, ctl), written by hand
const OLD_CTL = 'library ieee;\nuse ieee.std_logic_1164.all;\n\n-- my earlier controller\nentity ctl is\n  port (clk : in std_logic; busy : out std_logic);\nend ctl;\n\narchitecture rtl of ctl is\nbegin\n  busy <= \'0\';\nend rtl;\n';
const TT = JSON.stringify({ ...newTable('maj', ['a', 'b', 'c'], ['f']), lang: 'vhdl', table: { f: '00010111' } }, null, 2);
// a file named as the table's HDL, holding another module
const OTHER = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity parity is\n  port (a, b : in std_logic; p : out std_logic);\nend parity;\n\narchitecture rtl of parity is\nbegin\n  p <= a xor b;\nend rtl;\n';

const W_PN = 'WARNING: src/ctl.pn.json has no HDL file: src/ctl.vhd exists already and defines its module ctl. Generate HDL File… (its right-click menu in the Design pane) replaces src/ctl.vhd with the HDL generated from it.';
const TIP_PN = 'No HDL file: src/ctl.vhd defines its module ctl already. Generate HDL File… (right-click) replaces it with the HDL generated from the drawing.';
const W_TT = 'WARNING: src/maj.tt.json has no HDL file: src/maj.vhd exists already and holds something else. Generate HDL File… (its right-click menu in the Design pane) writes its HDL to src/maj_tt.vhd.';
const TIP_TT = 'No HDL file: src/maj.vhd holds something else. Generate HDL File… (right-click) writes its HDL to src/maj_tt.vhd.';

uiTest('#230 regression, a Petri net whose HDL file exists and defines its module: warned once (no dialog), [No HDL] on its row; Generate HDL File… asks, No keeps the file, Yes replaces and links it', E, async (page) => {
  await makeProject(env, { name: 'C_pn', top: 'ctl', files: { 'src/ctl.pn.json': PN, 'src/ctl.vhd': OLD_CTL } });
  await page.openProject('C_pn');
  await page.waitFor(() => !!document.querySelector('#hier .badge.warn'), [], { what: 'the [No HDL] badge' });
  assert.deepEqual(await warnings(page), [W_PN]);
  assert.equal(await page.dialogCount(), 0);
  assert.deepEqual(await rows(page), [
    'project C_pn',
    '  chip xc3s250e-4-cp132',
    '    moduleTop ctl [VHDL*] (ctl.vhd)',
    '    petri ctl.pn.json [No HDL!]',
  ]);
  assert.equal(await warnTip(page), TIP_PN);
  // nothing written; loaded again (e.g. after a save): not said again
  assert.equal(await readWs(env, 'C_pn', 'src/ctl.vhd'), OLD_CTL);
  assert.equal(await readWs(env, 'C_pn', 'src/ctl.pn.json'), PN);
  await page.eval(() => window.SilinxApp.reloadProject());
  assert.deepEqual(await warnings(page), [W_PN]);
  // its menu: Generate HDL File…; No: nothing changes
  await page.treeRow('#hier', 'ctl.pn.json', { right: true, exact: true });
  assert.deepEqual(await menuLabels(page), ['Open', 'Set as Top Module', 'Rename…', 'Generate HDL File…', 'Remove from Project']);
  await page.click('body > .menu-popup .mi', { text: 'Generate HDL File…' });
  await page.waitDialog('Generate HDL File');
  assert.match(await topText(page), /src\/ctl\.vhd defines the module ctl already\.\n\nReplace it with the HDL generated from ctl\.pn\.json\? Its current contents will be lost\./);
  await page.dialogButton('No');
  await page.waitNoDialog();
  assert.equal(await readWs(env, 'C_pn', 'src/ctl.vhd'), OLD_CTL);
  assert.equal(await readWs(env, 'C_pn', 'src/ctl.pn.json'), PN);
  // the badge does the same; Yes: replaced by the net's HDL, linked
  await page.click('#hier .badge.warn');
  await page.waitDialog('Generate HDL File');
  await page.dialogButton('Yes');
  await page.waitNoDialog();
  await page.waitConsole(/src\/ctl\.vhd replaced by the HDL generated from src\/ctl\.pn\.json, linked to it/);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/ctl.vhd'] === 'src/ctl.pn.json', [], { what: 'linked' });
  const d = JSON.parse(await readWs(env, 'C_pn', 'src/ctl.pn.json'));
  assert.equal(d.generatedFile, 'src/ctl.vhd');
  assert.equal(await readWs(env, 'C_pn', 'src/ctl.vhd'), viewHdl('src/ctl.pn.json', PN).text);
  await page.waitFor(() => !document.querySelector('#hier .badge.warn'), [], { what: 'no [No HDL] badge' });
  assert.deepEqual(await rows(page), [
    'project C_pn',
    '  chip xc3s250e-4-cp132',
    '    moduleTop ctl [Petri*] [VHDL] (ctl.pn.json)',
  ]);
  assert.deepEqual(await warnings(page), [W_PN]);
  // opened again: nothing to say
  await page.openProject('C_pn');
  assert.deepEqual(await warnings(page), [W_PN]);
  assert.equal(await page.eval(() => Object.keys(window.Silinx.hdlClash).length), 0);
});

uiTest('#230 regression, a truth table whose HDL file name holds another module: warned once, [No HDL] after [Algebra]; Generate HDL File… writes src/maj_tt.vhd and links it, the other file untouched', E, async (page) => {
  await makeProject(env, { name: 'C_tt', top: '', files: { 'src/maj.tt.json': TT, 'src/maj.vhd': OTHER } });
  await page.openProject('C_tt');
  await page.waitFor(() => !!document.querySelector('#hier .badge.warn'), [], { what: 'the [No HDL] badge' });
  assert.deepEqual(await warnings(page), [W_TT]);
  assert.deepEqual(await rows(page), [
    'project C_tt',
    '  chip xc3s250e-4-cp132',
    '    truthtable maj [Algebra*] [Schematic] [No HDL!] (maj.tt.json)',
    '    vhdl parity [VHDL*] (maj.vhd)',
  ]);
  assert.equal(await warnTip(page), TIP_TT);
  await page.treeRow('#hier', 'maj', { right: true, exact: true });
  assert.deepEqual(await menuLabels(page), ['Open', 'Set as Top Module', 'Rename…', 'Generate HDL File…', 'Remove from Project']);
  await page.click('body > .menu-popup .mi', { text: 'Generate HDL File…' });
  // (nothing lost: no question)
  await page.waitConsole(/src\/maj_tt\.vhd generated from src\/maj\.tt\.json \(src\/maj\.vhd holds something else\)/);
  assert.equal(await page.dialogCount(), 0);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/maj_tt.vhd'] === 'src/maj.tt.json', [], { what: 'linked' });
  assert.equal(JSON.parse(await readWs(env, 'C_tt', 'src/maj.tt.json')).generatedFile, 'src/maj_tt.vhd');
  assert.equal(await readWs(env, 'C_tt', 'src/maj_tt.vhd'), viewHdl('src/maj.tt.json', TT).text);
  assert.equal(await readWs(env, 'C_tt', 'src/maj.vhd'), OTHER);
  await page.waitFor(() => !document.querySelector('#hier .badge.warn'), [], { what: 'no [No HDL] badge' });
  assert.deepEqual(await rows(page), [
    'project C_tt',
    '  chip xc3s250e-4-cp132',
    '    truthtable maj [Algebra*] [Schematic] [VHDL] (maj.tt.json)',
    '    vhdl parity [VHDL*] (maj.vhd)',
  ]);
  assert.deepEqual(await warnings(page), [W_TT]);
});

uiTest('#230 two drawings of the same module: the second has no HDL file, warned once, [No HDL]; nothing to generate (one of them is renamed)', E, async (page) => {
  const linked = JSON.stringify({ ...JSON.parse(PN), generatedFile: 'src/ctl.vhd' }, null, 2);
  const TT2 = JSON.stringify({ ...newTable('ctl', ['a', 'b'], ['f']), lang: 'vhdl', table: { f: '0110' } }, null, 2);
  await makeProject(env, { name: 'C_two', top: 'ctl', files: { 'src/ctl.pn.json': linked, 'src/ctl.vhd': viewHdl('src/ctl.pn.json', PN).text, 'src/other.tt.json': TT2 } });
  await page.openProject('C_two');
  await page.waitFor(() => !!document.querySelector('#hier .badge.warn'), [], { what: 'the [No HDL] badge' });
  assert.deepEqual(await warnings(page), ['WARNING: src/other.tt.json has no HDL file: its module ctl is the module of src/ctl.pn.json (src/ctl.vhd). Rename one of them.']);
  assert.deepEqual(await rows(page), [
    'project C_two',
    '  chip xc3s250e-4-cp132',
    '    moduleTop ctl [Petri*] [VHDL] (ctl.pn.json)',
    '    truthtable other.tt.json [No HDL!]',
  ]);
  assert.equal(await warnTip(page), 'No HDL file: its module ctl is the module of src/ctl.pn.json. Rename one of them.');
  await page.treeRow('#hier', 'other.tt.json', { right: true, exact: true });
  assert.deepEqual(await menuLabels(page), ['Open', 'Set as Top Module', 'Rename…', 'Remove from Project']);
  await page.closeMenus();
  // the badge says what to do; nothing written
  await page.click('#hier .badge.warn');
  await page.waitDialog('Generate HDL File');
  assert.match(await topText(page), /No HDL file: its module ctl is the module of src\/ctl\.pn\.json\. Rename one of them\./);
  await page.dialogButton('OK');
  await page.waitNoDialog();
  assert.equal(await readWs(env, 'C_two', 'src/other.tt.json'), TT2);
  assert.equal(await readWs(env, 'C_two', 'src/ctl.vhd'), viewHdl('src/ctl.pn.json', PN).text);
});

uiTest('#230 New Source: a Petri net, a truth table and the Petri Net Wizard refuse a name whose HDL file is taken (or whose module exists); another name goes on', E, async (page) => {
  await makeProject(env, { name: 'C_new', top: '', files: { 'src/maj.vhd': OTHER } });
  await page.openProject('C_new');
  const pickType = (label) => page.eval((t) => { const r = [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => e.textContent.trim().endsWith(t)); r.scrollIntoView(); r.click(); }, label);
  const wizText = () => page.eval(() => document.querySelector('.dlg-overlay .wiz').innerText);
  for (const [type, name, msg] of [
    ['Petri Net', 'maj', 'src/maj.vhd already exists: the HDL generated from the new source would be written there. Choose another name.'],
    ['Boolean Algebra', 'maj', 'src/maj.vhd already exists: the HDL generated from the new source would be written there. Choose another name.'],
    ['Boolean Algebra', 'parity', "A module named 'parity' already exists."],
  ]) {
    await page.menu('Project', 'New Source…');
    await page.waitDialog('New Source');
    await pickType(type);
    await page.dialogButton('Next >');
    await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
    await page.dialogButton('Next >');
    await page.waitFor((m) => document.querySelector('.dlg-overlay .wiz').innerText.includes(m), [msg], { what: msg });
    assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent), 'File Name and Location');
    await page.dialogButton('Cancel');
    await page.waitNoDialog();
  }
  // the Petri Net Wizard: refused by New Source's Wizard > (#958), on the page of the name (#2082: the wizard has none)
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  await pickType('Petri Net');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'maj');
  await page.dialogButton('Wizard >');
  await page.waitFor(() => /src\/maj\.vhd already exists: the HDL generated from the new source would be written there\. Choose another name\./.test(document.querySelector('.dlg-overlay .wiz').innerText), [], { what: 'refused' });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent), 'File Name and Location');
  assert.equal(await page.dialogCount(), 1);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // another name: created, its HDL file at once, nothing to warn about
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  await pickType('Petri Net');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'maj2');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitConsole(/src\/maj2\.vhd generated from src\/maj2\.pn\.json \(every source has its HDL\)/);
  assert.deepEqual(await warnings(page), []);
  assert.equal(await readWs(env, 'C_new', 'src/maj.vhd'), OTHER);
});

uiTest('#230 in Portuguese: the [Sem HDL] badge and its tip, Gerar Ficheiro HDL… in the menu, the question, the New Source refusal', E, async (page) => {
  await makeProject(env, { name: 'C_pt', top: 'ctl', files: { 'src/ctl.pn.json': PN, 'src/ctl.vhd': OLD_CTL, 'src/maj.tt.json': TT, 'src/maj.vhd': OTHER, 'src/notes.vhd': '-- notes\n' } });
  await page.openProject('C_pt');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.waitFor(() => [...document.querySelectorAll('#hier .badge.warn')].filter((b) => b.textContent === 'Sem HDL').length === 2, [], { what: 'the badges in Portuguese' });
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#hier .badge.warn')].map((b) => b.title)), [
      'Sem ficheiro HDL: src/maj.vhd contém outra coisa. Gerar Ficheiro HDL… (botão direito) escreve o seu HDL em src/maj_tt.vhd.',
      'Sem ficheiro HDL: src/ctl.vhd já define o seu módulo ctl. Gerar Ficheiro HDL… (botão direito) substitui-o pelo HDL gerado a partir do desenho.',
    ]);
    await page.treeRow('#hier', 'ctl.pn.json', { right: true, exact: true });
    assert.deepEqual(await menuLabels(page), ['Abrir', 'Definir como Módulo de Topo', 'Mudar o Nome…', 'Gerar Ficheiro HDL…', 'Remover do Projeto']);
    await page.click('body > .menu-popup .mi', { text: 'Gerar Ficheiro HDL…' });
    await page.waitDialog('Gerar Ficheiro HDL');
    assert.match(await topText(page), /src\/ctl\.vhd já define o módulo ctl\.\n\nSubstituí-lo pelo HDL gerado a partir de ctl\.pn\.json\? O conteúdo atual perde-se\./);
    await page.dialogButton('Não');
    await page.waitNoDialog();
    assert.equal(await readWs(env, 'C_pt', 'src/ctl.vhd'), OLD_CTL);
    // New Source: the refusal
    await page.eval(async () => { (await import('/js/wizards.js')).newSourceWizard({ type: 'petri' }); });
    await page.waitDialog();
    await page.dialogButton('Seguinte >');
    await page.fill('.dlg-overlay .wiz-main input[type=text]', 'notes');
    await page.dialogButton('Seguinte >');
    await page.waitFor(() => document.querySelector('.dlg-overlay .wiz').innerText.includes('src/notes.vhd já existe: o HDL gerado a partir da nova fonte seria escrito aí. Escolha outro nome.'), [], { what: 'the refusal in Portuguese' });
    await page.fill('.dlg-overlay .wiz-main input[type=text]', 'maj');
    await page.dialogButton('Seguinte >');
    await page.waitFor(() => document.querySelector('.dlg-overlay .wiz').innerText.includes("Já existe um módulo chamado 'maj'."), [], { what: 'the module refusal in Portuguese' });
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
});

// ---- #231: a drawing whose HDL file (generatedFile) is gone: deleted from the folder, or removed from the project
const LINKED_PN = JSON.stringify({ ...JSON.parse(PN), generatedFile: 'src/ctl.vhd' }, null, 2);
const CTL_HDL = viewHdl('src/ctl.pn.json', PN).text;
const LINKED_ROWS = (pj) => [`project ${pj}`, '  chip xc3s250e-4-cp132', '    moduleTop ctl [Petri*] [VHDL] (ctl.pn.json)'];
const W_RM = 'WARNING: src/ctl.pn.json has no HDL file: its HDL file src/ctl.vhd was removed from the project (it is still in the project folder). Generate HDL File… (its right-click menu in the Design pane) makes it again from src/ctl.pn.json; Add to Project (Files) brings it back as it is.';
const TIP_RM = 'No HDL file: its HDL file src/ctl.vhd was removed from the project. Generate HDL File… (right-click) makes it again from the drawing.';
const pjFiles = async (name) => (await env.server.api('GET', `/api/projects/${encodeURIComponent(name)}`)).files.map((f) => f.path);
// Remove from Project of one file in the Files view: a drawing's HDL file alone (the Design pane's
// removes the drawing with it, #234)
const filesRow = (page, file) => page.waitFor((f) => { const i = [...document.querySelectorAll('#files-page tr')].findIndex((tr) => tr.cells[0]?.textContent === f); return i >= 0 ? i + 1 : 0; }, [file], { what: `${file} in the Files view` }).then((i) => i - 1);
const removeInFiles = async (page, file) => {
  await page.leftTab('files');
  await page.rightClick('#files-page tr', { index: await filesRow(page, file) });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Remove from Project' });
  await page.waitDialog('Remove Source');
  await page.dialogButton('Yes');
  await page.waitNoDialog();
  await page.leftTab('design');
};

uiTest('#231 regression, a Petri net whose HDL file is deleted from the folder: made again from it and linked at the next load, said in the console, no warning', E, async (page) => {
  await makeProject(env, { name: 'L_del', top: 'ctl', files: { 'src/ctl.pn.json': LINKED_PN, 'src/ctl.vhd': CTL_HDL } });
  await page.openProject('L_del');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/ctl.vhd'] === 'src/ctl.pn.json', [], { what: 'linked' });
  assert.deepEqual(await rows(page), LINKED_ROWS('L_del'));
  await fsp.rm(path.join(env.server.workspace, 'L_del', 'src/ctl.vhd'));
  await page.eval(() => window.SilinxApp.reloadProject());
  await page.waitConsole(/src\/ctl\.vhd generated from src\/ctl\.pn\.json \(its HDL file src\/ctl\.vhd is no longer in the project folder\)/);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/ctl.vhd'] === 'src/ctl.pn.json', [], { what: 'linked again' });
  assert.equal(await readWs(env, 'L_del', 'src/ctl.vhd'), CTL_HDL);
  assert.equal(JSON.parse(await readWs(env, 'L_del', 'src/ctl.pn.json')).generatedFile, 'src/ctl.vhd');
  assert.deepEqual(await rows(page), LINKED_ROWS('L_del'));
  assert.deepEqual(await warnings(page), []);
  assert.equal(await page.eval(() => Object.keys(window.Silinx.hdlClash).length), 0);
});

uiTest('#231 a truth table whose HDL file is gone when the project is opened: made again; its name taken by another module: the #230 warning, [No HDL], Generate HDL File… writes the free name', E, async (page) => {
  const linked = (f) => JSON.stringify({ ...JSON.parse(TT), generatedFile: f }, null, 2);
  // gone, its name free: made again at once
  await makeProject(env, { name: 'L_open', top: '', files: { 'src/maj.tt.json': linked('src/maj.vhd') } });
  await page.openProject('L_open');
  await page.waitConsole(/src\/maj\.vhd generated from src\/maj\.tt\.json \(its HDL file src\/maj\.vhd is no longer in the project folder\)/);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/maj.vhd'] === 'src/maj.tt.json', [], { what: 'linked' });
  assert.equal(await readWs(env, 'L_open', 'src/maj.vhd'), viewHdl('src/maj.tt.json', TT).text);
  assert.deepEqual(await rows(page), ['project L_open', '  chip xc3s250e-4-cp132', '    truthtable maj [Algebra*] [Schematic] [VHDL] (maj.tt.json)']);
  assert.deepEqual(await warnings(page), []);
  // gone (it was src/maj_tt.vhd), src/maj.vhd holding another module: as #230
  await makeProject(env, { name: 'L_taken', top: '', files: { 'src/maj.tt.json': linked('src/maj_tt.vhd'), 'src/maj.vhd': OTHER } });
  await page.openProject('L_taken');
  await page.waitFor(() => !!document.querySelector('#hier .badge.warn'), [], { what: 'the [No HDL] badge' });
  assert.deepEqual(await warnings(page), [W_TT]);
  assert.deepEqual(await rows(page), [
    'project L_taken',
    '  chip xc3s250e-4-cp132',
    '    truthtable maj [Algebra*] [Schematic] [No HDL!] (maj.tt.json)',
    '    vhdl parity [VHDL*] (maj.vhd)',
  ]);
  assert.equal(await warnTip(page), TIP_TT);
  await page.click('#hier .badge.warn');
  await page.waitConsole(/src\/maj_tt\.vhd generated from src\/maj\.tt\.json \(src\/maj\.vhd holds something else\)/);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/maj_tt.vhd'] === 'src/maj.tt.json', [], { what: 'linked' });
  assert.equal(await readWs(env, 'L_taken', 'src/maj_tt.vhd'), viewHdl('src/maj.tt.json', TT).text);
  assert.equal(await readWs(env, 'L_taken', 'src/maj.vhd'), OTHER);
  assert.deepEqual(await warnings(page), [W_TT]);
});

uiTest('#231 regression, a Petri net whose HDL file is removed from the project (the Files view): a module by itself, warned once, [No HDL]; Undo links it again; Generate HDL File… asks, Yes makes it again and puts it back in the project', E, async (page) => {
  await makeProject(env, { name: 'L_rm', top: 'ctl', files: { 'src/ctl.pn.json': LINKED_PN, 'src/ctl.vhd': CTL_HDL } });
  await page.openProject('L_rm');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/ctl.vhd'] === 'src/ctl.pn.json', [], { what: 'linked' });
  await removeInFiles(page, 'src/ctl.vhd');
  await page.waitFor(() => !!document.querySelector('#hier .badge.warn'), [], { what: 'the [No HDL] badge' });
  assert.deepEqual(await warnings(page), [W_RM]);
  assert.equal(await page.dialogCount(), 0);
  assert.deepEqual(await rows(page), ['project L_rm', '  chip xc3s250e-4-cp132', '    moduleTop ctl [Petri*] [No HDL!] (ctl.pn.json)']);
  assert.equal(await warnTip(page), TIP_RM);
  // nothing written: the file in the folder, out of the project; the net still names it
  assert.equal(await readWs(env, 'L_rm', 'src/ctl.vhd'), CTL_HDL);
  assert.equal(await readWs(env, 'L_rm', 'src/ctl.pn.json'), LINKED_PN);
  assert.deepEqual(await pjFiles('L_rm'), []);
  // Undo (the toast's): back in the project, linked, nothing to say
  await page.click('.toast .toast-action', { text: 'Undo' });
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/ctl.vhd'] === 'src/ctl.pn.json' && !document.querySelector('#hier .badge.warn'), [], { what: 'linked again' });
  assert.deepEqual(await rows(page), LINKED_ROWS('L_rm'));
  assert.deepEqual(await warnings(page), [W_RM]);
  // removed again: its menu's Generate HDL File…; No: nothing changes
  await removeInFiles(page, 'src/ctl.vhd');
  await page.waitFor(() => !!document.querySelector('#hier .badge.warn'), [], { what: 'the [No HDL] badge' });
  await page.treeRow('#hier', 'ctl', { right: true, exact: true });
  // (ctl the top: Unset as Top Module, #1220)
  assert.deepEqual(await menuLabels(page), ['Open', 'Unset as Top Module', 'Rename…', 'Generate HDL File…', 'Remove from Project']);
  await page.click('body > .menu-popup .mi', { text: 'Generate HDL File…' });
  await page.waitDialog('Generate HDL File');
  assert.match(await topText(page), /src\/ctl\.vhd, the HDL file of ctl\.pn\.json, was removed from the project\.\n\nMake it again from ctl\.pn\.json and put it back in the project\? Its current contents will be lost\./);
  await page.dialogButton('No');
  await page.waitNoDialog();
  assert.deepEqual(await pjFiles('L_rm'), []);
  // the badge; Yes: made again, back in the project, linked
  await page.click('#hier .badge.warn');
  await page.waitDialog('Generate HDL File');
  await page.dialogButton('Yes');
  await page.waitNoDialog();
  await page.waitConsole(/src\/ctl\.vhd generated again from src\/ctl\.pn\.json, back in the project/);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/ctl.vhd'] === 'src/ctl.pn.json' && !document.querySelector('#hier .badge.warn'), [], { what: 'linked' });
  assert.deepEqual(await pjFiles('L_rm'), ['src/ctl.vhd']);
  assert.equal(await readWs(env, 'L_rm', 'src/ctl.vhd'), CTL_HDL);
  assert.equal(JSON.parse(await readWs(env, 'L_rm', 'src/ctl.pn.json')).generatedFile, 'src/ctl.vhd');
  assert.deepEqual(await rows(page), LINKED_ROWS('L_rm'));
  // (said once per opening of the project)
  assert.deepEqual(await warnings(page), [W_RM]);
});

uiTest('#231 a schematic whose HDL file is removed from the project (the Files view): saving the schematic does not write it back into the project silently', E, async (page) => {
  const SCH = JSON.stringify(newDoc('gate', 'vhdl'), null, 1);
  const hdl = viewHdl('src/gate.sch.json', SCH).text;
  const linked = JSON.stringify({ ...JSON.parse(SCH), generatedFile: 'src/gate.vhd' }, null, 1);
  await makeProject(env, { name: 'L_sch', top: 'gate', files: { 'src/gate.sch.json': linked, 'src/gate.vhd': hdl } });
  await page.openProject('L_sch');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/gate.vhd'] === 'src/gate.sch.json', [], { what: 'linked' });
  await removeInFiles(page, 'src/gate.vhd');
  await page.waitFor(() => !!document.querySelector('#hier .badge.warn'), [], { what: 'the [No HDL] badge' });
  const W = 'WARNING: src/gate.sch.json has no HDL file: its HDL file src/gate.vhd was removed from the project (it is still in the project folder). Generate HDL File… (its right-click menu in the Design pane) makes it again from src/gate.sch.json; Add to Project (Files) brings it back as it is.';
  assert.deepEqual(await warnings(page), [W]);
  assert.deepEqual(await rows(page), ['project L_sch', '  chip xc3s250e-4-cp132', '    moduleTop gate [Schematic*] [No HDL!] (gate.sch.json)']);
  // the schematic opened, changed (a port: its HDL different) and saved
  await page.eval(() => window.SilinxApp.openSch('src/gate.sch.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/gate.sch.json' && window.Silinx.active.schEditor, [], { what: 'the schematic open' });
  await page.eval(async () => {
    const d = window.Silinx.active, m = d.schEditor.getDoc();
    m.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 100, y: 100 });
    d.schEditor.setDoc(m);
    window.SilinxApp.setDirty(d, true);
    await window.SilinxApp.saveAll();
  });
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  await page.eval(() => window.SilinxApp.reloadProject());
  assert.deepEqual(JSON.parse(await readWs(env, 'L_sch', 'src/gate.sch.json')).ports.map((q) => q.name), ['a']);
  assert.equal(await readWs(env, 'L_sch', 'src/gate.vhd'), hdl);
  assert.deepEqual(await pjFiles('L_sch'), []);
  assert.ok(await page.eval(() => !!document.querySelector('#hier .badge.warn')));
  assert.deepEqual(await warnings(page), [W]);
});

uiTest('#231 in Portuguese: the tip of [Sem HDL] and the question of a drawing whose HDL file was removed from the project', E, async (page) => {
  await makeProject(env, { name: 'L_pt', top: 'ctl', files: { 'src/ctl.pn.json': LINKED_PN, 'src/ctl.vhd': CTL_HDL } });
  await page.openProject('L_pt');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/ctl.vhd'] === 'src/ctl.pn.json', [], { what: 'linked' });
  await removeInFiles(page, 'src/ctl.vhd');
  await page.waitFor(() => !!document.querySelector('#hier .badge.warn'), [], { what: 'the [No HDL] badge' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.waitFor(() => document.querySelector('#hier .badge.warn')?.textContent === 'Sem HDL', [], { what: 'the badge in Portuguese' });
    assert.equal(await warnTip(page), 'Sem ficheiro HDL: o seu ficheiro HDL src/ctl.vhd foi removido do projeto. Gerar Ficheiro HDL… (botão direito) gera-o de novo a partir do desenho.');
    await page.click('#hier .badge.warn');
    await page.waitDialog('Gerar Ficheiro HDL');
    assert.match(await topText(page), /src\/ctl\.vhd, o ficheiro HDL de ctl\.pn\.json, foi removido do projeto\.\n\nGerá-lo de novo a partir de ctl\.pn\.json e repô-lo no projeto\? O conteúdo atual perde-se\./);
    await page.dialogButton('Não');
    await page.waitNoDialog();
    assert.deepEqual(await pjFiles('L_pt'), []);
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
});
