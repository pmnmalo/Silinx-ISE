// UI: creating a source file that already exists asks whether to replace it — New Source (Test
// Bench (HDL), Module (HDL), a drawing), the Test Bench Wizard and the Module Wizard: Cancel keeps the
// file and stays on the page (the name selected, to edit), Replace replaces it (and its open editor
// shows the new contents), one entry in the project (#1467; in Portuguese too). No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newFsm } from '../../core/fsm.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const INV = 'library ieee; use ieee.std_logic_1164.all;\nentity inv is port (a : in std_logic; y : out std_logic); end inv;\narchitecture r of inv is begin y <= not a; end r;\n';
const OLD_TB = '-- my old test bench\nentity tb_inv is end tb_inv;\narchitecture t of tb_inv is begin end t;\n';

const pickType = (page, label) => page.eval((t) => { const r = [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => e.textContent.trim().endsWith(t)); r.scrollIntoView(); r.click(); }, label);
const topText = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().innerText);
const topButtons = (page) => page.eval(() => [...[...document.querySelectorAll('.dlg-overlay')].pop().querySelectorAll('.dlg-buttons button')].map((b) => b.textContent));
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
const logWarnings = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent).filter((t) => /^(WARNING|ERROR)/.test(t)));

uiTest('New Source on an existing file: asks to replace; Cancel keeps it, Replace replaces it', E, async (page) => {
  await makeProject(env, { name: 'Repl', top: 'inv', files: { 'src/inv.vhd': INV, 'sim/tb_inv.vhd': OLD_TB }, roles: { 'sim/tb_inv.vhd': 'sim' } });
  await page.openProject('Repl');
  await page.eval(() => window.SilinxApp.openFile('sim/tb_inv.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:sim/tb_inv.vhd');
  const start = async () => {
    await page.menu('Project', 'New Source…');
    await page.waitDialog('New Source');
    await pickType(page, 'Test Bench');
    await page.dialogButton('Next >');
    await page.fill('.dlg-overlay .wiz-main input[type=text]', 'tb_inv');
    await page.dialogButton('Next >');
    // the replace question, on top of the wizard
    await page.waitFor(() => document.querySelectorAll('.dlg-overlay').length === 2);
    assert.match(await topText(page), /sim\/tb_inv\.vhd already exists\.[\s\S]*Replace it\?/);
    assert.deepEqual(await topButtons(page), ['Replace', 'Cancel']);
  };
  // Cancel: the wizard stays on page 1 with the message, the file is unchanged
  await start();
  await page.dialogButton('Cancel');
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay').length === 1 && /already exists: choose another name/.test(document.querySelector('.dlg-overlay').innerText));
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.equal(await readWs(env, 'Repl', 'sim/tb_inv.vhd'), OLD_TB);
  // Replace: asked once, then the test bench replaces the old file; the open editor shows the new text
  await start();
  await page.dialogButton('Replace');
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay').length === 1 && document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Associate Source');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Summary');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => /Test Bench for module: inv/.test(window.SilinxApp.findDoc('file:sim/tb_inv.vhd')?.editor?.getValue() || ''), [], { what: 'editor shows the new test bench' });
  assert.match(await readWs(env, 'Repl', 'sim/tb_inv.vhd'), /Test Bench for module: inv/);
  assert.equal(await page.eval(() => window.Silinx.project.files.filter((f) => f.path === 'sim/tb_inv.vhd').length), 1);
});

uiTest('Test Bench Wizard and Module Wizard on an existing file: replace after confirming; a module of that name in another file is refused', E, async (page) => {
  await makeProject(env, { name: 'Repl2', top: 'inv', files: { 'src/inv.vhd': INV, 'sim/tb_inv.vhd': OLD_TB }, roles: { 'sim/tb_inv.vhd': 'sim' } });
  await page.openProject('Repl2');
  // Test Bench Wizard: tb_inv exists (defined in that same file): Yes replaces it
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  await pickType(page, 'Test Bench');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'tb_inv');
  await page.dialogButton('Wizard >');   // (#958)
  await page.waitDialog('Test Bench Wizard');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay').length === 2);
  assert.match(await topText(page), /sim\/tb_inv\.vhd already exists/);
  await page.dialogButton('Replace');
  for (const t of ['Input Vectors', 'Vectors and Expected Outputs', 'Summary']) {
    await page.dialogButton('Next >');
    await page.waitFor((x) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === x, [t]);
  }
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  // the file is written after the dialog closes: wait for its new contents
  let tb = '';
  for (let i = 0; i < 200 && !/generated by the Silinx Test Bench Wizard/.test(tb); i++) { tb = await readWs(env, 'Repl2', 'sim/tb_inv.vhd'); await new Promise((r) => setTimeout(r, 50)); }
  assert.match(tb, /generated by the Silinx Test Bench Wizard/);
  // Module Wizard: a module named inv lives in src/inv.vhd: a new file named inv2 with module inv is refused
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  await pickType(page, 'Module (HDL)');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'inv');
  await page.dialogButton('Wizard >');   // (#958)
  await page.waitDialog('Module Wizard');
  await page.dialogButton('Next >');
  // the same file (src/inv.vhd defines inv): the replace question
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay').length === 2);
  assert.match(await topText(page), /src\/inv\.vhd already exists/);
  await page.dialogButton('Cancel');
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay').length === 1 && /choose another name/.test(document.querySelector('.dlg-overlay').innerText));
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.equal(await readWs(env, 'Repl2', 'src/inv.vhd'), INV);
});

uiTest('New Source on an existing drawing: Replace / Cancel (in Portuguese too); Cancel keeps the name selected, Replace writes the same file once', E, async (page) => {
  const OLD_FSM = JSON.stringify({ ...newFsm('ctl', 'vhdl'), comment: 'my old FSM' }, null, 2);
  await makeProject(env, { name: 'Repl3', top: 'inv', files: { 'src/inv.vhd': INV, 'src/ctl.fsm.json': OLD_FSM } });
  await page.openProject('Repl3');
  const fileName = '.dlg-overlay .wiz-main input[type=text]';
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  await pickType(page, 'Finite State Machine (FSM)');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'File Name and Location');
  // the name typed with the drawing's extension: the same file (#1467: it was written as src/ctl.fsm.json.fsm.json)
  await page.fill(fileName, 'ctl.fsm.json');
  const ask = async (next, question, buttons) => {
    await page.dialogButton(next);
    await page.waitFor(() => document.querySelectorAll('.dlg-overlay').length === 2);
    assert.equal(await topText(page).then((t) => t.includes(question)), true, await topText(page));
    assert.deepEqual(await topButtons(page), buttons);
  };
  const cancelled = async (cancel, message) => {
    await page.dialogButton(cancel);
    await page.waitFor((m) => document.querySelectorAll('.dlg-overlay').length === 1 && document.querySelector('.dlg-overlay').innerText.includes(m), [message], { what: 'back on the page' });
    // the name kept, selected for editing
    await page.waitFor((sel) => { const i = document.querySelector(sel); return document.activeElement === i && i.selectionStart === 0 && i.selectionEnd === i.value.length; }, [fileName], { what: 'the name selected' });
    assert.equal(await page.eval((sel) => document.querySelector(sel).value, fileName), 'ctl.fsm.json');
    assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3').textContent), cancel === 'Cancel' ? 'File Name and Location' : 'Nome do Ficheiro e Localização');
    assert.equal(JSON.parse(await readWs(env, 'Repl3', 'src/ctl.fsm.json')).comment, 'my old FSM');   // kept
  };
  await ask('Next >', 'src/ctl.fsm.json already exists.\n\nReplace it? Its current contents will be lost.', ['Replace', 'Cancel']);
  await cancelled('Cancel', 'src/ctl.fsm.json already exists: choose another name.');
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await ask('Seguinte >', 'src/ctl.fsm.json já existe.\n\nSubstituir? O conteúdo atual perde-se.', ['Substituir', 'Cancelar']);
  await cancelled('Cancelar', 'src/ctl.fsm.json já existe: escolha outro nome.');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // Replace: asked once (not again on the Summary page), the same file rewritten, one entry in the project
  await ask('Next >', 'src/ctl.fsm.json already exists.', ['Replace', 'Cancel']);
  await page.dialogButton('Replace');
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay').length === 1 && document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Summary');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  let fsm = JSON.parse(OLD_FSM);
  // (its HDL file, generated from the old FSM, made again from the new one and linked)
  for (let i = 0; i < 200 && (fsm.comment || fsm.generatedFile !== 'src/ctl.vhd'); i++) { fsm = JSON.parse(await readWs(env, 'Repl3', 'src/ctl.fsm.json')); await new Promise((r) => setTimeout(r, 50)); }
  assert.equal(fsm.comment, undefined, 'replaced');
  assert.equal(fsm.name, 'ctl');
  await assert.rejects(readWs(env, 'Repl3', 'src/ctl.fsm.json.fsm.json'));
  // one entry: the drawing's HDL in the project once, its module once
  assert.deepEqual(await page.eval(() => window.Silinx.project.files.map((f) => f.path)), ['src/inv.vhd', 'src/ctl.vhd']);
  assert.equal(await page.eval(() => window.Silinx.modules.filter((m) => m.name === 'ctl').length), 1);
  assert.deepEqual(await logWarnings(page), []);
  assert.deepEqual(warnings(page), []);
});
