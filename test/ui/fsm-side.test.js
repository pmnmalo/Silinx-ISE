// UI: the FSM editor's side panel (web/js/fsm-side.js, #405: out of mountFsmEditor), mounted alone in the page with
// an editor of its own (the model of a new diagram) whose actions are recorded: nothing selected, a state (its name, its
// Moore outputs, its code, made initial, its transitions, one opened), a transition (its condition, its
// priority moved, its target, outputs given to it: the machine Mealy, #2728), a selection gone; the machine (its name, a port added
// and removed, the reset, the description). A state's and a transition's outputs: a table of the machine's outputs (#3814:
// name and width read-only, a value set, cleared, refused with its message in the console, following an output renamed
// or removed; in Portuguese).
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
  const commits = [], calls = [], msgs = [];
  const side = mountSide({ M: () => M, sel: () => sel, setSel: (s) => { sel = s; }, selSection, machineBody,
    btn: (label, title, onclick, cls = '') => h('button', { type: 'button', class: `asm-btn ${cls}`, title, onclick }, label),
    stateById: (id) => M.states.find((s) => s.id === id), transById: (id) => M.transitions.find((t) => t.id === id),
    encOf: () => new Map(fsmEncoding(M).map((e) => [e.id, e])), commit: (k) => commits.push(k ?? ''), deleteSelection: () => calls.push('delete'),
    render: () => calls.push('render'), updateToolbar: () => calls.push('toolbar'), flash: (m) => msgs.push(m) });
  const field = (root, label) => [...root.querySelectorAll('.asm-field')].find((f) => f.querySelector('.asm-label').textContent === label)
    .querySelector('input, select, textarea');
  const set = (el, v, ev = 'input') => { el.value = v; el.dispatchEvent(new Event(ev)); };
  window.__s = { fsmKind, side, M, commits, calls, msgs, selSection, machineBody, field, set, sel: () => sel, select: (s) => { sel = s; } };
  return true;
};

uiTest('#405 FSM side panel: nothing, a state (name, outputs, code, initial, its transitions), a transition (condition, priority, target)', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { fsmKind, side, M, commits, calls, selSection: S, field, set, sel, select } = window.__s;
    const r = {};
    side.renderSide();
    r.none = [S.hidden, S.childElementCount, calls.splice(0)];
    // the state S1: renamed, its outputs (an error shown, then valid), made initial
    select({ type: 'state', id: 's2' }); side.renderSide();
    r.state = [S.querySelector('h3').textContent, S.querySelector('.asm-muted').textContent, [...S.querySelectorAll('.fsm-tlist li')].map((li) => li.textContent)];
    set(field(S, 'Name'), ' MID ');
    set(field(S, 'Outputs (Moore)'), '2');
    r.err = [field(S, 'Outputs (Moore)').classList.contains('bad'), M.states[1].outputs];
    set(field(S, 'Outputs (Moore)'), '1');
    S.querySelector('.fsm-initial').click();
    r.s2 = [M.states[1].name, M.states[1].outputs, M.initial, field(S, 'Outputs (Moore)').classList.contains('bad')];
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
    set(field(S, 'Outputs (Mealy)'), '1');
    r.mealy = [M.transitions.find((t) => t.id === 't3').outputs, fsmKind(M), S.querySelectorAll('.asm-fhint')[1].textContent];
    // a selection whose transition is gone: nothing
    M.transitions = M.transitions.filter((t) => t.id !== 't3'); side.renderSide();
    r.gone = [sel(), S.hidden, S.childElementCount];
    r.commits = commits.splice(0);
    return r;
  });
  assert.deepEqual(out.none, [true, 0, ['toolbar']]);   // (nothing selected: no section, #2729)
  assert.deepEqual(out.state, ['State', 'Code: 01 (binary)', ['x → S2', '!x → S0']]);
  assert.deepEqual(out.err, [true, {}]);
  assert.deepEqual(out.s2, ['MID', { z: '1' }, 's2', false]);
  assert.deepEqual(out.opened, [{ type: 'trans', id: 't3' }, 'Transition', ['toolbar', 'render', 'toolbar']]);   // (the state's panel, then the transition's)
  assert.deepEqual(out.prio, ['Priority 1 of 2 in MID']);
  assert.deepEqual(out.order, ['t4', 't3']);
  assert.deepEqual(out.prio2, ['Priority 2 of 2 in MID']);
  assert.deepEqual(out.t3, ['x && y', 's2', false, 'moore']);
  assert.deepEqual(out.mealy, [{ z: '1' }, 'mealy', 'The value of each output while this transition is taken (empty: the state\'s value; a value makes the machine a Mealy machine).']);
  assert.deepEqual(out.gone, [null, true, 0]);
  assert.deepEqual(out.commits, ['sname', 'souts:z', '', 'cond', '', '', 'touts:z']);
});

uiTest('#3814 FSM side panel: a state\'s and a transition\'s outputs, a table of the machine\'s (name, width read-only; a value set, cleared, refused in the console; an output renamed, removed), in Portuguese', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(async () => {
    const { side, M, commits, msgs, selSection: S, machineBody: B, set, select } = window.__s;
    const r = {};
    M.outputs = [{ name: 'z', width: 1, default: '0' }, { name: 'y', width: 2, default: "2'b01" }];
    M.states[1].outputs = { y: '2' };
    const table = () => [...S.querySelectorAll('.fsm-outvals tr')].map((tr) => [...tr.children].map((c) => {
      const i = c.querySelector('input');
      return i ? `[${i.value}|${i.placeholder}]` : c.textContent;
    }));
    const val = (key, n) => S.querySelector(`input[data-key="${key}:${n}"]`);
    const hint = () => S.querySelector('.fsm-outvals').closest('.asm-field').querySelector('.asm-fhint').textContent;
    // the state S1: every output, its name and width as text (not fields), its value
    select({ type: 'state', id: 's2' }); side.renderSide();
    r.state = [table(), S.querySelectorAll('.fsm-outvals td:not(:last-child) input').length, hint()];
    // y: 3 set; z: 1 set; y cleared (its default: left out)
    set(val('souts', 'y'), '3'); set(val('souts', 'z'), ' 1 '); r.set = { ...M.states[1].outputs };
    set(val('souts', 'y'), ''); r.cleared = { ...M.states[1].outputs };
    // refused as it is typed (marked, nothing changed, nothing said yet); left: said in the console, the value in force again
    set(val('souts', 'y'), '4');
    r.typed = [val('souts', 'y').classList.contains('bad'), { ...M.states[1].outputs }, msgs.length];
    set(val('souts', 'y'), '4', 'change');
    r.left = [val('souts', 'y').classList.contains('bad'), val('souts', 'y').value, msgs.splice(0)];
    set(val('souts', 'z'), 'x'); set(val('souts', 'z'), 'x', 'change');
    r.notConst = [val('souts', 'z').value, msgs.splice(0), { ...M.states[1].outputs }];
    // the transition S1 → S2: the same table; an empty value stands for the state's (z: 1) or the default (y)
    select({ type: 'trans', id: 't3' }); side.renderSide();
    r.trans = [table(), hint()];
    set(val('touts', 'y'), '3'); r.mealy = { ...M.transitions.find((t) => t.id === 't3').outputs };
    set(val('touts', 'y'), "3'b100"); set(val('touts', 'y'), "3'b100", 'change');
    r.transMsg = [msgs.splice(0), val('touts', 'y').value];
    set(val('touts', 'z'), '0'); set(val('touts', 'z'), ''); r.transCleared = { ...M.transitions.find((t) => t.id === 't3').outputs };
    // y renamed w in the machine's Properties (its values follow), then z removed (its values gone)
    select(null); side.renderSide();
    const name = [...B.querySelectorAll('.fsm-outputs .asm-table tr')][2].querySelector('input');
    set(name, 'w'); set(name, 'w', 'change');
    B.querySelectorAll('.fsm-outputs .asm-x')[0].click();
    select({ type: 'state', id: 's2' }); side.renderSide();
    r.renamed = [table(), { ...M.states[1].outputs }, { ...M.transitions.find((t) => t.id === 't3').outputs }];
    // no outputs: said
    M.outputs = []; side.renderSide();
    r.none = [S.querySelector('.fsm-outvals'), S.querySelector('.fsm-noouts')?.textContent];
    r.commits = commits.splice(0);
    M.outputs = [{ name: 'z', width: 1, default: '0' }];
    return r;
  });
  assert.deepEqual(out.state, [[['Name', 'Width', 'Value'], ['z', '1', '[|0]'], ['y', '2', "[2|2'b01]"]], 0, 'The value of each output while in this state (empty: its default value).']);
  assert.deepEqual(out.set, { y: '3', z: '1' });
  assert.deepEqual(out.cleared, { z: '1' });
  assert.deepEqual(out.typed, [true, { z: '1' }, 0]);
  assert.deepEqual(out.left, [false, '', ['State S1: the value 4 of y does not fit in 2 bit(s)']]);
  assert.deepEqual(out.notConst, ['1', ["State S1: the value 'x' of z must be a constant (e.g. 0, 1, 4'b1010, 5)"], { z: '1' }]);
  assert.deepEqual(out.trans, [[['Name', 'Width', 'Value'], ['z', '1', '[|1]'], ['y', '2', "[|2'b01]"]],
    'The value of each output while this transition is taken (empty: the state\'s value; a value makes the machine a Mealy machine).']);
  assert.deepEqual(out.mealy, { y: '3' });
  assert.deepEqual(out.transMsg, [["Transition S1 → S2: the value 3'b100 of y does not fit in 2 bit(s)"], '3']);
  assert.deepEqual(out.transCleared, { y: '3' });
  assert.deepEqual(out.renamed, [[['Name', 'Width', 'Value'], ['w', '2', "[|2'b01]"]], {}, { w: '3' }]);
  assert.deepEqual(out.none, [null, 'The machine has no outputs']);
  assert.deepEqual(out.commits, ['souts:y', 'souts:z', 'souts:y', 'touts:y', 'touts:z', 'touts:z', 'pout1', 'pout1', '']);
  // in Portuguese: the headers, the label, the hints
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    const pt = await page.eval(async () => {
      const { side, M, selSection: S, select } = window.__s;
      const tick = () => new Promise((ok) => setTimeout(ok, 0));   // (the translation's observer)
      const field = () => S.querySelector('.fsm-outvals').closest('.asm-field');
      select({ type: 'state', id: 's2' }); side.renderSide(); await tick();
      const r = [[...S.querySelectorAll('.fsm-outvals th')].map((th) => th.textContent), field().querySelector('.asm-label').textContent, field().querySelector('.asm-fhint').textContent];
      select({ type: 'trans', id: 't3' }); side.renderSide(); await tick();
      r.push(field().querySelector('.asm-label').textContent, field().querySelector('.asm-fhint').textContent);
      M.outputs = []; side.renderSide(); await tick();
      r.push(S.querySelector('.fsm-noouts').textContent);
      M.outputs = [{ name: 'z', width: 1, default: '0' }];
      return r;
    });
    assert.deepEqual(pt, [['Nome', 'Largura', 'Valor'], 'Saídas (Moore)', 'O valor de cada saída neste estado (vazio: o seu valor por omissão).',
      'Saídas (Mealy)', 'O valor de cada saída enquanto esta transição é tomada (vazio: o valor do estado; um valor faz da máquina uma máquina de Mealy).', 'A máquina não tem saídas']);
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
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
