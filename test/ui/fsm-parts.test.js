// UI: the parts of the state diagram editor (#405: out of mountFsmEditor in web/js/fsm-editor.js), on a Mealy machine
// opened in the editor: the view (fsm-view.js: Fit, the zooms, Arrange), the history (fsm-history.js: a change undone
// and redone, the toolbar's buttons following), the inline editing (fsm-inline.js: a state renamed in place, Escape
// cancelling), the pointer and keys (fsm-pointer.js: a state selected, moved, Escape, Delete) and the bottom panel
// (fsm-bottom.js: the tables, the HDL, the simulation's clock edge). The editor's whole use: test/ui/fsm.test.js.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { normalizeFsm } from '../../core/fsm.js';

const ACT = { Fit: 'fit', '+': 'zin', '−': 'zout' };
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .fsm-editor';

uiTest('#405 FSM editor parts: the view, the history, the inline editing, the pointer and keys, the bottom panel', E, async (page) => {
  const m0 = normalizeFsm({
    name: 'pri', type: 'mealy', inputs: [{ name: 'x', width: 1 }, { name: 'y', width: 1 }], outputs: [{ name: 'z', width: 1 }],
    states: [{ id: 'a', name: 'A', x: 100, y: 100 }, { id: 'b', name: 'B', x: 300, y: 100 }, { id: 'c', name: 'C', x: 300, y: 300 }],
    transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'x' }, { id: 't2', from: 'a', to: 'c', cond: '!x & y' },
      { id: 't3', from: 'b', to: 'a', cond: '' }, { id: 't4', from: 'c', to: 'a', cond: '', outputs: { z: '1' } }], initial: 'a',
  });
  await makeProject(env, { name: 'FsmParts', files: { 'src/pri.fsm.json': JSON.stringify(m0, null, 2) } });
  await page.openProject('FsmParts');
  await page.eval(() => window.SilinxApp.openFsm('src/pri.fsm.json'));
  await page.waitFor((ed) => window.Silinx.active?.id === 'fsm:src/pri.fsm.json' && document.querySelector(`${ed} [data-trans=t1] .fsm-label`), [ED], { what: 'FSM editor' });
  await new Promise((r) => setTimeout(r, 300));   // (the fit when it opened)
  const model = () => page.eval(() => window.Silinx.active.fsmEditor.getModel());
  const tool = async (label) => (label === 'Arrange' && await page.click(`${ED} .tb-more-btn`), /^[↶↷]$/.test(label) ? page.click(`#toolbar [data-cmd=${label === '↶' ? 'undo' : 'redo'}]`) : (ACT[label] ? page.click(`${ED} [data-act=${ACT[label]}]`) : page.click(`${ED} .asm-toolbar .asm-btn`, { text: label })));
  const zoom = () => page.eval((ed) => document.querySelector(`${ed} .asm-zoom`).textContent, ED);
  const scale = () => page.eval((ed) => parseFloat(/scale\(([\d.]+)\)/.exec(document.querySelector(`${ed} .fsm-vp`).getAttribute('transform'))[1]), ED);
  const undoState = () => page.eval(() => { const e = window.Silinx.active.fsmEditor; return [!e.canUndo(), !e.canRedo()]; }, ED);
  const statePos = (id) => page.eval((ed, sid) => { const b = document.querySelector(`${ed} [data-state="${sid}"] .fsm-circle`).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, ED, id);
  // ---- the view: Fit, + and −, the label following the scale
  await tool('Fit');
  const k = await scale();
  assert.equal(await zoom(), `${Math.round(k * 100)}%`);
  await tool('+');
  assert.equal(await zoom(), `${Math.round(k * 125)}%`);
  await tool('Fit');
  // ---- the history: nothing to undo; Arrange moves the states (one change), undone and redone
  assert.deepEqual(await undoState(), [true, true]);
  const xy = (m) => m.states.map((s) => `${s.id}:${s.x},${s.y}`).join(' ');
  const before0 = xy(await model());
  await tool('Arrange');
  const arranged = xy(await model());
  assert.notEqual(arranged, before0);
  assert.deepEqual(await undoState(), [false, true]);
  await tool('↶');
  assert.equal(xy(await model()), before0);
  assert.deepEqual(await undoState(), [true, false]);
  await tool('↷');
  assert.equal(xy(await model()), arranged);
  await tool('↶');
  // ---- the pointer: a click selects B (its side panel), a drag moves it, Escape deselects
  await page.click(await statePos('b'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-state="b"]`).classList.contains('sel'), [ED], { what: 'B selected' });
  const p = await statePos('b');
  await page.drag(p, { x: p.x + 60, y: p.y + 40 });
  const b1 = (await model()).states.find((s) => s.id === 'b');
  assert.ok(b1.x > 300 && b1.y > 100, `${b1.x},${b1.y}`);
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(`${ed} [data-state="b"]`).classList.contains('sel'), [ED], { what: 'B no longer selected' });
  // ---- the inline editing: a double click on C, renamed; a double click on A, Escape: unchanged
  // (the double click as its event on the state: the pointer's two clicks in a row miss it in the test's browser, on main too)
  const dbl = (id) => page.eval((ed, sid) => { const c = document.querySelector(`${ed} [data-state="${sid}"] .fsm-circle`); const b = c.getBoundingClientRect();
    c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 })); }, ED, id);
  await dbl('c');
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-inline`), [ED], { what: 'the inline editor' });
  await page.eval((ed) => { const i = document.querySelector(`${ed} .fsm-inline`); i.value = 'C2'; }, ED);
  await page.key('Enter');
  await page.waitFor((ed) => !document.querySelector(`${ed} .fsm-inline`), [ED], { what: 'applied' });
  assert.equal((await model()).states.find((s) => s.id === 'c').name, 'C2');
  await dbl('a');
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-inline`), [ED], { what: 'the inline editor on A' });
  await page.eval((ed) => { document.querySelector(`${ed} .fsm-inline`).value = 'NOPE'; }, ED);
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(`${ed} .fsm-inline`), [ED], { what: 'cancelled' });
  assert.equal((await model()).states.find((s) => s.id === 'a').name, 'A');
  // ---- the keys: B selected, Delete: B and its transitions gone; undone
  await page.click(await statePos('b'));
  await page.key('Delete');
  assert.deepEqual((await model()).states.map((s) => s.name), ['A', 'C2']);
  await tool('↶');
  assert.deepEqual((await model()).states.map((s) => s.name), ['A', 'B', 'C2']);
  // ---- the bottom panel: the tables, the HDL, the simulation (x = 1, a clock edge: A -> B)
  await page.click(`${ED} .fsm-tab-btn`, { text: 'Tables' });
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-stable`), [ED], { what: 'the tables' });
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-tables .fsm-table`)].map((t) => t.className), ED), ['fsm-table fsm-ttable', 'fsm-table fsm-stable', 'fsm-table fsm-etable']);
  await page.click(`${ED} .fsm-tab-btn`, { text: 'Simulate' });
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-sim-state`), [ED], { what: 'the simulation' });
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .fsm-sim-state`).textContent, ED), /A/);
  await page.click(`${ED} .fsm-sim-inputs .fsm-bit`);
  await page.click(`${ED} .asm-btn`, { text: 'Clock ↑' });
  await page.waitFor((ed) => /B/.test(document.querySelector(`${ed} .fsm-sim-state`).textContent), [ED], { what: 'A -> B on a clock edge with x = 1' });
});
