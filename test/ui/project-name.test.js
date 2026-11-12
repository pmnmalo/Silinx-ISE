// UI: a project's name (#3538): the New Project wizard takes the server's rule and message (core/project-name.js), in
// English and in Portuguese; a project of the name in another case is the existing one (Replace Project names it); the
// imports suggest a valid name made from the file's (2026-lab.zip: p_2026-lab).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject, waitDownload } from './harness.js';
import { FILE, exportZip, openImport } from './zip-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const RULE = 'a letter, then up to 63 letters, digits, - and _';
const wizError = page => page.eval(() => document.querySelector('.dlg-overlay .wiz-main')?.nextElementSibling?.textContent || '');
async function firstPage(page, name) {
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.dialogButton('Next >');
}

uiTest('#3538 New Project wizard: the server\'s name rule and message, in Portuguese too; a name in another case is the existing project', E, async (page) => {
  // lab-1: refused by the wizard before, valid everywhere else
  await firstPage(page, 'lab-1');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Settings', [], { what: 'lab-1 accepted' });
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // 65 letters: refused by the wizard as by the server, with its message
  const long = 'A'.repeat(65);
  await firstPage(page, long);
  await page.waitFor((m) => document.querySelector('.dlg-overlay .wiz-main')?.nextElementSibling?.textContent === m, [`invalid project name '${long}': ${RULE}`], { what: 'the rule\'s message' });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3').textContent), 'Create New Project');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // a1 there: A1 is it (one folder on a case-insensitive file system)
  await makeProject(env, { name: 'a1' });
  await firstPage(page, 'A1');
  await page.waitDialog('Replace Project');
  assert.match(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().innerText), /A project named 'a1' already exists\./);
  await page.dialogButton('No');
  await page.waitFor((m) => document.querySelector('.dlg-overlay .wiz-main')?.nextElementSibling?.textContent === m, ["A project named 'a1' already exists: choose another name."], { what: 'the existing project\'s name' });
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.menu('Ficheiro', 'Novo Projeto…');
    await page.waitDialog('Assistente de Novo Projeto');
    await page.fill('.dlg-overlay .wiz-main input[type=text]', '1lab');
    await page.dialogButton('Seguinte >');
    await page.waitFor(() => /^nome de projeto inválido '1lab': uma letra, depois até 63 letras, dígitos, - e _$/.test(document.querySelector('.dlg-overlay .wiz-main')?.nextElementSibling?.textContent || ''), [], { what: 'the message in Portuguese' });
    await page.fill('.dlg-overlay .wiz-main input[type=text]', 'A1');
    await page.dialogButton('Seguinte >');
    await page.waitDialog('Substituir Projeto');
    await page.dialogButton('Não');
    await page.waitFor(() => (document.querySelector('.dlg-overlay .wiz-main')?.nextElementSibling?.textContent || '') === "Já existe um projeto chamado 'a1': escolha outro nome.", [], { what: 'the existing project in Portuguese' });
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  assert.equal(await wizError(page), '');
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

uiTest('#3538 Import Project (.zip)…, Silinx and Xilinx ISE: the name suggested from 2026-lab.zip is p_2026-lab, and the project is made', E, async (page) => {
  await makeProject(env, { name: 'NameSrc', template: 'blinky', board: 'basys2' });
  await page.openProject('NameSrc');
  await exportZip(page, 'silinx');
  const zip = path.join(env.tmp, '2026-lab.zip');
  await fs.copyFile(await waitDownload(page, 'NameSrc-silinx.zip'), zip);
  await openImport(page, 'silinx');
  await page.setFiles(FILE, [zip]);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay input[type=text]').value), 'p_2026-lab');
  await page.dialogButton('Import');
  await page.waitFor(() => window.Silinx.project?.name === 'p_2026-lab', [], { what: 'the project imported' });
  await page.waitConsole(/Imported Silinx project 'p_2026-lab'/);
  // the ISE import suggests the same name, and refuses one past the rule with its message
  await exportZip(page, 'xilinx');
  const ise = path.join(env.tmp, 'ise', '2026-lab.zip');
  await fs.mkdir(path.dirname(ise), { recursive: true });
  await fs.copyFile(await waitDownload(page, 'p_2026-lab.zip'), ise);
  await openImport(page, 'xilinx');
  await page.setFiles(FILE, [ise]);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay input[type=text]').value), 'p_2026-lab');
  await page.fill('.dlg-overlay input[type=text]', 'lab.1');
  await page.dialogButton('Import');
  await page.waitFor(() => [...document.querySelectorAll('.dlg-overlay .msg-error')].length, [], { what: 'the error' });
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay').innerText), new RegExp(`invalid project name 'lab\\.1': ${RULE.replace(/[-.*+?^${}()|[\]\\]/g, '\\$&')}`));   // (every special character escaped, backslashes too, #3692)
  await page.dialogButton('OK');
  await page.waitNoDialog();
  assert.equal((await env.server.api('GET', '/api/projects')).some((p) => p.name === 'lab.1'), false);
});
