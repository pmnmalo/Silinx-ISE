// UI: a drawing's HDL file linked while the drawing is open (#245). The application links it (its
// generatedFile) when a drawn source without one gets it, on the save after its errors are gone
// (adoptDrawnHdl, #207), or from Generate HDL File… (#230): the open editor takes the link alone
// (setLink), never the whole model again, so that its undo history, its selection and its view are
// kept. An edit made before the link is still undone by Undo (the link stays: the next save writes
// it), and redone by Redo. The Petri net (the link on the save that clears its errors), the
// schematic, the ASM chart and the state diagram (Generate HDL File…).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { viewHdl } from '../../core/view-hdl.js';
import { newPetri } from '../../core/petri.js';
import { newModel } from '../../core/asm.js';
import { newFsm } from '../../core/fsm.js';
import { newDoc, normalizeDoc, symbolPins } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const D = '.doc:not([hidden])';

const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)\b/.test(l));
// a project file once `ok` takes it (written by the autosave, ~0.8 s after the edit): parsed
async function untilSaved(pj, file, ok, what, timeout = 15000) {
  const t0 = Date.now();
  let text;
  for (;;) {
    try { text = await readWs(env, pj, file); const m = JSON.parse(text); if (ok(m)) return m; } catch { /* not yet */ }
    if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${file}: ${what}${text != null ? ` (last:\n${text.slice(0, 2000)})` : ''}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}
// the view of the open editor (its pan and zoom), from its viewport's transform
const view = (page, vp) => page.eval((s) => document.querySelector(s).getAttribute('transform'), `${D} ${vp}`);
// zoomed in at the middle of the drawing, as by the mouse wheel (the view then is not the fitted one)
async function zoomIn(page, canvas, vp) {
  const was = await view(page, vp);
  await page.eval((s) => {
    const svg = document.querySelector(s), r = svg.getBoundingClientRect();
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
  }, `${D} ${canvas}`);
  await page.waitFor((s, w) => document.querySelector(s).getAttribute('transform') !== w, [`${D} ${vp}`, was], { what: 'zoomed in' });
  return view(page, vp);
}
// the selected elements of the open editor: their ids
const selected = (page, sel) => page.eval((s) => [...document.querySelectorAll(s)].map((e) => e.dataset.id || e.dataset.node || e.dataset.state), `${D} ${sel}`);
const center = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, `${D} ${sel}`);
const menuOf = async (page, label) => {
  await page.treeRow('#hier', label, { right: true, exact: true });
  await page.waitFor(() => !!document.querySelector('body > .menu-popup .mi'), [], { what: 'the context menu' });
};
// Generate HDL File… of the drawing's row (its HDL file name holds something else: no question)
async function generateHdlFile(page, label, drawing, target) {
  await menuOf(page, label);
  await page.click('body > .menu-popup .mi', { text: 'Generate HDL File…' });
  await page.waitFor((t, d) => window.Silinx.hdlToSch?.[t] === d, [target, drawing], { what: `${drawing} linked to ${target}`, timeout: 15000 });
}
// a file named as the drawing's HDL, holding another module
const OTHER = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity parity is\n  port (a, b : in std_logic; p : out std_logic);\nend parity;\n\narchitecture rtl of parity is\nbegin\n  p <= a xor b;\nend rtl;\n';
const W_OTHER = (drawing, mod, kind) => `WARNING: ${drawing} has no HDL file: src/${mod}.vhd exists already and holds something else. Generate HDL File… (its right-click menu in the Design pane) writes its HDL to src/${mod}_${kind}.vhd.`;

uiTest('#245 regression, a Petri net linked to its HDL file on the save that clears its errors: the place stays selected, the view as it was, Undo undoes the edit (the link kept), Redo', E, async (page) => {
  // a place with more initial tokens than its capacity: an error, no HDL file yet
  const net = newPetri('ctl', 'vhdl');
  net.places[0].tokens = 2;
  const PN = JSON.stringify(net, null, 2);
  assert.ok(viewHdl('src/ctl.pn.json', PN).errors.length);
  await makeProject(env, { name: 'Lk_pn', top: '', files: { 'src/ctl.pn.json': PN } });
  await page.openProject('Lk_pn');
  await page.eval(() => window.SilinxApp.openFile('src/ctl.pn.json'));
  const ED = `${D} .petri-editor`;
  await page.waitFor((s) => !!document.querySelector(`${s} .pn-place[data-id=p1]`), [ED], { what: 'the Petri net editor' });
  assert.equal(await page.eval(() => window.Silinx.active.petriEditor.getModel().generatedFile ?? null), null);
  // the place idle selected, the view zoomed in; its capacity 2: no errors
  await page.click(await center(page, '.pn-place[data-id=p1] circle'));
  await page.waitFor((s) => document.querySelector(`${s} .pn-place[data-id=p1]`).classList.contains('sel'), [ED], { what: 'idle selected' });
  const zoomed = await zoomIn(page, '.pn-canvas', '.pn-world');
  const ok = await page.eval((s) => {
    const f = [...document.querySelectorAll(`${s} .asm-side .asm-field`)].find((x) => x.querySelector('.asm-label')?.textContent === 'Capacity');
    const i = f?.querySelector('input'); if (!i) return false;
    i.value = '2'; i.dispatchEvent(new Event('change', { bubbles: true })); return true;
  }, ED);
  assert.ok(ok, 'the Capacity field');
  // saved, then its HDL file made and linked (every source has its HDL, #207), the editor told
  await page.waitConsole(/src\/ctl\.vhd generated from src\/ctl\.pn\.json \(every source has its HDL\)/, { timeout: 15000 });
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/ctl.vhd'] === 'src/ctl.pn.json', [], { what: 'linked', timeout: 15000 });
  await page.waitFor(() => window.Silinx.active.petriEditor.getModel().generatedFile === 'src/ctl.vhd', [], { what: 'the editor has the link' });
  assert.equal((await untilSaved('Lk_pn', 'src/ctl.pn.json', (m) => m.generatedFile === 'src/ctl.vhd', 'linked')).places[0].capacity, 2);
  // the link shown in the editor; selection, view and history kept
  await page.waitFor((s) => /HDL: ctl\.vhd/.test(document.querySelector(`${s} .gen-banner`)?.textContent || ''), [ED], { what: 'the link shown' });
  assert.deepEqual(await selected(page, '.pn-place.sel'), ['p1']);
  assert.equal(await view(page, '.pn-world'), zoomed);
  assert.equal(await page.eval(() => window.Silinx.active.petriEditor.canUndo()), true);
  // Edit ▸ Undo: the capacity back to 1 (the error again), the link kept, saved so
  await page.menu('Edit', 'Undo');
  await page.waitFor(() => window.Silinx.active.petriEditor.getModel().places[0].capacity === 1, [], { what: 'undone' });
  assert.equal(await page.eval(() => window.Silinx.active.petriEditor.getModel().generatedFile), 'src/ctl.vhd');
  await untilSaved('Lk_pn', 'src/ctl.pn.json', (m) => m.places[0].capacity === 1 && m.generatedFile === 'src/ctl.vhd', 'the undo saved with the link');
  assert.deepEqual(await selected(page, '.pn-place.sel'), ['p1']);
  assert.equal(await view(page, '.pn-world'), zoomed);
  // Redo: capacity 2 again, still linked
  await page.menu('Edit', 'Redo');
  await page.waitFor(() => window.Silinx.active.petriEditor.getModel().places[0].capacity === 2, [], { what: 'redone' });
  await untilSaved('Lk_pn', 'src/ctl.pn.json', (m) => m.places[0].capacity === 2 && m.generatedFile === 'src/ctl.vhd', 'the redo saved with the link');
  assert.equal(await readWs(env, 'Lk_pn', 'src/ctl.vhd'), viewHdl('src/ctl.pn.json', JSON.stringify({ ...net, places: [{ ...net.places[0], capacity: 2 }, net.places[1]] })).text);
  assert.deepEqual(await warnings(page), []);
});

// a schematic: an AND gate between three ports
function gateDoc(name) {
  const doc = newDoc(name, 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'and2', x: 300, y: 100, rot: 0, mirror: false, name: 'U1', params: {} });
  symbolPins(normalizeDoc({ ...doc }).symbols[0], {}).forEach((p, i) => {
    const dir = p.name === 'O' ? 'out' : 'in', at = { x: p.x + (dir === 'in' ? -60 : 60), y: p.y };
    doc.ports.push({ id: `P${i + 1}`, name: { I0: 'a', I1: 'b', O: 'y' }[p.name], dir, width: 1, x: at.x, y: at.y });
    doc.wires.push({ id: `W${i + 1}`, points: [at, { x: p.x, y: p.y }] });
  });
  return doc;
}

uiTest('#245 regression, a schematic linked by Generate HDL File… while open: the symbol stays selected, the view as it was, Undo undoes its move (the link kept), Redo', E, async (page) => {
  const SCH = JSON.stringify(gateDoc('gate'));
  await makeProject(env, { name: 'Lk_sch', top: '', files: { 'src/gate.sch.json': SCH, 'src/gate.vhd': OTHER } });
  await page.openProject('Lk_sch');
  await page.waitFor(() => !!document.querySelector('#hier .badge.warn'), [], { what: 'the [No HDL] badge' });
  await page.eval(() => window.SilinxApp.openSch('src/gate.sch.json'));
  const SYM = '.se-svg [data-kind=sym][data-id="S1"]';
  await page.waitFor((s) => !!document.querySelector(s), [`${D} ${SYM}`], { what: 'the schematic editor' });
  const doc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  // U1 selected and moved right (a step of the grid), the view zoomed in; saved
  await page.click(`${D} ${SYM} .hitbox`);
  await page.waitFor((s) => document.querySelector(s).classList.contains('sel'), [`${D} ${SYM}`], { what: 'U1 selected' });
  const x0 = (await doc()).symbols[0].x;
  await page.key('ArrowRight');
  await page.waitFor((x) => window.Silinx.active.schEditor.getDoc().symbols[0].x > x, [x0], { what: 'U1 moved' });
  const x1 = (await doc()).symbols[0].x;
  const zoomed = await zoomIn(page, '.se-svg', '.se-vp');
  await untilSaved('Lk_sch', 'src/gate.sch.json', (m) => m.symbols[0].x === x1, 'the move saved');
  // Generate HDL File…: src/gate_sch.vhd, linked; the editor has the link, nothing else changed
  await generateHdlFile(page, 'gate', 'src/gate.sch.json', 'src/gate_sch.vhd');
  await page.waitConsole(/src\/gate_sch\.vhd generated from src\/gate\.sch\.json \(src\/gate\.vhd holds something else\)/);
  assert.equal((await doc()).generatedFile, 'src/gate_sch.vhd');
  assert.deepEqual(await selected(page, '.se-svg .sel'), ['S1']);
  assert.equal(await view(page, '.se-vp'), zoomed);
  assert.equal(await page.eval(() => window.Silinx.active.schEditor.canUndo()), true);
  // Undo (the editor's: Edit ▸ Undo undoes Generate HDL File…, the newer): U1 back, the link kept, saved so
  await page.click(`${D} button[title=Undo]`);
  await page.waitFor((x) => window.Silinx.active.schEditor.getDoc().symbols[0].x === x, [x0], { what: 'undone' });
  assert.equal((await doc()).generatedFile, 'src/gate_sch.vhd');
  await untilSaved('Lk_sch', 'src/gate.sch.json', (m) => m.symbols[0].x === x0 && m.generatedFile === 'src/gate_sch.vhd', 'the undo saved with the link');
  assert.deepEqual(await selected(page, '.se-svg .sel'), ['S1']);
  assert.equal(await view(page, '.se-vp'), zoomed);
  // Redo
  await page.click(`${D} button[title=Redo]`);
  await page.waitFor((x) => window.Silinx.active.schEditor.getDoc().symbols[0].x === x, [x1], { what: 'redone' });
  await untilSaved('Lk_sch', 'src/gate.sch.json', (m) => m.symbols[0].x === x1 && m.generatedFile === 'src/gate_sch.vhd', 'the redo saved with the link');
  assert.equal(await readWs(env, 'Lk_sch', 'src/gate.vhd'), OTHER);
  assert.deepEqual(await warnings(page), [W_OTHER('src/gate.sch.json', 'gate', 'sch')]);
});

uiTest('#245 regression, an ASM chart linked by Generate HDL File… while open: the box stays selected, the view as it was, Undo undoes its move (the link kept), Redo', E, async (page) => {
  const ASM = JSON.stringify(newModel('ctl', 'vhdl'), null, 2);
  await makeProject(env, { name: 'Lk_asm', top: '', files: { 'src/ctl.asm.json': ASM, 'src/ctl.vhd': OTHER } });
  await page.openProject('Lk_asm');
  await page.waitFor(() => !!document.querySelector('#hier .badge.warn'), [], { what: 'the [No HDL] badge' });
  await page.eval(() => window.SilinxApp.openAsm('src/ctl.asm.json'));
  await page.waitFor((s) => !!document.querySelector(s), [`${D} [data-node=s2]`], { what: 'the ASM editor' });
  const model = () => page.eval(() => window.Silinx.active.asmEditor.getModel());
  const s2 = async () => (await model()).nodes.find((n) => n.id === 's2');
  // RUN selected and moved right, the view zoomed in; saved
  await page.click(await center(page, '[data-node=s2] .asm-shape'));
  await page.waitFor((s) => document.querySelector(s).classList.contains('sel'), [`${D} [data-node=s2]`], { what: 'RUN selected' });
  const x0 = (await s2()).x;
  await page.key('ArrowRight');
  await page.waitFor((x) => window.Silinx.active.asmEditor.getModel().nodes.find((n) => n.id === 's2').x > x, [x0], { what: 'RUN moved' });
  const x1 = (await s2()).x;
  const zoomed = await zoomIn(page, '.asm-canvas', '.asm-vp');
  await untilSaved('Lk_asm', 'src/ctl.asm.json', (m) => m.nodes.find((n) => n.id === 's2').x === x1, 'the move saved');
  await generateHdlFile(page, 'ctl', 'src/ctl.asm.json', 'src/ctl_asm.vhd');
  await page.waitConsole(/src\/ctl_asm\.vhd generated from src\/ctl\.asm\.json \(src\/ctl\.vhd holds something else\)/);
  assert.equal((await model()).generatedFile, 'src/ctl_asm.vhd');
  assert.deepEqual(await selected(page, '.asm-node.sel'), ['s2']);
  assert.equal(await view(page, '.asm-vp'), zoomed);
  assert.equal(await page.eval(() => window.Silinx.active.asmEditor.canUndo()), true);
  // Undo (the editor's: Edit ▸ Undo undoes Generate HDL File…, the newer)
  await page.click(`${D} button[title=Undo]`);
  await page.waitFor((x) => window.Silinx.active.asmEditor.getModel().nodes.find((n) => n.id === 's2').x === x, [x0], { what: 'undone' });
  assert.equal((await model()).generatedFile, 'src/ctl_asm.vhd');
  await untilSaved('Lk_asm', 'src/ctl.asm.json', (m) => m.nodes.find((n) => n.id === 's2').x === x0 && m.generatedFile === 'src/ctl_asm.vhd', 'the undo saved with the link');
  assert.deepEqual(await selected(page, '.asm-node.sel'), ['s2']);
  assert.equal(await view(page, '.asm-vp'), zoomed);
  // Redo
  await page.click(`${D} button[title=Redo]`);
  await page.waitFor((x) => window.Silinx.active.asmEditor.getModel().nodes.find((n) => n.id === 's2').x === x, [x1], { what: 'redone' });
  await untilSaved('Lk_asm', 'src/ctl.asm.json', (m) => m.nodes.find((n) => n.id === 's2').x === x1 && m.generatedFile === 'src/ctl_asm.vhd', 'the redo saved with the link');
  assert.deepEqual(await warnings(page), [W_OTHER('src/ctl.asm.json', 'ctl', 'asm')]);
});

uiTest('#245 a state diagram linked by Generate HDL File… while open: the state stays selected, the view as it was, Undo undoes the edit (the link kept)', E, async (page) => {
  const FSM = JSON.stringify(newFsm('blink'), null, 2);
  await makeProject(env, { name: 'Lk_fsm', top: '', files: { 'src/blink.fsm.json': FSM, 'src/blink.vhd': OTHER } });
  await page.openProject('Lk_fsm');
  await page.waitFor(() => !!document.querySelector('#hier .badge.warn'), [], { what: 'the [No HDL] badge' });
  await page.eval(() => window.SilinxApp.openFsm('src/blink.fsm.json'));
  const ST = (id) => `.fsm-state[data-state="${id}"]`;
  await page.waitFor((s) => !!document.querySelector(s), [`${D} ${ST('s3')}`], { what: 'the state diagram editor' });
  const model = () => page.eval(() => window.Silinx.active.fsmEditor.getModel());
  const isSel = (id, what) => page.waitFor((s) => document.querySelector(s).classList.contains('sel'), [`${D} ${ST(id)}`], { what });
  // the state S2 selected, the view zoomed in; an edit: S2 deleted (Delete), saved
  await page.click(await center(page, `${ST('s3')} .fsm-circle`));
  await isSel('s3', 'S2 selected');
  const zoomed = await zoomIn(page, '.fsm-canvas', '.fsm-vp');
  await page.key('Delete');
  await page.waitFor(() => window.Silinx.active.fsmEditor.getModel().states.length === 2, [], { what: 'S2 deleted' });
  await untilSaved('Lk_fsm', 'src/blink.fsm.json', (m) => m.states.length === 2, 'the edit saved');
  // S0 selected
  await page.click(await center(page, `${ST('s1')} .fsm-circle`));
  await isSel('s1', 'S0 selected');
  await generateHdlFile(page, 'blink', 'src/blink.fsm.json', 'src/blink_fsm.vhd');
  await page.waitConsole(/src\/blink_fsm\.vhd generated from src\/blink\.fsm\.json \(src\/blink\.vhd holds something else\)/);
  assert.equal((await model()).generatedFile, 'src/blink_fsm.vhd');
  await page.waitFor((s) => /HDL: blink_fsm\.vhd/.test(document.querySelector(`${s} .gen-banner`)?.textContent || ''), [`${D} .fsm-editor`], { what: 'the link shown' });
  assert.deepEqual(await selected(page, '.fsm-state.sel'), ['s1']);
  assert.equal(await view(page, '.fsm-vp'), zoomed);
  // Undo (the editor's: Edit ▸ Undo undoes Generate HDL File…, the newer): the state back, the link kept
  await page.click(`${D} button[title=Undo]`);
  await page.waitFor(() => window.Silinx.active.fsmEditor.getModel().states.length === 3, [], { what: 'undone' });
  assert.equal((await model()).generatedFile, 'src/blink_fsm.vhd');
  await untilSaved('Lk_fsm', 'src/blink.fsm.json', (m) => m.states.length === 3 && m.generatedFile === 'src/blink_fsm.vhd', 'the undo saved with the link');
  assert.deepEqual(await selected(page, '.fsm-state.sel'), ['s1']);
  assert.equal(await view(page, '.fsm-vp'), zoomed);
  assert.deepEqual(await warnings(page), [W_OTHER('src/blink.fsm.json', 'blink', 'fsm')]);
});
