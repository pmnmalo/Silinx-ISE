// UI: Undo / Redo of everything (web/js/history.js and the editors' own histories): the project's
// commands (Convert to Schematic, Rename, Remove from Project, Design Properties, Delete Folder…)
// through Edit ▸ Undo / Redo, and the edits of every editor (text, schematic, truth table, pin
// planner) through the same Edit menu.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const INV = `library ieee; use ieee.std_logic_1164.all;
entity inv is port (a : in std_logic; y : out std_logic); end inv;
architecture rtl of inv is begin y <= not a; end rtl;
`;
const TOP = `library ieee; use ieee.std_logic_1164.all;
entity top is port (sw : in std_logic; led : out std_logic); end top;
architecture rtl of top is begin
  u_inv : entity work.inv port map (a => sw, y => led);
end rtl;
`;
const exists = (pj, p) => fs.access(path.join(env.server.workspace, pj, p)).then(() => true, () => false);
const editMenu = async (page) => { const m = (await page.openMenu('Edit')).map((i) => i.label); await page.closeMenus(); return m; };

uiTest('Undo / Redo: Convert to Schematic (the schematic file and its link go and come back, the HDL as written by hand)', E, async (page) => {
  await makeProject(env, { name: 'UndoSch', files: { 'src/top.vhd': TOP, 'src/inv.vhd': INV }, top: 'top' });
  await page.openProject('UndoSch');
  await page.treeRow('#hier', 'u_inv - inv', { right: true });
  await page.click('body > .menu-popup .mi', { text: 'Convert to Schematic (editable)…' });
  // (the conversion ends with its schematic open, after the link: the next file is opened once it is,
  // else the schematic opened late takes the editor area from it, #232)
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/inv.vhd'] === 'src/inv.sch.json' && window.Silinx.active?.id === 'sch:src/inv.sch.json', [], { what: 'converted, linked, its schematic open', timeout: 15000 });
  const linkedHdl = await readWs(env, 'UndoSch', 'src/inv.vhd');
  const schematic = await readWs(env, 'UndoSch', 'src/inv.sch.json');
  // Edit ▸ Undo: no schematic, the HDL as it was written by hand
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd');
  assert.ok((await editMenu(page)).includes('Undo Convert to Schematic (editable)'), (await editMenu(page)).join(' | '));
  await page.menu('Edit', 'Undo Convert to Schematic (editable)');
  await page.waitFor(() => !window.Silinx.hdlToSch?.['src/inv.vhd'], [], { what: 'conversion undone' });
  assert.equal(await exists('UndoSch', 'src/inv.sch.json'), false);
  assert.equal(await readWs(env, 'UndoSch', 'src/inv.vhd'), INV);
  await page.waitConsole(/Undo: Convert to Schematic \(editable\)\./);
  // Redo: the schematic and its link come back
  await page.menu('Edit', 'Redo Convert to Schematic (editable)');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/inv.vhd'] === 'src/inv.sch.json', [], { what: 'redo: linked again' });
  assert.equal(await readWs(env, 'UndoSch', 'src/inv.sch.json'), schematic);
  assert.equal(await readWs(env, 'UndoSch', 'src/inv.vhd'), linkedHdl);
  // Undo once more
  await page.menu('Edit', 'Undo Convert to Schematic (editable)');
  await page.waitFor(() => !window.Silinx.hdlToSch?.['src/inv.vhd'], [], { what: 'undone again' });
  assert.equal(await exists('UndoSch', 'src/inv.sch.json'), false);
  assert.equal(await readWs(env, 'UndoSch', 'src/inv.vhd'), INV);
});

uiTest('Undo / Redo: Rename (module and file, the instances), Design Properties, Delete Folder; the open editor follows', E, async (page) => {
  await makeProject(env, { name: 'UndoRen', files: { 'src/top.vhd': TOP, 'src/inv.vhd': INV, 'extra/notes.txt': 'keep me\n' }, top: 'top' });
  await page.openProject('UndoRen');
  await page.eval(() => window.SilinxApp.openFile('src/inv.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/inv.vhd');
  // Rename the module inv -> neg (the file follows)
  await page.treeRow('#hier', 'u_inv - inv', { right: true });
  await page.click('body > .menu-popup .mi', { text: 'Rename…' });
  await page.waitDialog('Rename');
  await page.fill('.dlg-overlay .form-grid input[type=text]', 'neg', { index: 0 });
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/neg.vhd'), [], { what: 'renamed' });
  assert.match(await readWs(env, 'UndoRen', 'src/top.vhd'), /entity work\.neg/);
  await page.menu('Edit', 'Undo Rename');
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/inv.vhd') && !window.Silinx.project.files.some((f) => f.path === 'src/neg.vhd'), [], { what: 'undo rename' });
  assert.equal(await readWs(env, 'UndoRen', 'src/top.vhd'), TOP);
  assert.equal(await readWs(env, 'UndoRen', 'src/inv.vhd'), INV);
  assert.equal(await exists('UndoRen', 'src/neg.vhd'), false);
  await page.waitFor(() => [...document.querySelectorAll('#hier .lbl')].some((e) => e.textContent === 'u_inv - inv'), [], { what: 'hierarchy back' });
  await page.menu('Edit', 'Redo Rename');
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/neg.vhd'), [], { what: 'redo rename' });
  assert.match(await readWs(env, 'UndoRen', 'src/top.vhd'), /entity work\.neg/);
  await page.menu('Edit', 'Undo Rename');
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/inv.vhd'), [], { what: 'undo again' });
  // Design Properties: the board
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  await page.fill('.dlg-overlay select', 'basys2', { index: 0 });
  await page.dialogButton('OK');
  // (the constraints are board specific: not regenerated here)
  await page.waitDialog('Update Constraints');
  await page.dialogButton('No');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project.board === 'basys2', [], { what: 'board set' });
  await page.menu('Edit', 'Undo Design Properties');
  await page.waitFor(() => !window.Silinx.project.board, [], { what: 'undo design properties' });
  // Delete Folder (Files view): the folder and its file come back
  await page.eval(() => window.SilinxApp.showLeftPage('files'));
  const folderRow = (d) => page.waitFor((x) => { const i = [...document.querySelectorAll('#files-page tr')].findIndex((r) => r.dataset.folder === x); return i >= 0 ? i + 1 : 0; }, [d], { what: `folder row ${d}` }).then((i) => i - 1);
  await page.rightClick('#files-page tr', { index: await folderRow('extra') });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Delete Folder…' });
  await page.waitDialog('Delete Folder');
  await page.dialogButton('Yes');
  await page.waitFor(async () => !(await (await fetch('/api/projects/UndoRen')).json()).fileTree.includes('extra/notes.txt'), [], { what: 'folder deleted' });
  assert.equal(await exists('UndoRen', 'extra/notes.txt'), false);
  await page.menu('Edit', 'Undo Delete Folder');
  await page.waitFor(async () => (await (await fetch('/api/projects/UndoRen')).json()).fileTree.includes('extra/notes.txt'), [], { what: 'folder back' });
  assert.equal(await readWs(env, 'UndoRen', 'extra/notes.txt'), 'keep me\n');
});

// #534: an edit typed while a project command's tail still runs (a Rename reloads the project after its files
// are moved) is the user's: Edit ▸ Undo is the editor's, not the command's. The command here changes nothing and
// takes a while; on the code before, the edit made while it ran was not counted and the menu said "Undo Slow command".
uiTest('Edit ▸ Undo: an edit typed while a project command still runs is the user\'s (the editor\'s Undo first)', E, async (page) => {
  await makeProject(env, { name: 'UndoBusy', files: { 'src/top.vhd': TOP, 'src/inv.vhd': INV }, top: 'top', board: 'basys2' });
  await page.openProject('UndoBusy');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd' && window.Silinx.active.editor);
  await page.eval(async () => {
    window.__slowDone = false;
    (await import('/js/ui.js')).runAction('Slow command', () => new Promise((r) => setTimeout(r, 5000))).then(() => { window.__slowDone = true; });
  });
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.focus(); ed.setCursor({ line: 0, ch: 0 }); });
  await page.type('-- y\n');
  await page.waitFor(() => window.Silinx.active.editor.getValue().startsWith('-- y\n'), [], { what: 'typed' });
  assert.equal(await page.eval(() => window.__slowDone), false, 'the command still runs (the machine too slow for this test?)');
  const menu = await editMenu(page);
  assert.ok(menu.includes('Undo'), `the editor's Undo while the command runs: ${menu.join(' | ')}`);
  await page.menu('Edit', 'Undo');
  await page.waitFor(() => window.Silinx.active.editor.getValue().startsWith('library'), [], { what: 'text undo' });
  await page.waitFor(() => window.__slowDone === true, [], { what: 'the command over' });
  // the command changed nothing: there is nothing of the project to undo or redo, the editor's Redo is first
  assert.ok((await editMenu(page)).includes('Redo'), 'the editor\'s Redo');
  await page.menu('Edit', 'Redo');
  await page.waitFor(() => window.Silinx.active.editor.getValue().startsWith('-- y\n'), [], { what: 'text redo' });
});

uiTest('Edit ▸ Undo / Redo reach every editor: text, truth table, pin planner (and a newer edit comes before a project command)', E, async (page) => {
  await makeProject(env, { name: 'UndoEd', files: { 'src/top.vhd': TOP, 'src/inv.vhd': INV }, top: 'top', board: 'basys2' });
  await page.openProject('UndoEd');
  // a project command, then an edit in the text editor: Undo undoes the edit first
  await page.eval(() => window.SilinxApp.showLeftPage('files'));
  const row = (f) => page.eval((x) => [...document.querySelectorAll('#files-page tr')].findIndex((r) => r.cells[0]?.textContent === x), f);
  await page.rightClick('#files-page tr', { index: await row('src/inv.vhd') });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Rename…' });
  await page.waitDialog('Rename');
  await page.fill('.dlg-overlay .form-grid input[type=text]', 'src/inv_r.vhd', { index: 1 });   // (the file; the entity keeps its name)
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/inv_r.vhd'));
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd' && window.Silinx.active.editor);
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.focus(); ed.setCursor({ line: 0, ch: 0 }); });
  await page.type('-- x\n');
  await page.waitFor(() => window.Silinx.active.editor.getValue().startsWith('-- x\n'), [], { what: 'typed' });
  assert.ok((await editMenu(page)).includes('Undo'), 'the editor\'s Undo first');
  await page.menu('Edit', 'Undo');
  await page.waitFor(() => window.Silinx.active.editor.getValue().startsWith('library'), [], { what: 'text undo' });
  await page.menu('Edit', 'Redo');
  await page.waitFor(() => window.Silinx.active.editor.getValue().startsWith('-- x\n'), [], { what: 'text redo' });
  await page.menu('Edit', 'Undo');
  await page.waitFor(() => window.Silinx.active.editor.getValue().startsWith('library'));
  // truth table: a cell clicked, Edit ▸ Undo / Redo
  await page.menu('Tools', 'Boolean Algebra / Karnaugh Map…');
  await page.waitDialog('New Source');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'maj');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  const T = '.doc:not([hidden]) .tt-editor';
  await page.waitFor((t) => !!document.querySelector(t), [T], { what: 'truth table' });
  const col = () => page.eval((t) => [...document.querySelectorAll(`${t} .tt-cell[data-out=f]`)].map((c) => c.textContent).join(''), T);
  const before0 = await col();
  await page.click(`${T} .tt-cell[data-out=f][data-row="3"]`);
  assert.notEqual(await col(), before0);
  await page.menu('Edit', 'Undo');
  await page.waitFor(async (t, b) => [...document.querySelectorAll(`${t} .tt-cell[data-out=f]`)].map((c) => c.textContent).join('') === b, [T, before0], { what: 'table undo' });
  await page.menu('Edit', 'Redo');
  await page.waitFor(async (t, b) => [...document.querySelectorAll(`${t} .tt-cell[data-out=f]`)].map((c) => c.textContent).join('') !== b, [T, before0], { what: 'table redo' });
  // the table's own buttons
  await page.click(`#toolbar [data-cmd=undo]`);
  assert.equal(await col(), before0);
  // pin planner: a LOC typed, Edit ▸ Undo
  await page.eval(() => window.SilinxApp.openPinPlanner('top'));
  await page.waitFor(() => !!document.querySelector('.doc:not([hidden]) .pin-planner input'), [], { what: 'pin planner' });
  const P = '.doc:not([hidden]) .pin-planner';
  const loc = () => page.eval((p) => document.querySelector(`${p} input`).value, P);
  const was = await loc();
  await page.fill(`${P} input`, 'P11');
  await page.eval((p) => document.querySelector(`${p} input`).dispatchEvent(new Event('change', { bubbles: true })), P);
  await page.waitFor((p) => document.querySelector(`${p} input`).value === 'P11', [P]);
  await page.menu('Edit', 'Undo');
  await page.waitFor((p, w) => document.querySelector(`${p} input`).value === w, [P, was], { what: 'pin planner undo' });
  await page.menu('Edit', 'Redo');
  await page.waitFor((p) => document.querySelector(`${p} input`).value === 'P11', [P], { what: 'pin planner redo' });
});

uiTest('a schematic alone in the project (#177) gets its HDL file when the project is opened (#207): in the hierarchy with both views, Set as Top Module, Undo', E, async (page) => {
  const { newDoc, normalizeDoc, symbolPins } = await import('../../core/schdoc.js');
  const { viewHdl } = await import('../../core/view-hdl.js');
  const doc = newDoc('gate', 'vhdl');
  const s = { id: 'S1', type: 'and2', x: 300, y: 100, rot: 0, mirror: false, name: 'U1', params: {} };
  doc.symbols.push(s);
  const pins = symbolPins(normalizeDoc({ ...doc }).symbols[0], {});
  pins.forEach((p, i) => {
    const dir = p.name === 'O' ? 'out' : 'in', at = { x: p.x + (dir === 'in' ? -60 : 60), y: p.y };
    doc.ports.push({ id: `P${i + 1}`, name: { I0: 'a', I1: 'b', O: 'y' }[p.name], dir, width: 1, x: at.x, y: at.y });
    doc.wires.push({ id: `W${i + 1}`, points: [at, { x: p.x, y: p.y }] });
  });
  await makeProject(env, { name: 'SchTop', files: { 'src/gate.sch.json': JSON.stringify(doc) }, top: '' });
  await page.openProject('SchTop');
  await page.waitConsole(/src\/gate\.vhd generated from src\/gate\.sch\.json \(every source has its HDL\)/);
  // the hierarchy: the module gate, drawn (its schematic's icon, the file in brackets), its HDL and schematic badges
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((r) => r.querySelector('.lbl')?.textContent === 'gate' && /gate\.sch\.json/.test(r.textContent) && r.querySelectorAll('.badge').length === 2), [], { what: 'gate, a module of the project' });
  assert.equal(JSON.parse(await readWs(env, 'SchTop', 'src/gate.sch.json')).generatedFile, 'src/gate.vhd');
  assert.equal(await readWs(env, 'SchTop', 'src/gate.vhd'), viewHdl('src/gate.sch.json', JSON.stringify(doc)).text);
  await page.treeRow('#hier', 'gate', { right: true, exact: true });
  const items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi .lbl')].map((e) => e.textContent));
  assert.ok(items.includes('Set as Top Module'), items.join(' | '));
  await page.click('body > .menu-popup .mi', { text: 'Set as Top Module' });
  await page.waitFor(() => window.Silinx.project.top === 'gate', [], { what: 'gate is the top', timeout: 15000 });
  await page.waitConsole(/Top-level module set to 'gate'\./);
  // it simulates and elaborates as its HDL file
  assert.ok(await page.eval(() => window.Silinx.modules.some((m) => m.name === 'gate' && m.file === 'src/gate.vhd')));
  // one Undo: no top
  await page.menu('Edit', 'Undo Set as Top Module');
  await page.waitFor(() => !window.Silinx.project.top, [], { what: 'undone' });
  // the Project menu does it too, for the schematic selected in the hierarchy
  await page.treeRow('#hier', 'gate', { exact: true });
  await page.menu('Project', 'Set as Top Module');
  await page.waitFor(() => window.Silinx.project.top === 'gate', [], { what: 'top from the Project menu', timeout: 15000 });
});
