// UI: a design and simulation project (#3780, core/project-kind.js, web/js/design-only.js): New Project's Project Kind (no
// board, no device, no language; a drawing its top); the Design pane and the Files tab without HDL, the menus, the
// toolbars, the process tree and the tasks without the flow; an HDL file opened (its drawing instead) or added (refused,
// the MCP server's message); New Source's drawings only; Design Properties both ways (a board makes it an FPGA project, its
// HDL and flow back; the reverse refused with HDL sources of the user's own); in Portuguese. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, writeWs, ROOT } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const FSM = fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8');
const HDL = p => `ERROR: ${p}: a design and simulation project has drawings only: choose a board in Design Properties to add HDL sources`;

// what the interface shows of the open project: the Design pane's rows and badges, the Files tab, the menus, the toolbars, the tasks
const shown = page => page.eval(() => {
  const S = window.SilinxApp.S;
  const items = m => S.menus.find(x => x.label === m).items().filter(x => x && x !== '-').map(x => x.label);
  const visible = el => !el.hidden && getComputedStyle(el).display !== 'none';
  return {
    rows: [...document.querySelectorAll('#hier .row')].map(r => [r.querySelector('.lbl')?.textContent, [...r.querySelectorAll('.badge')].map(b => b.textContent)]),
    files: [...document.querySelectorAll('#files-page tr[data-file]')].map(r => r.dataset.file),
    process: items('Process'), tools: items('Tools'), view: items('View'),
    steps: [...document.querySelectorAll('#toolbar .m-step')].filter(b => !b.hidden).map(b => b.dataset.step),
    buttons: [...document.querySelectorAll('#toolbar .tb-btn:is([data-cmd=run], [data-cmd=impact])')].filter(b => !b.hidden).map(b => b.dataset.cmd),
    tasks: [...new Set([...document.querySelectorAll('.task-btn')].filter(visible).map(b => b.dataset.task))],
    tasksLayout: document.documentElement.dataset.layout === 'tasks', kind: document.documentElement.dataset.projectKind || null,
  };
});
const procs = page => page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].map(e => e.textContent));
const warnings = async page => (await page.consoleText()).split('\n').filter(l => /WARNING|ERROR/.test(l));

uiTest('#3780 New Project: Design and simulation only, no board, no device, no HDL; the flow left out', E, async (page) => {
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'Drawn');
  const kinds = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .wiz-main select')][1].options.length);
  assert.equal(kinds, 2);
  await page.fill('.dlg-overlay .wiz-main select', 'design', { index: 1 });
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Settings');
  // (its fields: the Top-Level Source Type alone, a drawing: no HDL)
  const settings = await page.eval(() => {
    const labels = [...document.querySelectorAll('.dlg-overlay .form-grid > label')].filter(l => l.style.display !== 'none').map(l => l.textContent);
    const top = [...document.querySelectorAll('.dlg-overlay .wiz-main select')][6];
    return { labels, top: top.value, types: [...top.options].filter(o => !o.hidden).map(o => o.value) };
  });
  assert.deepEqual(settings, { labels: ['Top-Level Source Type:'], top: 'sch', types: ['sch', 'fsm', 'asm', 'tt'] });
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Summary');
  const summary = await page.eval(() => document.querySelector('.dlg-overlay .wiz-main pre').textContent);
  assert.match(summary, /\n {2}Kind: {9}Design and simulation only \(no FPGA\)\n/);
  assert.doesNotMatch(summary, /Device|Board|Language|Synthesis/);
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'Drawn' && window.Silinx.project.top === 'top' && document.querySelector('#hier .row.top-mod'), [], { what: 'project Drawn open, its top' });
  const pj = await page.eval(() => window.Silinx.project);
  assert.deepEqual([pj.kind, pj.board, pj.constraints, pj.top], ['design', null, null, 'top']);
  const s = await shown(page);
  assert.deepEqual(s.rows.slice(0, 3), [['Drawn', []], ['Design', []], ['top', ['Schematic']]]);
  assert.ok(s.files.includes('src/top.sch.json') && !s.files.some(f => /\.(vhdl?|v|ucf)$/.test(f)), String(s.files));
  assert.ok(s.process.includes('Check Design') && !s.process.includes('Implement Top Module') && !s.process.includes('Check Syntax'), String(s.process));
  for (const absent of ['I/O Pin Planning', 'iMPACT (Configure Target Device)', 'Board Emulator', 'Implemented Design (FPGA View)']) assert.ok(!s.tools.includes(absent), absent);
  assert.ok(!s.view.includes('Design Summary'), String(s.view));
  assert.deepEqual([s.steps, s.buttons, s.kind], [['check', 'simulate'], [], 'design']);
  if (s.tasksLayout) assert.deepEqual(s.tasks, ['edit', 'sim']);
  else {
    // (the ISE style interface's process tree: the drawing's and Check Design, no Design Summary)
    await page.setView('impl');
    await page.treeRow('#hier', 'top');
    assert.deepEqual(await procs(page), ['View/Edit Schematic', 'Check Design']);
  }
  assert.deepEqual(await warnings(page), []);
});

uiTest('#3780 a design project: its HDL opened is its drawing, an HDL file added refused, New Source\'s drawings only, no language', E, async (page) => {
  await makeProject(env, { name: 'DrawnFsm', kind: 'design', files: { 'src/traffic.fsm.json': FSM }, top: 'traffic' });
  await page.openProject('DrawnFsm');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/traffic.vhd'] === 'src/traffic.fsm.json', [], { what: 'the drawing\'s HDL' });
  assert.deepEqual((await shown(page)).rows.find(r => r[0] === 'traffic'), ['traffic', ['FSM']]);
  // its HDL file opened (a message's link, a search's result): the state diagram instead
  await page.eval(async () => (await import('/js/app.js')).openFile('src/traffic.vhd', 3));
  await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/traffic.fsm.json', [], { what: 'the state diagram open' });
  assert.ok(!(await page.eval(() => window.Silinx.docs.some(d => /\.vhd$/.test(d.path || '')))), 'no HDL document');
  // an HDL file of the project folder added: refused, the MCP server's message
  await writeWs(env, 'DrawnFsm', 'src/extra.vhd', 'entity extra is end;\n');
  const added = await page.eval(async () => (await import('/js/app.js')).addToProject('src/extra.vhd'));
  assert.equal(added, false);
  await page.waitConsole(/src\/extra\.vhd: a design and simulation project has drawings only/);
  assert.ok((await warnings(page)).includes(HDL('src/extra.vhd')), String(await warnings(page)));
  assert.ok(!(await page.eval(() => window.Silinx.project.files.some(f => f.path === 'src/extra.vhd'))));
  // New Source: the drawings and the labs; no Language field
  page.eval(async () => (await import('/js/new-source.js')).newSourceWizard()).catch(() => {});
  await page.waitDialog('New Source');
  const types = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .src-types .st')].map(e => e.lastChild.textContent));
  assert.deepEqual(types, ['Boolean Algebra', 'Schematic', 'Finite State Machine (FSM)', 'Algorithmic State Machine (ASM)', 'Petri Net', 'Guided Lab']);
  await page.dialogButton('Next >');
  const labels = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .form-grid > label')].map(l => l.textContent));
  assert.deepEqual(labels, ['Source type:', 'File name:', 'Location:']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // Source Properties of the drawing: its file, no language
  page.eval(async () => (await import('/js/wizards.js')).sourceProperties('src/traffic.fsm.json')).catch(() => {});
  await page.waitDialog('Source Properties');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .form-grid > label')].map(l => l.textContent)), ['File:']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
});

uiTest('#3780 Design Properties: a board makes a design project an FPGA project, and back; refused with HDL of its own', E, async (page) => {
  await makeProject(env, { name: 'DrawnBoth', kind: 'design', files: { 'src/traffic.fsm.json': FSM }, top: 'traffic' });
  await page.openProject('DrawnBoth');
  await page.waitFor(() => window.Silinx.modules.some(m => m.name === 'traffic'), [], { what: 'its module' });
  const dialogFields = () => page.eval(() => {
    const labels = [...document.querySelectorAll('.dlg-overlay .form-grid > label')];
    const board = labels.find(l => l.textContent === 'Evaluation Development Board:').nextElementSibling;
    return { board: board.value, first: board.options[0].textContent, shown: labels.filter(l => l.style.display !== 'none').map(l => l.textContent) };
  });
  const pick = v => page.eval((b) => { const s = [...document.querySelectorAll('.dlg-overlay .form-grid > label')].find(l => l.textContent === 'Evaluation Development Board:').nextElementSibling; s.value = b; s.dispatchEvent(new Event('change')); }, v);
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  assert.deepEqual(await dialogFields(), { board: 'design', first: 'Design and simulation only (no FPGA)', shown: ['Name:', 'Evaluation Development Board:', 'Top Module (implementation):', 'Top-Level Source Type:'] });
  await pick('basys2');
  assert.ok((await dialogFields()).shown.includes('Device:'));
  await page.dialogButton('OK');
  await page.waitDialog('Update Constraints');
  await page.dialogButton('No');
  await page.waitNoDialog();
  await page.waitFor(() => !window.Silinx.project.kind && window.Silinx.project.board === 'basys2' && !document.documentElement.dataset.projectKind, [], { what: 'an FPGA project' });
  await page.waitConsole(/DrawnBoth: an FPGA project now: its HDL and its implementation shown\./);
  let s = await shown(page);
  assert.deepEqual(s.rows.find(r => r[0] === 'traffic'), ['traffic', ['FSM', 'VHDL']]);
  assert.ok(s.process.includes('Implement Top Module') && s.steps.includes('implement') && s.kind === null, JSON.stringify(s));
  assert.equal((await page.eval(() => window.Silinx.project.constraints)), 'constraints/top.ucf');
  // and back: its sources all drawings
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  await pick('design');
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project.kind === 'design' && document.documentElement.dataset.projectKind === 'design', [], { what: 'a design project again' });
  s = await shown(page);
  assert.deepEqual([s.rows.find(r => r[0] === 'traffic'), s.steps], [['traffic', ['FSM']], ['check', 'simulate']]);
  assert.deepEqual(await page.eval(() => [window.Silinx.project.board, window.Silinx.project.constraints]), [null, null]);
  assert.deepEqual(await warnings(page), []);
  // an FPGA project with an HDL source of its own: refused, the console says which
  await makeProject(env, { name: 'OwnHdl', board: 'basys2', files: { 'src/top.v': 'module top(input a, output b);\n  assign b = a;\nendmodule\n' }, top: 'top' });
  await page.openProject('OwnHdl');
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  await pick('design');
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.waitConsole(/cannot become a design and simulation project/);
  assert.deepEqual(await warnings(page), ['ERROR: the project \'OwnHdl\' cannot become a design and simulation project: its HDL and C sources are not drawings (src/top.v)']);
  assert.equal(await page.eval(() => window.Silinx.project.kind), undefined);
});

uiTest('#3780 in Portuguese: New Project\'s Project Kind, the refusal of an HDL file', E, async (page) => {
  await makeProject(env, { name: 'DrawnPt', kind: 'design', files: { 'src/traffic.fsm.json': FSM }, top: 'traffic' });
  await page.openProject('DrawnPt');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await writeWs(env, 'DrawnPt', 'src/extra.vhd', 'entity extra is end;\n');
    await page.eval(async () => (await import('/js/app.js')).addToProject('src/extra.vhd'));
    await page.waitConsole(/ERROR: src\/extra\.vhd: um projeto só de desenho e simulação tem apenas desenhos: escolha uma placa nas Propriedades do Desenho para acrescentar fontes HDL/);
    page.eval(async () => (await import('/js/wizards.js')).newProjectWizard()).catch(() => {});
    await page.waitFor(() => !!document.querySelector('.dlg-overlay .wiz-main'), [], { what: 'New Project' });
    const kind = await page.eval(() => {
      const l = [...document.querySelectorAll('.dlg-overlay .form-grid > label')].find(x => x.textContent === 'Tipo de Projeto:');
      return l && [...l.nextElementSibling.options].map(o => o.textContent);
    });
    assert.deepEqual(kind, ['Projeto para FPGA (uma placa e um dispositivo)', 'Só desenho e simulação (sem FPGA)']);
    await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].pop().click());
    await page.waitNoDialog();
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});
