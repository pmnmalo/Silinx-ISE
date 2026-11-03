// UI: the ASM chart editor's inspector (web/js/asm-inspector.js, #405: out of mountAsmEditor), mounted alone in the
// page with an editor of its own (the model of a new chart) whose actions are recorded: nothing, several boxes, a
// state (its name, made initial), a decision (its exits swapped), a case and its exits, a connection; the machine's
// panel (its name, the reset, an input added and removed, a register list made and emptied); a model replaced (Undo).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const MOUNT = async () => {
  const { mountInspector } = await import('/js/asm-inspector.js');
  const { newModel } = await import('/core/asm.js');
  const { h } = await import('/js/dom.js');
  const selSection = h('section'), machineBody = h('div');
  document.body.append(selSection, machineBody);
  let M = newModel('fsm', 'vhdl');
  // a case box on the 2-bit input mode, with two exits
  M.inputs.push({ name: 'mode', width: 2 });
  M.nodes.push({ id: 'c1', type: 'case', x: 400, y: 100, expr: 'mode' });
  M.edges.push({ id: 'e9', from: 'c1', to: 's1', port: '00' }, { id: 'e10', from: 'c1', to: 's2', port: 'others' });
  let sel = { nodes: new Set(), edge: null };
  const commits = [], calls = [];
  const btn = (label, title, onclick, cls = '') => h('button', { type: 'button', class: `asm-btn ${cls}`, title, onclick }, label);
  const nodeById = (id) => M.nodes.find((n) => n.id === id);
  const ins = mountInspector({ M: () => M, sel: () => sel, selSection, machineBody, btn, nodeById,
    caseExits: (id) => M.edges.filter((e) => e.from === id), caseWidth: () => 2, commit: (k) => commits.push(k),
    deleteSelection: () => calls.push('deleteSelection') });
  const text = (el) => [...el.querySelectorAll('h3, .asm-label, button')].map((e) => e.textContent);
  const input = (el, label) => [...el.querySelectorAll('.asm-field')].find((f) => f.querySelector('.asm-label').textContent === label)
    .querySelector('input, textarea, select');
  const set = (el, v, ev = 'input') => { el.value = v; el.dispatchEvent(new Event(ev)); };
  window.__i = { ins, commits, calls, selSection, machineBody, text, input, set, M: () => M, setM: (m) => { M = m; },
    select: (nodes, edge = null) => { sel = { nodes: new Set(nodes), edge }; } };
  return true;
};

uiTest('#405 ASM inspector: nothing, several boxes, a state, a decision, a case and its exits, a connection', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { ins, commits, calls, selSection: S, text, input, set, M, select } = window.__i;
    const r = {};
    ins.renderInspector();
    r.none = [text(S), S.childElementCount, S.hidden];
    select(['s1', 's2']); ins.renderInspector();
    r.many = text(S);
    r.shown = S.hidden;
    S.querySelector('button').click();
    // a state: its name, its outputs, made initial
    select(['s2']); ins.renderInspector();
    r.state = text(S);
    set(input(S, 'Name'), ' WORK ');
    set(input(S, 'Moore outputs (one per line)'), 'busy = 1\n\nload = 1');
    S.querySelector('.asm-check input').click();
    r.s2 = [M().nodes.find((n) => n.id === 's2').name, M().nodes.find((n) => n.id === 's2').actions, M().initial];
    // a decision: its condition, its exits swapped
    select(['d1']); ins.renderInspector();
    set(input(S, 'Condition'), 'start && !done');
    [...S.querySelectorAll('button')].find((b) => b.textContent === 'Swap 1 / 0 exits').click();
    r.d1 = [M().nodes.find((n) => n.id === 'd1').cond, M().edges.filter((e) => e.from === 'd1').map((e) => `${e.to}:${e.port}`)];
    // a case: its exits, one changed, one deleted
    select(['c1']); ins.renderInspector();
    r.exits = [...S.querySelectorAll('.asm-case-list .asm-row')].map((row) => `${row.querySelector('input').value} ${row.querySelector('.asm-muted').textContent}`);
    set(S.querySelector('.asm-case-list input'), '01');
    S.querySelectorAll('.asm-case-list button')[1].click();
    r.c1 = M().edges.filter((e) => e.from === 'c1').map((e) => `${e.to}:${e.port}`);
    // a connection from the case: its value, its delete
    select([], 'e9'); ins.renderInspector();
    r.edge = [text(S), S.querySelector('p').textContent];
    [...S.querySelectorAll('button')].find((b) => b.textContent === 'Delete connection').click();
    r.commits = commits.splice(0);
    r.calls = calls.splice(0);
    return r;
  });
  assert.deepEqual(out.none, [[], 0, true]);   // (nothing selected: no "Selection" help, the section hidden, #2739)
  assert.equal(out.shown, false);
  assert.deepEqual(out.many, ['2 boxes selected', 'Delete selection']);
  assert.deepEqual(out.state, ['State', 'Name', 'Moore outputs (one per line)', 'Delete box']);
  assert.deepEqual(out.s2, ['WORK', ['busy = 1', 'load = 1'], 's2']);
  assert.deepEqual(out.d1, ['start && !done', ['o1:false', 's1:true']]);
  assert.deepEqual(out.exits, ['00 → IDLE', 'others → WORK']);
  assert.deepEqual(out.c1, ['s1:01']);
  assert.deepEqual(out.edge[0], ['Connection', 'Value(s) of this exit', 'Delete connection']);
  assert.equal(out.edge[1], 'From case "mode" to state IDLE.');
  assert.deepEqual(out.commits, ['name:s2', 'act:s2', 'initial', 'cond:d1', 'swap', 'lbl:e9', 'del-exit']);
  assert.deepEqual(out.calls, ['deleteSelection', 'deleteSelection']);
});

uiTest('#405 ASM inspector: the machine (name, reset, an input added and removed, registers), a model replaced', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { ins, commits, machineBody: B, input, set, M, setM, select } = window.__i;
    const r = {};
    ins.renderMachine();
    r.tables = [...B.querySelectorAll('.asm-ports-head .asm-label')].map((e) => e.textContent);
    r.inputs = [...B.querySelectorAll('table.ins tbody tr')].map((tr) => tr.querySelector('input').value);
    set(input(B, 'Module / entity name'), ' ctl ');
    set(input(B, 'Reset type'), 'sync', 'change');
    set(input(B, 'Initial state'), 's3', 'change');
    r.machine = [M().name, M().reset.sync, M().initial];
    // + input: a fresh name; then removed
    [...B.querySelectorAll('.asm-ports-head button')][0].click();
    r.added = M().inputs.map((p) => p.name);
    [...B.querySelectorAll('table.ins tbody tr')].pop().querySelector('.asm-x').click();
    r.removed = M().inputs.length;
    // + register: the list made; removed: the list gone (an old chart unchanged)
    [...B.querySelectorAll('.asm-ports-head button')][2].click();
    r.regs = M().registers.map((x) => `${x.name}:${x.width}:${x.init}`);
    B.querySelector('table.regs tbody .asm-x').click();
    r.noRegs = 'registers' in M();
    r.commits = commits.splice(0);
    // the model replaced (Undo): the panels show the new one
    const m2 = JSON.parse(JSON.stringify(M())); m2.name = 'other'; m2.nodes.find((n) => n.id === 's1').name = 'START';
    setM(m2);
    ins.renderMachine();
    select(['s1']); ins.renderInspector();
    r.replaced = [input(B, 'Module / entity name').value, window.__i.input(window.__i.selSection, 'Name').value];
    return r;
  });
  assert.deepEqual(out.tables, ['Inputs', 'Outputs', 'Registers', 'Generics']);
  assert.deepEqual(out.inputs, ['start', 'done', 'mode']);
  assert.deepEqual(out.machine, ['ctl', true, 's3']);
  assert.deepEqual(out.added, ['start', 'done', 'mode', 'in3']);
  assert.equal(out.removed, 3);
  assert.deepEqual(out.regs, ['r0:8:0']);
  assert.equal(out.noRegs, false);
  assert.deepEqual(out.commits, ['m-name', 'm-sync', 'm-init', 'ins-add', 'p-del', 'regs-add', 'r-del']);
  assert.deepEqual(out.replaced, ['other', 'START']);
});
