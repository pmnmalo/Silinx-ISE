// UI: the FSM editor while Try it is open (#3793): the diagram locked as a read-only one is. A state not moved, an arrow
// not bent, no transition drawn, no state added by a double-click, nothing edited in place; Delete, Cut, Paste, Undo
// and the toolbar's State, Delete, Arrange, Encoding and Coding Style disabled; a state or a transition still selected,
// its properties shown with their fields disabled and their buttons hidden; the simulation still stepped, the view
// zoomed. Try it closed: all of it again.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { normalizeFsm } from '../../core/fsm.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .fsm-editor';

// A (initial) --x--> B (z=1) --!x--> A, C alone
const machine = () => normalizeFsm({
  name: 'lk', inputs: [{ name: 'x', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }],
  states: [{ id: 'a', name: 'A', x: 120, y: 160, outputs: {} }, { id: 'b', name: 'B', x: 360, y: 160, outputs: { z: '1' } },
    { id: 'c', name: 'C', x: 360, y: 360, outputs: {} }],
  transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'x' }, { id: 't2', from: 'b', to: 'a', cond: '!x', bend: 40 }], initial: 'a',
});
const statePos = (page, id) => page.eval((ed, sid) => {
  const b = document.querySelector(`${ed} [data-state="${sid}"] .fsm-circle`).getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 };
}, ED, id);
const model = (page) => page.eval(() => window.Silinx.active.fsmEditor.getModel());
const shape = (m) => JSON.stringify([m.states, m.transitions]);
// the toolbar's tools that change the diagram: State, Delete, the ⋮ menu's Arrange, Encoding and Coding Style
const tools = (page) => page.eval((ed) => {
  const r = document.querySelector(ed);
  const menu = [...r.querySelectorAll('.asm-toolbar button')].filter((b) => b.textContent === 'Arrange' || b.dataset.value !== undefined);
  return { state: r.querySelector('.fsm-ico-state').closest('button').disabled, del: r.querySelector('[data-act=delete]').disabled,
    menu: [...new Set(menu.map((b) => b.disabled))] };
}, ED);

uiTest('#3793 FSM editor: the diagram locked while Try it is open, unlocked when it is closed', E, async (page) => {
  await makeProject(env, { name: 'FsmLk', files: { 'src/lk.fsm.json': JSON.stringify(machine(), null, 2) } });
  await page.openProject('FsmLk');
  await page.eval(() => window.SilinxApp.openFsm('src/lk.fsm.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/lk.fsm.json' && window.Silinx.active.fsmEditor?.fitted(), [], { what: 'the editor, fitted' });
  assert.deepEqual(await tools(page), { state: false, del: true, menu: [false] });

  // ---- Try it opened: the diagram locked
  await page.click(`${ED} .fsm-tab-btn`, { text: 'Try it' });
  await page.waitForSelector(`${ED} .fsm-sim`);
  await page.waitFor(() => window.Silinx.active.fsmEditor.fitted(), [], { what: 'fitted again' });
  await new Promise((r) => setTimeout(r, 300));   // (the fit after the panel opened)
  const before0 = shape(await model(page));
  assert.deepEqual(await tools(page), { state: true, del: true, menu: [true] });
  // a state dragged by its middle, from its rim to another state, an arrow's label dragged, a double-click on the
  // background and on a state: nothing changed, nothing to type in
  let b = await statePos(page, 'b');
  const c = await statePos(page, 'c');
  await page.drag({ x: b.x, y: b.y }, { x: b.x + 80, y: b.y + 60 });
  b = await statePos(page, 'b');
  await page.drag({ x: b.x, y: b.y + b.r - 3 }, { x: c.x, y: c.y });
  const lab = await page.eval((ed) => { const r = document.querySelector(`${ed} [data-trans=t2] .fsm-label`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, ED);
  await page.drag(lab, { x: lab.x, y: lab.y + 70 });
  await page.dblclick({ x: c.x + 150, y: c.y });
  await page.dblclick({ x: c.x, y: c.y });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await page.eval((ed) => !!document.querySelector(`${ed} .fsm-inline`), ED), false, 'nothing typed in place');
  assert.equal(shape(await model(page)), before0, 'the diagram as it was');
  // a state selected: its properties shown, their fields disabled, their buttons hidden; Delete, Backspace, F2, Cut,
  // Paste and Undo do nothing
  await page.click(`${ED} [data-state=b] .fsm-circle`);
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-sname`), [ED], { what: 'B selected' });
  const side = () => page.eval((ed) => {
    const s = document.querySelector(`${ed} .fsm-selection`);
    return { h: s.querySelector('h3').textContent, fields: [...new Set([...s.querySelectorAll('input, select')].map((x) => x.disabled))],
      buttons: [...s.querySelectorAll('button')].filter((x) => !x.hidden).length };
  }, ED);
  assert.deepEqual(await side(), { h: 'State', fields: [true], buttons: 0 });
  for (const k of ['Delete', 'Backspace', 'F2']) await page.key(k);
  const ed = () => page.eval(() => { const e = window.Silinx.active.fsmEditor; return [e.canDelete(), e.canPaste(), e.canUndo(), e.canRedo()]; });
  assert.deepEqual(await ed(), [false, false, false, false]);
  await page.eval(() => { const e = window.Silinx.active.fsmEditor; e.cut(); e.deleteSelection(); e.undo(); });
  await page.click(`${ED} [data-trans=t1] .fsm-label`);
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-cond`), [ED], { what: 't1 selected' });
  assert.deepEqual(await side(), { h: 'Transition', fields: [true], buttons: 0 });
  assert.equal(await page.eval((ed) => !!document.querySelector(`${ed} .fsm-inline`), ED), false);
  assert.equal(shape(await model(page)), before0, 'the diagram as it was');
  // the simulation still steps: x = 1, Clock ↑ to B
  await page.click(`${ED} .fsm-bit[data-input=x]`);
  await page.click(`${ED} .fsm-sim-step`);
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-sim-state`)?.textContent === 'B', [ED], { what: 'the simulation in B' });

  // ---- Try it closed: unlocked
  await page.click(`${ED} .fsm-tab-btn`, { text: 'Try it' });
  await page.waitFor((ed) => !document.querySelector(`${ed} .fsm-sim`), [ED], { what: 'Try it closed' });
  assert.deepEqual(await side(), { h: 'Transition', fields: [false], buttons: 3 });   // (▲ Earlier, ▼ Later, Straighten: no Delete button, #3882)
  assert.deepEqual(await tools(page), { state: false, del: false, menu: [false] });
  await page.waitFor(() => window.Silinx.active.fsmEditor.fitted(), [], { what: 'fitted' });
  await new Promise((r) => setTimeout(r, 300));
  b = await statePos(page, 'b');
  await page.drag({ x: b.x, y: b.y }, { x: b.x + 80, y: b.y + 60 });
  const m = await model(page);
  assert.notEqual(m.states.find((s) => s.id === 'b').x, machine().states[1].x, 'B moved');
  assert.deepEqual(await ed(), [true, false, true, false]);
});
