// UI: the FSM editor's side panel (web/js/fsm-side.js, #405: out of mountFsmEditor), mounted alone in the page with
// an editor of its own (the model of a new diagram) whose actions are recorded: nothing selected, a state (its name, its
// Moore outputs and their errors, its code, made initial, its transitions, one opened), a transition (its condition, its
// priority moved, its target, outputs given to it: the machine Mealy, #2728), a selection gone; the machine (its name, a port added
// and removed, the reset, the description).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const MOUNT = async () => {
  const { mountSide } = await import('/js/fsm-side.js');
  const { newFsm, fsmEncoding, fsmKind } = await import('/core/fsm.js');
  const { h } = await import('/js/ui.js');
  const selSection = h('section'), machineBody = h('div');
  document.body.append(selSection, machineBody);
  const M = newFsm('fsm');
  let sel = null;
  const commits = [], calls = [];
  const side = mountSide({ M: () => M, sel: () => sel, setSel: (s) => { sel = s; }, selSection, machineBody,
    btn: (label, title, onclick, cls = '') => h('button', { type: 'button', class: `asm-btn ${cls}`, title, onclick }, label),
    stateById: (id) => M.states.find((s) => s.id === id), transById: (id) => M.transitions.find((t) => t.id === id),
    encOf: () => new Map(fsmEncoding(M).map((e) => [e.id, e])), commit: (k) => commits.push(k ?? ''), deleteSelection: () => calls.push('delete'),
    render: () => calls.push('render'), updateToolbar: () => calls.push('toolbar') });
  const field = (root, label) => [...root.querySelectorAll('.asm-field')].find((f) => f.querySelector('.asm-label').textContent === label)
    .querySelector('input, select, textarea');
  const set = (el, v, ev = 'input') => { el.value = v; el.dispatchEvent(new Event(ev)); };
  window.__s = { fsmKind, side, M, commits, calls, selSection, machineBody, field, set, sel: () => sel, select: (s) => { sel = s; } };
  return true;
};

uiTest('#405 FSM side panel: nothing, a state (name, outputs, code, initial, its transitions), a transition (condition, priority, target)', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { fsmKind, side, M, commits, calls, selSection: S, field, set, sel, select } = window.__s;
    const r = {};
    side.renderSide();
    r.none = [S.querySelector('h3').textContent, calls.splice(0)];
    // the state S1: renamed, its outputs (an error shown, then valid), made initial
    select({ type: 'state', id: 's2' }); side.renderSide();
    r.state = [S.querySelector('h3').textContent, S.querySelector('.asm-muted').textContent, [...S.querySelectorAll('.fsm-tlist li')].map((li) => li.textContent)];
    set(field(S, 'Name'), ' MID ');
    set(field(S, 'Outputs (Moore)'), 'z=');
    r.err = S.querySelector('.c-err').textContent !== '';
    set(field(S, 'Outputs (Moore)'), 'z=1');
    S.querySelector('.fsm-initial').click();
    r.s2 = [M.states[1].name, M.states[1].outputs, M.initial, S.querySelector('.c-err').textContent];
    // its first transition opened
    S.querySelector('.fsm-tlist li').click();
    r.opened = [sel(), S.querySelector('h3').textContent, calls.splice(0)];
    // the transition: its condition, made later (after !x), its target, outputs: the Moore machine made Mealy (#2728)
    set(field(S, 'Condition'), ' x && y ');
    r.prio = S.querySelectorAll('.asm-label')[0] ? [...S.querySelectorAll('div.asm-label')].map((d) => d.textContent) : null;
    [...S.querySelectorAll('button')].find((b) => b.textContent === '▼ Later').click();
    r.order = M.transitions.filter((t) => t.from === 's2').map((t) => t.id);
    r.prio2 = [...S.querySelectorAll('div.asm-label')].map((d) => d.textContent);
    set(field(S, 'To'), 's2', 'change');
    r.t3 = [M.transitions.find((t) => t.id === 't3').cond, M.transitions.find((t) => t.id === 't3').to, field(S, 'Outputs (Mealy)').disabled, fsmKind(M)];
    set(field(S, 'Outputs (Mealy)'), 'z=1');
    r.mealy = [M.transitions.find((t) => t.id === 't3').outputs, fsmKind(M), S.querySelectorAll('.asm-fhint')[1].textContent];
    // a selection whose transition is gone: nothing
    M.transitions = M.transitions.filter((t) => t.id !== 't3'); side.renderSide();
    r.gone = [sel(), S.querySelector('h3').textContent];
    r.commits = commits.splice(0);
    return r;
  });
  assert.deepEqual(out.none, ['Selection', ['toolbar']]);
  assert.deepEqual(out.state, ['State', 'Code: 01 (binary)', ['x → S2', '!x → S0']]);
  assert.equal(out.err, true);
  assert.deepEqual(out.s2, ['MID', { z: '1' }, 's2', '']);
  assert.deepEqual(out.opened, [{ type: 'trans', id: 't3' }, 'Transition', ['toolbar', 'render', 'toolbar']]);   // (the state's panel, then the transition's)
  assert.deepEqual(out.prio, ['Priority 1 of 2 in MID']);
  assert.deepEqual(out.order, ['t4', 't3']);
  assert.deepEqual(out.prio2, ['Priority 2 of 2 in MID']);
  assert.deepEqual(out.t3, ['x && y', 's2', false, 'moore']);
  assert.deepEqual(out.mealy, [{ z: '1' }, 'mealy', 'Outputs while this transition is taken: output=value, separated by commas (they make the machine a Mealy machine).']);
  assert.deepEqual(out.gone, [null, 'Selection']);
  assert.deepEqual(out.commits, ['sname', 'souts', '', 'cond', '', '', 'touts']);
});

uiTest('#405 FSM side panel: the machine (its name, a port added and removed, the reset, the description)', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { side, M, commits, machineBody: B, field, set } = window.__s;
    const r = {};
    side.renderSide();
    set(field(B, 'Module name'), ' ctl ');
    B.querySelector('.fsm-add-in').click();
    B.querySelector('.fsm-add-out').click();
    r.ports = [M.inputs.map((p) => p.name), M.outputs.map((p) => `${p.name}=${p.default}`)];
    B.querySelector('.fsm-inputs .asm-x').click();
    r.removed = M.inputs.map((p) => p.name);
    set(field(B, 'Reset level'), 'low', 'change');
    set(field(B, 'Description'), '  counts  ', 'change');
    r.machine = [M.name, M.reset.active, M.description];
    set(field(B, 'Description'), ' ', 'change');
    r.noDesc = 'description' in M;
    r.commits = commits.splice(0);
    return r;
  });
  assert.deepEqual(out.ports, [['x', 'x1'], ['z=0', 'z1=0']]);
  assert.deepEqual(out.removed, ['x1']);
  assert.deepEqual(out.machine, ['ctl', 'low', 'counts']);
  assert.equal(out.noDesc, false);
  assert.deepEqual(out.commits, ['name', '', '', '', '', '', '']);
});
