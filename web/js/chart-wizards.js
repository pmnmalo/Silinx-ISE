// The FSM and ASM wizards (#2082), New Source ▸ 'Finite State Machine (FSM)' / 'Algorithmic State Machine (ASM)' ▸
// Wizard >: the name, language and location (not shown from New Source) -> the inputs and outputs (the Petri Net
// Wizard's table), the clock and the reset -> the states (an FSM's transitions too) -> summary; it creates the chart
// with them (core/chart-wizard.js) and opens it in its editor, where the outputs and the decisions are drawn.
import { api } from './api.js';
import { icons } from './icons.js';
import { h, alertDlg, toast } from './ui.js';
import { fsmFromSpec, asmFromSpec } from '/core/chart-wizard.js';
import { validateFsm } from '/core/fsm.js';
import { validate as validateAsm } from '/core/asm.js';
import { identError } from '/core/modgen.js';
import { reservedError } from '/core/reserved.js';
import { wizard, field, select, replaceGuard, closeBeforeReplace } from './wizards.js';
import { namePage, portEditor } from './modwizard.js';
import { S, app } from './app.js';
import { portText, namedPages } from './wizard-util.js';

// the page of the inputs and outputs, the clock and the reset (the Petri Net Wizard's)
function ioPage(p1, extra = []) {
  const ports = [];
  const pe = portEditor(ports, { lang: p1.lang, dirs: ['in', 'out'], quickAdd: false });
  const clkIn = h('input', { type: 'text', class: 'cw-clock', value: 'clk', style: { width: '100px' } });
  const rstIn = h('input', { type: 'text', class: 'cw-reset', value: 'rst', style: { width: '100px' } });
  const page = {
    title: 'Inputs and Outputs',
    render: () => h('div', {}, pe.node,
      h('div', { class: 'form-grid', style: { marginTop: '10px' } },
        ...field('Clock:', clkIn), ...field('Reset (asynchronous, to the initial state):', rstIn), ...extra)),
    validate: () => {
      const err = pe.check(p1.name());
      if (err) return err;
      const r = reservedError(clkIn.value.trim()) || reservedError(rstIn.value.trim());
      if (r) return `${r}: choose another name.`;
      // the clock, the reset and the ports: names of their own (as the Petri net's, core/petri.js)
      const seen = new Map();
      for (const [n, what] of [[clkIn.value.trim(), 'the clock'], [rstIn.value.trim(), 'the reset'], ...ports.map(p => [p.name, p.dir === 'in' ? 'input' : 'output'])]) {
        const k = n.toLowerCase();
        if (seen.has(k)) return `'${n}' is used twice (${seen.get(k)} and ${what})`;
        seen.set(k, what);
      }
      return null;
    },
  };
  return { page, ports, clock: () => clkIn.value.trim(), reset: () => rstIn.value.trim() };
}

// the table of the states: their names, the first the initial (reset) state; onChange(old, name): a state renamed
// (name undefined: removed)
function statesTable(states, onChange = () => {}) {
  const tbl = h('table', { class: 'grid cw-states' });
  const render = () => {
    tbl.innerHTML = '';
    tbl.append(h('tr', {}, h('th', {}, 'State'), h('th', {}, '')));
    states.forEach((s, k) => {
      const nm = h('input', { type: 'text', class: 'cw-sname', value: s, style: { width: '140px' } });
      nm.addEventListener('input', () => { const old = states[k]; states[k] = nm.value.trim(); onChange(old, states[k]); });
      const del = h('button', { class: 'tb-btn cw-sdel', html: icons.remove, title: 'Remove', onclick: () => { const [old] = states.splice(k, 1); render(); onChange(old); } });
      tbl.append(h('tr', {}, h('td', {}, nm, k === 0 ? h('span', { class: 'hint', style: { marginLeft: '6px' } }, '(initial)') : ''), h('td', {}, del)));
    });
  };
  const addBtn = h('button', { class: 'btn cw-sadd', onclick: () => {
    let k = states.length;
    while (states.some(s => s.toLowerCase() === `s${k}`)) k++;
    states.push(`S${k}`); render(); onChange(null, states[states.length - 1]);
    tbl.querySelectorAll('.cw-sname')[states.length - 1]?.select();
  } }, 'Add State');
  render();
  const node = h('div', {},
    h('div', { style: { maxHeight: '200px', overflow: 'auto', border: '1px solid var(--frame)' } }, tbl),
    h('div', { style: { marginTop: '6px' } }, addBtn));
  const check = lang => {
    if (!states.length) return 'Add at least one state.';
    for (const s of states) { const e = identError(s, lang); if (e) return `State '${s}': ${e}.`; }
    const seen = new Set();
    for (const s of states) { if (seen.has(s.toLowerCase())) return `Two states are named '${s}'.`; seen.add(s.toLowerCase()); }
    return null;
  };
  return { node, render, check };
}

// the table of an FSM's transitions: from, to, condition (empty: always), in priority order
function transitionsTable(states, transitions) {
  const tbl = h('table', { class: 'grid cw-trans' });
  const render = () => {
    tbl.innerHTML = '';
    tbl.append(h('tr', {}, h('th', {}, 'From'), h('th', {}, 'To'), h('th', { title: 'Empty: always' }, 'Condition'), h('th', {}, '')));
    const opts = states.filter(Boolean).map(s => [s, s]);
    transitions.forEach((t, k) => {
      const from = select(opts, t.from), to = select(opts, t.to);
      from.classList.add('cw-tfrom'); to.classList.add('cw-tto');
      from.setAttribute('data-no-i18n', ''); to.setAttribute('data-no-i18n', '');
      const cond = h('input', { type: 'text', class: 'cw-tcond', value: t.cond, placeholder: 'always', spellcheck: 'false', style: { width: '100%', boxSizing: 'border-box' } });
      from.addEventListener('change', () => { t.from = from.value; });
      to.addEventListener('change', () => { t.to = to.value; });
      cond.addEventListener('input', () => { t.cond = cond.value.trim(); });
      const del = h('button', { class: 'tb-btn cw-tdel', html: icons.remove, title: 'Remove', onclick: () => { transitions.splice(k, 1); render(); } });
      tbl.append(h('tr', {}, h('td', {}, from), h('td', {}, to), h('td', { style: { width: '100%' } }, cond), h('td', {}, del)));
    });
    if (!transitions.length) tbl.append(h('tr', {}, h('td', { colspan: 4, class: 'hint', style: { padding: '8px' } }, 'No transitions yet: use Add Transition, or draw them in the editor.')));
  };
  const addBtn = h('button', { class: 'btn cw-tadd', onclick: () => {
    const names = states.filter(Boolean);
    const last = transitions[transitions.length - 1];
    const from = last ? last.to : names[0] || '';
    transitions.push({ from, to: names[(names.indexOf(from) + 1) % names.length] || from, cond: '' });
    render();
  } }, 'Add Transition');
  const node = h('div', {},
    h('div', { style: { maxHeight: '200px', overflow: 'auto', border: '1px solid var(--frame)' } }, tbl),
    h('div', { style: { marginTop: '6px' } }, addBtn));
  return { node, render };
}

// write the chart, open it in its editor
async function create(title, path, model, open, what) {
  await closeBeforeReplace(path);
  await api.writeFile(S.project.name, path, JSON.stringify(model, null, 2));
  await app.reloadProject();
  app.log(`${title}: created ${path} with ${model.inputs.length} input(s), ${model.outputs.length} output(s) and ${what}.`, 'ok');
  toast(`${model.name} created`, 'ok');
  open(path);
  return path;
}

export async function fsmWizard({ name = '', location = 'src', lang = null, named = false } = {}) {
  const guard = replaceGuard('FSM Wizard');
  if (!S.project) return;
  const L = lang || (S.project.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
  const p1 = namePage({
    title: 'Name and Language', name, lang: L, loc: location, guard, ext: '.fsm.json', nameLabel: 'State machine (module) name:',
    hint: 'The wizard creates a state diagram with its inputs, outputs, states and transitions, ready for you to set the outputs of its states; its HDL is generated from it.',
  });
  const typeSel = select([['moore', 'Moore (the outputs depend on the state)'], ['mealy', 'Mealy (the outputs depend on the state and the inputs)']], 'moore');
  typeSel.classList.add('cw-type');
  const io = ioPage(p1, field('Machine type:', typeSel));
  const states = ['S0', 'S1'];
  const transitions = [];
  const tt = transitionsTable(states, transitions);
  // the transitions follow a state renamed; those of a state removed go with it
  const st = statesTable(states, (old, nw) => {
    for (let k = transitions.length - 1; k >= 0; k--) {
      const t = transitions[k];
      if (nw === undefined && (t.from === old || t.to === old)) transitions.splice(k, 1);
      else { if (t.from === old) t.from = nw; if (t.to === old) t.to = nw; }
    }
    tt.render();
  });
  const model = () => fsmFromSpec({ name: p1.name(), lang: p1.lang(), type: typeSel.value, clock: io.clock(), reset: io.reset(), description: p1.desc.value, ports: io.ports, states, transitions });
  const p3 = {
    title: 'States and Transitions',
    render: () => h('div', {},
      h('div', { class: 'hint' }, 'The states (the first one is the initial state, after the reset), then the transitions between them: a condition over the inputs (e.g. x, !x, a && b, n == 3), empty for always; the first true one of a state is taken.'),
      h('div', { style: { display: 'flex', gap: '14px', marginTop: '8px', alignItems: 'flex-start' } }, st.node, h('div', { style: { flex: '1' } }, tt.node))),
    onShow: () => tt.render(),
    validate: () => {
      const e = st.check(p1.lang());
      if (e) return e;
      const names = new Set(states);
      const bad = transitions.find(t => !names.has(t.from) || !names.has(t.to));
      if (bad) return 'A transition starts or ends at a state that is not in the list.';
      return validateFsm(model()).find(d => d.severity === 'error')?.message || null;
    },
  };
  const summary = h('pre', { class: 'mw-summary code-box' });
  const pSum = {
    title: 'Summary',
    render: () => summary,
    onShow: () => {
      const m = model();
      summary.textContent = [
        `The wizard will create the state diagram ${p1.path()} and open it in the FSM editor.`,
        '',
        `Module: ${m.name} (${m.lang === 'vhdl' ? 'VHDL' : 'Verilog'}), ${m.type === 'mealy' ? 'Mealy' : 'Moore'} machine`,
        `Inputs: ${m.inputs.map(portText).join(', ') || 'none'}`,
        `Outputs: ${m.outputs.map(portText).join(', ') || 'none'}`,
        `Clock: ${m.clock}; reset: ${m.reset.name} (asynchronous, active high)`,
        `States: ${states.join(', ')} (initial: ${states[0]})`,
        `Transitions: ${transitions.map(t => `${t.from} → ${t.to}${t.cond ? ` (${t.cond})` : ''}`).join(', ') || 'none'}`,
        '',
        'Then set the outputs of the states (and of the transitions, Mealy) in the editor.',
      ].join('\n');
    },
    validate: () => guard(p1.path()),
  };
  const ok = await wizard('FSM Wizard', namedPages(p1.page, [p1.page, io.page, p3, pSum], named, p1.tail), { width: 860 });
  if (!ok) return;
  let m;
  try { m = model(); } catch (e) { return alertDlg('FSM Wizard', e.message, 'error'); }
  return create('FSM Wizard', p1.path(), m, p => app.openFsm(p), `${m.states.length} state(s)`);
}

export async function asmWizard({ name = '', location = 'src', lang = null, named = false } = {}) {
  const guard = replaceGuard('ASM Wizard');
  if (!S.project) return;
  const L = lang || (S.project.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
  const p1 = namePage({
    title: 'Name and Language', name, lang: L, loc: location, guard, ext: '.asm.json', nameLabel: 'ASM chart (module) name:',
    hint: 'The wizard creates an ASM chart with its inputs, outputs and state boxes, ready for you to add the decisions and the outputs; its HDL is generated from it.',
  });
  const io = ioPage(p1);
  const states = ['IDLE', 'RUN'];
  const st = statesTable(states);
  const model = () => asmFromSpec({ name: p1.name(), lang: p1.lang(), clock: io.clock(), reset: io.reset(), description: p1.desc.value, ports: io.ports, states });
  const p3 = {
    title: 'States',
    render: () => h('div', {},
      h('div', { class: 'hint' }, 'One state box per state, top to bottom: the first one is the initial state (after the reset); each one goes to the next, the last one back to the first. Add the decision boxes and the outputs in the editor.'),
      h('div', { style: { marginTop: '8px' } }, st.node)),
    validate: () => st.check(p1.lang()) || validateAsm(model()).find(d => d.severity === 'error')?.message || null,
  };
  const summary = h('pre', { class: 'mw-summary code-box' });
  const pSum = {
    title: 'Summary',
    render: () => summary,
    onShow: () => {
      const m = model();
      summary.textContent = [
        `The wizard will create the ASM chart ${p1.path()} and open it in the ASM editor.`,
        '',
        `Module: ${m.name} (${m.lang === 'vhdl' ? 'VHDL' : 'Verilog'})`,
        `Inputs: ${m.inputs.map(portText).join(', ') || 'none'}`,
        `Outputs: ${m.outputs.map(portText).join(', ') || 'none'}`,
        `Clock: ${m.clock}; reset: ${m.reset.name} (asynchronous, active high)`,
        `States: ${states.join(' → ')} → ${states[0]}`,
        '',
        'Then add the decision boxes and the outputs in the editor.',
      ].join('\n');
    },
    validate: () => guard(p1.path()),
  };
  const ok = await wizard('ASM Wizard', namedPages(p1.page, [p1.page, io.page, p3, pSum], named, p1.tail), { width: 820 });
  if (!ok) return;
  let m;
  try { m = model(); } catch (e) { return alertDlg('ASM Wizard', e.message, 'error'); }
  return create('ASM Wizard', p1.path(), m, p => app.openAsm(p), `${states.length} state(s)`);
}
