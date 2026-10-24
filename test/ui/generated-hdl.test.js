// UI: only a source's main type is editable (#1176). The HDL file generated from a drawing (a schematic here, the
// example gates) opens read-only: typed text, Tab, a paste or a template change nothing; its bar says it is
// generated from the drawing and links to it, without Undo / Redo or Templates ▾ (Find and Check Syntax kept); its
// right-click menu has no editing commands (Copy, Select All, Find…, Check Syntax and Open Schematic kept); an edit of
// the schematic still reaches it. A module written in HDL stays editable, and becomes read-only when it is converted
// to a schematic while its editor is open. The same in the Tasks interface. The truth table's, the state
// diagram's and the Petri net's HDL: truthtable.test.js, drawings-tt.test.js, fsm.test.js, petri.test.js.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const D = '.doc:not([hidden])';

const INV = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity inv is\n  port (a : in std_logic; y : out std_logic);\nend inv;\n\narchitecture rtl of inv is\nbegin\n  y <= not a;\nend rtl;\n';

const banner = (page) => page.eval((d) => { const b = document.querySelector(`${d} [data-sync-banner]`); return b && !b.hidden ? b.textContent : null; }, D);
// the bar's buttons shown (their titles), in order
const barButtons = (page) => page.eval((d) => [...document.querySelectorAll(`${d} .editor-bar button`)].filter((b) => !b.hidden).map((b) => b.title), D);
// the labels of the editor's right-click menu
async function editorMenu(page) {
  const at = await page.eval((d) => { const r = document.querySelector(`${d} .cm-editor`).getBoundingClientRect(); return { x: r.left + 80, y: r.top + 40 }; }, D);
  await page.click(at, { button: 'right' });
  const m = await page.waitFor(() => { const l = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => i.textContent.trim()); return l.length ? l : null; }, [], { what: 'the context menu' });
  await page.closeMenus();
  return m;
}
// typed text, Tab, a paste, a template and a comment toggled: the editor's text before and after
async function tryEdits(page) {
  const before = await page.eval(() => window.Silinx.active.editor.getValue());
  await page.click(`${D} .cm-content`);
  await page.type('-- typed\n');
  await page.key('Tab');
  await page.key('Backspace');
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.replaceSelection('pasted'); ed.insertText('template'); ed.exec('toggleComment'); });
  return [before, await page.eval(() => window.Silinx.active.editor.getValue())];
}

uiTest('#1176 the HDL generated from a schematic opens read-only: nothing typed reaches it, the bar links to the schematic, no editing commands; it follows an edit of the schematic', E, async (page) => {
  await makeProject(env, { name: 'GenRo', template: 'gates' });
  await page.openProject('GenRo');
  const shipped = await readWs(env, 'GenRo', 'src/gates.vhd');
  await page.eval(() => window.SilinxApp.openFile('src/gates.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/gates.vhd' && window.Silinx.active.editor, [], { what: 'the HDL editor' });
  assert.equal(await page.eval(() => window.Silinx.active.editor.readOnly()), true);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .cm-content`).getAttribute('aria-readonly'), D), 'true');

  // the bar: read-only, generated from the schematic; Find and Check Syntax, no Undo / Redo / Templates ▾
  assert.equal(await banner(page), 'Read-only, generated from gates.sch.json');
  assert.deepEqual(await barButtons(page), ['Find (Ctrl+F)', 'Check Syntax of this file']);

  // nothing typed reaches it, nor the file
  const [was, now] = await tryEdits(page);
  assert.equal(now, was);
  assert.equal(was, shipped);
  assert.equal(!!(await page.eval(() => window.Silinx.active.dirty)), false);
  await new Promise((r) => setTimeout(r, 1000));   // (an autosave would have written by now)
  assert.equal(await readWs(env, 'GenRo', 'src/gates.vhd'), shipped);
  // F2 (Rename Symbol) and Ctrl+. (Quick Fix) do nothing
  await page.key('F2');
  await page.key('.', { modifiers: process.platform === 'darwin' ? 4 : 2 });
  assert.equal(await page.dialogCount(), 0);
  assert.equal(await page.eval(() => document.querySelectorAll('body > .menu-popup').length), 0);

  // its right-click menu: no Undo, Cut, Paste, Toggle Comment, Rename Symbol, Quick Fix, templates
  assert.deepEqual(await editorMenu(page), ['Copy', 'Select All', 'Find…', 'Check Syntax', 'Open Schematic']);

  // an edit of the schematic (its description, a comment of the HDL) reaches it, shown by the open editor
  await page.click(`${D} [data-sync-banner] a`);
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/gates.sch.json' && window.Silinx.active.schEditor, [], { what: 'the schematic opened by the link' });
  await page.waitFor((d) => document.querySelector(`${d} .se-props textarea`), [D], { what: 'the sheet properties' });
  await page.fill(`${D} .se-props textarea`, 'A new description.');
  await page.waitFor(async () => /^-- A new description\.$/m.test(await (await fetch('/api/projects/GenRo/file?path=src%2Fgates.vhd')).text()), [], { what: 'the HDL regenerated', timeout: 15000 });
  await page.eval(() => window.SilinxApp.openFile('src/gates.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/gates.vhd' && /^-- A new description\.$/m.test(window.Silinx.active.editor.getValue()), [], { what: 'the open editor updated' });
  assert.equal(await page.eval(() => window.Silinx.active.editor.getValue()), await readWs(env, 'GenRo', 'src/gates.vhd'));
  assert.equal(await page.eval(() => window.Silinx.active.editor.readOnly()), true);
  assert.equal(!!(await page.eval(() => window.Silinx.active.dirty)), false);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

uiTest('#1176 a module written in HDL stays editable; converted to a schematic while open, its editor becomes read-only', E, async (page) => {
  await makeProject(env, { name: 'HdlRw', top: 'inv', files: { 'src/inv.vhd': INV } });
  await page.openProject('HdlRw');
  await page.eval(() => window.SilinxApp.openFile('src/inv.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/inv.vhd' && window.Silinx.active.editor, [], { what: 'the HDL editor' });
  assert.equal(await page.eval(() => window.Silinx.active.editor.readOnly()), false);
  assert.equal(await banner(page), null);
  assert.deepEqual(await barButtons(page), ['Undo', 'Redo', 'Find (Ctrl+F)', 'Language Templates', 'Check Syntax of this file']);
  assert.deepEqual(await editorMenu(page), ['Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Select All', 'Toggle Comment', 'Find…', 'Rename Symbol…F2', 'Quick Fix…Ctrl+.',
    'Language Templates▸', 'Device Primitives▸', 'Instantiate module▸', 'Check Syntax']);
  // typed, then saved
  await page.click(`${D} .cm-content`);
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.focus(); ed.setCursor({ line: 0, ch: 0 }); });
  await page.type('-- mine\n');
  assert.ok((await page.eval(() => window.Silinx.active.editor.getValue())).startsWith('-- mine\n'));
  await page.waitFor(async () => (await (await fetch('/api/projects/HdlRw/file?path=src%2Finv.vhd')).text()).startsWith('-- mine\n'), [], { what: 'saved', timeout: 15000 });

  // converted to a schematic, its editor open: read-only now, its bar so
  await page.treeRow('#hier', 'inv', { right: true, exact: true });
  await page.click('body > .menu-popup .mi', { text: 'Convert to Schematic (editable)…' });
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/inv.vhd'] === 'src/inv.sch.json' && window.Silinx.active?.id === 'sch:src/inv.sch.json', [], { what: 'converted, linked, open', timeout: 20000 });
  await page.eval(() => window.SilinxApp.openFile('src/inv.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/inv.vhd' && window.Silinx.active.editor.readOnly(), [], { what: 'the HDL editor read-only' });
  assert.equal(await banner(page), 'Read-only, generated from inv.sch.json');
  assert.deepEqual(await barButtons(page), ['Find (Ctrl+F)', 'Check Syntax of this file']);
  assert.equal(await page.eval(() => window.Silinx.active.editor.getValue()), await readWs(env, 'HdlRw', 'src/inv.vhd'));
  const [was, now] = await tryEdits(page);
  assert.equal(now, was);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

uiTest('#1176 Tasks interface: the HDL generated from a schematic is read-only there too, the bar linking to the schematic', E, async (page) => {
  await makeProject(env, { name: 'GenTasks', template: 'gates' });
  const ui = await page.eval(() => localStorage.getItem('silinx.ui'));
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  try {
    await page.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked && document.documentElement.dataset.layout === 'tasks', [], { what: 'the Tasks interface' });
    await page.openProject('GenTasks');
    await page.eval(() => window.SilinxApp.openFile('src/gates.vhd'));
    await page.waitFor(() => window.Silinx.active?.id === 'file:src/gates.vhd' && window.Silinx.active.editor, [], { what: 'the HDL editor' });
    assert.equal(await page.eval(() => window.Silinx.active.editor.readOnly()), true);
    assert.equal(await banner(page), 'Read-only, generated from gates.sch.json');
    assert.deepEqual(await barButtons(page), ['Find (Ctrl+F)', 'Check Syntax of this file']);
    const [was, now] = await tryEdits(page);
    assert.equal(now, was);
    await page.click(`${D} [data-sync-banner] a`);
    await page.waitFor(() => window.Silinx.active?.id === 'sch:src/gates.sch.json', [], { what: 'the schematic opened by the link' });
  } finally {
    await page.eval((u) => { if (u) localStorage.setItem('silinx.ui', u); else localStorage.removeItem('silinx.ui'); }, ui);
    await page.reload();
    await page.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  }
});
