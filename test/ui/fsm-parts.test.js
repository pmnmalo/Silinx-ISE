// UI: the parts of the state diagram editor (#405: out of mountFsmEditor in web/js/fsm-editor.js), on a Mealy machine
// opened in the editor: the view (fsm-view.js: Fit, the zooms, Arrange), the history (fsm-history.js: a change undone
// and redone, the toolbar's buttons following), the inline editing (fsm-inline.js: a state renamed in place, Escape
// cancelling, a condition edited, opened by the pointer's double click, #3459), the pointer and keys (fsm-pointer.js: a state selected, moved, Escape, Delete) and the bottom panel
// (fsm-bottom.js: the tables, the HDL, the simulation's clock edge). The editor's whole use: test/ui/fsm.test.js.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { normalizeFsm } from '../../core/fsm.js';
import { generateFsm } from '../../core/fsm-hdl.js';

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
  // (#2589: the toolbar's Undo follows the editor at once, opened without a click: it was greyed out until the next click
  // or second, and an Undo clicked meanwhile was lost)
  assert.equal(await page.eval(async () => { await window.SilinxApp.openFsm('src/pri.fsm.json'); return document.querySelector('#toolbar [data-cmd=undo]').disabled; }), false);
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
  // ---- the inline editing: a double click on C, renamed (in its HDL too); a double click on A, Escape: unchanged; a
  // double click on a transition's label, its condition edited (#3459: the pointer's two presses, as a mouse does them:
  // the first one drew the state again and the browser's dblclick missed it, nothing opened)
  const dbl = async (id) => page.dblclick(await statePos(id));
  const inline = () => page.eval((ed) => document.querySelector(`${ed} .fsm-inline`)?.value ?? null, ED);
  await dbl('c');
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-inline`), [ED], { what: 'the inline editor' });
  assert.equal(await inline(), 'C');
  await page.eval((ed) => { const i = document.querySelector(`${ed} .fsm-inline`); i.value = 'C2'; }, ED);
  await page.key('Enter');
  await page.waitFor((ed) => !document.querySelector(`${ed} .fsm-inline`), [ED], { what: 'applied' });
  assert.deepEqual((await model()).states.map((s) => s.name), ['A', 'B', 'C2']);   // (no state added by the double click)
  assert.match(await page.eval((ed) => document.querySelector(`${ed} [data-state="c"] .fsm-name`).textContent, ED), /^C2$/);
  assert.match(generateFsm(await model(), 'vhdl').code, /\bC2\b/);
  assert.match(generateFsm(await model(), 'verilog').code, /\bC2\b/);
  await dbl('a');
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-inline`), [ED], { what: 'the inline editor on A' });
  await page.eval((ed) => { document.querySelector(`${ed} .fsm-inline`).value = 'NOPE'; }, ED);
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(`${ed} .fsm-inline`), [ED], { what: 'cancelled' });
  assert.equal((await model()).states.find((s) => s.id === 'a').name, 'A');
  const label = (id) => page.eval((ed, tid) => { const b = document.querySelector(`${ed} [data-trans="${tid}"] .fsm-label`).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, ED, id);
  await page.dblclick(await label('t4'));
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-inline`), [ED], { what: 'the inline editor on t4' });
  assert.equal(await inline(), ' / z=1');
  await page.eval((ed) => { document.querySelector(`${ed} .fsm-inline`).value = 'y / z=1'; }, ED);
  await page.key('Enter');
  await page.waitFor((ed) => !document.querySelector(`${ed} .fsm-inline`), [ED], { what: 'the condition applied' });
  assert.equal((await model()).transitions.find((t) => t.id === 't4').cond, 'y');
  await tool('↶');
  assert.equal((await model()).transitions.find((t) => t.id === 't4').cond, '');
  assert.deepEqual(page.console.filter((c) => /^(warn|warning|error)$/.test(c.type)).map((c) => c.text), []);
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
  await page.click(`${ED} .fsm-tab-btn`, { text: 'Try it' });
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-sim-state`), [ED], { what: 'the simulation' });
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .fsm-sim-state`).textContent, ED), /A/);
  await page.click(`${ED} .fsm-sim-inputs .fsm-bit`);
  await page.click(`${ED} .asm-btn`, { text: 'Clock ↑' });
  await page.waitFor((ed) => /B/.test(document.querySelector(`${ed} .fsm-sim-state`).textContent), [ED], { what: 'A -> B on a clock edge with x = 1' });
});
