// UI: the Files page.
// #1215: Delete File… in a file's menu, in the project or not: asked first (Cancel keeps it), its editor closed, out
// of the project (the UCF: no constraints file), deleted from the disk; in Portuguese; both interfaces.
// #1214: Tasks ▸ Design ▸ Files has Add to Project… (the folder's files not in the project, chosen and added) and
// Add Copy to Project… (Import Source, #1501) above the list; none in the ISE style interface. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DEV = { commit: 'abc1234', date: '2026-10-24 12:00' };

const A = 'library ieee; use ieee.std_logic_1164.all;\nentity a is port (x : in std_logic; y : out std_logic); end a;\narchitecture r of a is begin y <= x; end r;\n';
const B = 'module b(input x, output y); assign y = ~x; endmodule\n';
const onDisk = (pj, f) => fs.access(path.join(env.server.workspace, pj, f)).then(() => true, () => false);
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
async function fileMenu(page, file, item) {
  const i = await page.waitFor((f) => { const k = [...document.querySelectorAll('#files-page tr')].findIndex((tr) => tr.dataset.file === f); return k >= 0 ? k + 1 : 0; }, [file], { what: file }).then((k) => k - 1);
  await page.rightClick('#files-page tr', { index: i });
  await page.waitForSelector('body > .menu-popup');
  const items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi')].map((m) => m.textContent.trim()));
  if (item) await page.click('body > .menu-popup .mi', { text: item });
  return items;
}

uiTest('#1215 Files: Delete File… deletes a file from the disk, in the project or not; asked first; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'DelPj', top: 'a', files: { 'src/a.vhd': A, 'src/b.v': B, 'constraints/top.ucf': 'NET "x" LOC = "P11";\n' } });
  await page.openProject('DelPj');
  await page.eval(() => window.SilinxApp.openFile('src/b.v'));
  await page.leftTab('files');
  // in the project: Remove from Project and Delete File… in its menu
  assert.ok((await fileMenu(page, 'src/b.v')).includes('Delete File…'));
  await page.eval(() => document.querySelector('body > .menu-popup')?.remove());
  // Cancel: kept
  await fileMenu(page, 'src/b.v', 'Delete File…');
  assert.equal(await page.waitDialog('Delete File'), 'Delete File');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .dlg-body, .dlg-overlay').textContent), /Delete 'src\/b\.v' from the disk\?\s*\(It cannot be undone: Remove from Project keeps the file in the project folder\.\)/);
  await page.dialogButton('No');
  await page.waitNoDialog();
  assert.ok(await onDisk('DelPj', 'src/b.v'));
  // OK: its editor closed, out of the project, gone from the disk
  await fileMenu(page, 'src/b.v', 'Delete File…');
  await page.waitDialog('Delete File');
  await page.dialogButton('Yes');
  await page.waitFor(() => !window.Silinx.project.files.some((f) => f.path === 'src/b.v') && !document.querySelector('#files-page tr[data-file="src/b.v"]'), [], { what: 'deleted' });
  assert.equal(await onDisk('DelPj', 'src/b.v'), false);
  assert.equal(await page.eval(() => window.SilinxApp.S.docs.some((d) => d.path === 'src/b.v')), false, 'its editor closed');
  await page.waitConsole(/src\/b\.v deleted\./);
  // the UCF: no constraints file any more
  await fileMenu(page, 'constraints/top.ucf', 'Delete File…');
  await page.waitDialog('Delete File');
  await page.dialogButton('Yes');
  await page.waitFor(() => !document.querySelector('#files-page tr[data-file="constraints/top.ucf"]'), [], { what: 'the UCF deleted' });
  assert.ok(!(await page.eval(() => window.Silinx.project.constraints)), await page.eval(() => JSON.stringify(window.Silinx.project.constraints)));
  assert.equal(await onDisk('DelPj', 'constraints/top.ucf'), false);
  // not in the project (removed from it first): Delete File… too
  await fileMenu(page, 'src/a.vhd', 'Remove from Project');
  await page.waitDialog('Remove Source');
  await page.dialogButton('Yes');
  await page.waitFor(() => document.querySelector('#files-page tr[data-file="src/a.vhd"] td:nth-child(2)')?.textContent === 'Not in project', [], { what: 'not in the project' });
  assert.deepEqual(await fileMenu(page, 'src/a.vhd'), ['Add to Project', 'Open', 'Delete File…']);
  await page.eval(() => document.querySelector('body > .menu-popup')?.remove());
  // in Portuguese: the question
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await fileMenu(page, 'src/a.vhd', 'Apagar Ficheiro…');
  assert.equal(await page.waitDialog('Apagar Ficheiro'), 'Apagar Ficheiro');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay').textContent), /Apagar 'src\/a\.vhd' do disco\?\s*\(Não se pode anular: Remover do Projeto mantém o ficheiro na pasta do projeto\.\)/);
  await page.dialogButton('Sim');
  await page.waitFor(() => !document.querySelector('#files-page tr[data-file="src/a.vhd"]'), [], { what: 'deleted' });
  assert.equal(await onDisk('DelPj', 'src/a.vhd'), false);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(warnings(page), []);
});

async function tasksInterface(page) {
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
}
const bar = (page) => page.eval(() => {
  const b = document.getElementById('task-files-bar');
  if (!b || !b.getClientRects().length) return null;
  const btns = [...b.querySelectorAll('button')];
  return { labels: btns.map((x) => x.textContent), enabled: btns.map((x) => !x.disabled), whole: btns.every((x) => x.scrollWidth <= x.clientWidth),
    above: btns.every((x) => x.getBoundingClientRect().bottom <= document.getElementById('files-page').getBoundingClientRect().top + 1) };
});

uiTest('#1214 Tasks ▸ Files: Add to Project… (the folder\'s files not in the project) and Add Copy to Project… above the list; ISE style none', E, async (page) => {
  await makeProject(env, { name: 'AddPj', top: 'a', files: { 'src/a.vhd': A, 'src/b.v': B } });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('AddPj');
  await page.leftTab('files');
  await page.waitFor(() => [...document.querySelectorAll('#task-files-bar button')].every((b) => !b.disabled), [], { what: 'enabled' });
  assert.deepEqual(await bar(page), { labels: ['Add to Project…', 'Add Copy to Project…'], enabled: [true, true], whole: true, above: true });
  // every file in the project: said so
  await page.click('#task-files-bar button:nth-child(1)');
  await page.waitDialog('Add to Project');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay').textContent), /Every file of the project folder is in the project\./);
  await page.dialogButton('OK');
  await page.waitNoDialog();
  // a file removed from the project: listed, chosen, added back
  await fileMenu(page, 'src/b.v', 'Remove from Project');
  await page.waitDialog('Remove Source');
  await page.dialogButton('Yes');
  await page.waitFor(() => document.querySelector('#files-page tr[data-file="src/b.v"] td:nth-child(2)')?.textContent === 'Not in project', [], { what: 'removed' });
  await page.click('#task-files-bar button:nth-child(1)');
  await page.waitDialog('Add to Project');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .add-free-list label')].map((l) => l.textContent.trim())), ['src/b.v']);
  await page.click('.dlg-overlay .add-free-list input');
  await page.dialogButton('OK');
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/b.v'), [], { what: 'added' });
  await page.waitConsole(/src\/b\.v added to the project\./);
  // Add Copy to Project…: Import Source
  await page.click('#task-files-bar button:nth-child(2)');
  assert.equal(await page.waitDialog('Import Source'), 'Import Source');   // (the Silinx interface's name, #1501)
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#task-files-bar button')?.textContent === 'Acrescentar ao Projeto…', [], { what: 'Portuguese' });
  assert.deepEqual((await bar(page)).labels, ['Acrescentar ao Projeto…', 'Acrescentar Cópia ao Projeto…']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the ISE style interface: none
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.equal(await page.eval(() => document.getElementById('task-files-bar')), null);
  assert.deepEqual(warnings(page), []);
}, { build: DEV });
