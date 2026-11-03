// The FSM state diagram editor's side panel (#405: out of mountFsmEditor): the selection's properties (a state: its
// name, Moore outputs, encoding and transitions; a transition: its condition, Mealy outputs, priority) and the
// machine's (its name, clock and reset, inputs and outputs, encoding). mountSide(ctx) is called by mountFsmEditor
// where this code was.
import { h } from './ui.js';
import { formatOutputs, parseOutputs } from '/core/fsm.js';

/** { renderSide } of an FSM editor (M(), sel(): its current model and selection; setSel(s) selects). */
export function mountSide(ctx) {
  const { M, sel, setSel, selSection, machineBody, btn, stateById, transById, encOf, commit, deleteSelection, readOnly = false, render,
    updateToolbar } = ctx;

  const field = (label, input, hintText) => h('label', { class: 'asm-field' }, h('span', { class: 'asm-label' }, label), input, hintText ? h('span', { class: 'asm-fhint' }, hintText) : null);
  const input = (value, onchange, { cls = '', ph = '', key = null, title = null } = {}) => {
    const el = h('input', { type: 'text', class: `asm-input ${cls}`, value: value ?? '', placeholder: ph || null, title, spellcheck: 'false' });
    el.addEventListener('input', () => onchange(el.value, false));
    el.addEventListener('change', () => onchange(el.value, true));
    if (key) el.dataset.key = key;
    return el;
  };
  function renderSide() { renderSelection(); renderMachine(); updateToolbar(); lock(); }
  // (read-only, #2696: its fields shown, disabled; its buttons hidden)
  const lock = () => { if (readOnly) for (const x of [...selSection.querySelectorAll('input, select, button'), ...machineBody.querySelectorAll('input, select, button')]) if (x.tagName === 'BUTTON') x.hidden = true; else x.disabled = true; };

  function renderSelection() {
    selSection.textContent = '';
    if (!sel()) {
      selSection.append(h('h3', {}, 'Selection'),
        h('p', { class: 'asm-muted' }, 'Nothing selected. Click a state or a transition to edit it.'),
        h('div', { class: 'asm-legend' },
          h('div', {}, h('span', { class: 'fsm-leg-circle' }), 'State (Moore outputs inside)'),
          h('div', {}, h('span', { class: 'fsm-leg-circle init' }), 'Initial (reset) state'),
          h('div', {}, h('span', { class: 'fsm-leg-arrow' }), 'Transition: condition / Mealy outputs')));
      return;
    }
    if (sel().type === 'state') {
      const s = stateById(sel().id);
      if (!s) { setSel(null); return renderSelection(); }
      const e = encOf().get(s.id);
      const name = input(s.name, (v, done) => { s.name = v.trim(); commit('sname'); if (done) renderMachine(); }, { cls: 'mono fsm-sname', key: 'sname' });
      const outs = input(formatOutputs(s.outputs), (v) => {
        const r = parseOutputs(v);
        outErr.textContent = r.error || '';
        if (!r.error) { s.outputs = r.outputs; commit('souts'); }
      }, { cls: 'mono fsm-souts', ph: 'e.g. z=1, y=2\'b10', key: 'souts' });
      const outErr = h('span', { class: 'asm-fhint c-err' });
      const init = h('input', { type: 'checkbox', class: 'fsm-initial', checked: M().initial === s.id, disabled: M().initial === s.id });
      init.addEventListener('change', () => { if (init.checked) { M().initial = s.id; commit(); renderSelection(); } });
      const ts = M().transitions.filter((t) => t.from === s.id);
      // (a state with no comment, or no code: nothing there, not the text "null", #2722)
      selSection.append(...[h('h3', {}, 'State'),
        field('Name', name),
        s.comment ? h('p', { class: 'asm-muted fsm-scomment' }, s.comment) : null,
        field('Outputs (Moore)', outs, 'Outputs while in this state: output=value, separated by commas. The other outputs keep their default value.'), outErr,
        h('label', { class: 'asm-check' }, init, 'Initial (reset) state'),
        e && M().encoding !== 'enum' ? h('p', { class: 'asm-muted' }, `Code: ${e.bits} (${M().encoding})`) : null,
        h('div', { class: 'asm-label' }, `Transitions out of ${s.name} (the first true condition is taken)`),
        h('ol', { class: 'fsm-tlist' }, ...ts.map((t) => h('li', { class: 'link', onclick: () => { setSel({ type: 'trans', id: t.id }); render(); renderSide(); } },
          `${t.cond || '1'} → ${stateById(t.to)?.name ?? '?'}${Object.keys(t.outputs).length ? ` / ${formatOutputs(t.outputs)}` : ''}`))),
        h('div', { class: 'asm-row' }, btn('Delete state', 'Delete this state and its transitions', () => deleteSelection(), 'asm-danger asm-small'))].filter(Boolean));
      return;
    }
    const t = transById(sel().id);
    if (!t) { setSel(null); return renderSelection(); }
    const stateOpts = (cur) => M().states.map((s) => h('option', { value: s.id, selected: s.id === cur }, s.name));
    const from = h('select', { class: 'asm-select fsm-from' }, ...stateOpts(t.from));
    const to = h('select', { class: 'asm-select fsm-to' }, ...stateOpts(t.to));
    from.addEventListener('change', () => { t.from = from.value; delete t.bend; delete t.angle; commit(); renderSelection(); });
    to.addEventListener('change', () => { t.to = to.value; delete t.bend; delete t.angle; commit(); renderSelection(); });
    const cond = input(t.cond, (v) => { t.cond = v.trim(); commit('cond'); }, { cls: 'mono fsm-cond', ph: 'e.g. x && !y   (empty = always)', key: 'cond' });
    const outErr = h('span', { class: 'asm-fhint c-err' });
    const outs = input(formatOutputs(t.outputs), (v) => {
      const r = parseOutputs(v);
      outErr.textContent = r.error || '';
      if (!r.error) { t.outputs = r.outputs; commit('touts'); }
    }, { cls: 'mono fsm-touts', ph: 'e.g. z=1', key: 'touts' });
    if (M().type === 'moore' && !Object.keys(t.outputs).length) outs.disabled = true;
    const siblings = M().transitions.filter((x) => x.from === t.from);
    const pos = siblings.indexOf(t);
    const move = (dir) => {
      const other = siblings[pos + dir];
      if (!other) return;
      const i = M().transitions.indexOf(t), j = M().transitions.indexOf(other);
      [M().transitions[i], M().transitions[j]] = [M().transitions[j], M().transitions[i]];
      commit(); renderSelection();
    };
    selSection.append(h('h3', {}, 'Transition'),
      h('div', { class: 'asm-grid2' }, field('From', from), field('To', to)),
      field('Condition', cond, 'Boolean expression over the inputs: x, !x, x && y, x || !y, a == 2\'b01, b[0] (also and, or, not, =). Empty: always.'),
      field('Outputs (Mealy)', outs, M().type === 'moore' ? 'A Moore machine has no outputs on the transitions (choose Mealy in the toolbar).' : 'Outputs while this transition is taken: output=value, separated by commas.'), outErr,
      h('div', { class: 'asm-label' }, `Priority ${pos + 1} of ${siblings.length} in ${stateById(t.from)?.name ?? '?'}`),
      h('div', { class: 'asm-row' },
        btn('▲ Earlier', 'Try this condition before the previous one', () => move(-1), 'asm-small'),
        btn('▼ Later', 'Try this condition after the next one', () => move(1), 'asm-small'),
        btn('Straighten', 'Default shape of the arrow', () => { delete t.bend; delete t.angle; commit(); }, 'asm-small')),
      h('div', { class: 'asm-row' }, btn('Delete transition', 'Delete this transition', () => deleteSelection(), 'asm-danger asm-small')));
  }

  function renderMachine() {
    machineBody.textContent = '';
    const name = input(M().name, (v) => { M().name = v.trim(); commit('name'); }, { cls: 'mono fsm-mname' });
    const clk = input(M().clock, (v) => { M().clock = v.trim(); commit('clk'); }, { cls: 'mono' });
    const rst = input(M().reset.name, (v) => { M().reset.name = v.trim(); commit('rst'); }, { cls: 'mono' });
    const act = h('select', { class: 'asm-select' }, h('option', { value: 'high', selected: M().reset.active === 'high' }, 'active high'), h('option', { value: 'low', selected: M().reset.active === 'low' }, 'active low'));
    act.addEventListener('change', () => { M().reset.active = act.value; commit(); });
    const sync = h('input', { type: 'checkbox', checked: M().reset.sync });
    sync.addEventListener('change', () => { M().reset.sync = sync.checked; commit(); });
    const ports = (list, kind) => {
      const tbl = h('table', { class: 'asm-table' }, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Width'), kind === 'out' ? h('th', {}, 'Default') : null, h('th', {})));
      list.forEach((p, i) => {
        const nm = input(p.name, (v) => { p.name = v.trim(); commit(`p${kind}${i}`); }, { cls: 'mono' });
        const w = input(String(p.width), (v) => { const n = parseInt(v, 10); if (Number.isFinite(n)) { p.width = n; commit(`w${kind}${i}`); } }, { cls: 'w' });
        const df = kind === 'out' ? input(p.default, (v) => { p.default = v.trim() || '0'; commit(`d${i}`); }, { cls: 'mono d' }) : null;
        const x = h('button', { type: 'button', class: 'asm-x', title: 'Remove', onclick: () => { list.splice(i, 1); commit(); renderMachine(); } }, '✕');
        tbl.append(h('tr', {}, h('td', {}, nm), h('td', { class: 'c' }, w), df ? h('td', {}, df) : null, h('td', { class: 'c' }, x)));
      });
      return tbl;
    };
    const addPort = (list, base, extra) => () => {
      const used = new Set([...M().inputs, ...M().outputs].map((p) => p.name.toLowerCase()));
      let i = list.length, n;
      do n = `${base}${i++}`; while (used.has(n));
      list.push({ name: n, width: 1, ...extra });
      commit(); renderMachine();
    };
    const desc = h('textarea', { class: 'asm-input', rows: 2, placeholder: 'What the machine does (written in the HDL header)' }, M().description || '');
    desc.addEventListener('change', () => { if (desc.value.trim()) M().description = desc.value.trim(); else delete M().description; commit(); });
    machineBody.append(
      field('Module name', name),
      h('div', { class: 'asm-ports fsm-inputs' }, h('div', { class: 'asm-ports-head' }, h('span', { class: 'asm-label' }, 'Inputs'), btn('+ Input', 'Add an input', addPort(M().inputs, 'x', {}), 'asm-small fsm-add-in')), ports(M().inputs, 'in')),
      h('div', { class: 'asm-ports fsm-outputs' }, h('div', { class: 'asm-ports-head' }, h('span', { class: 'asm-label' }, 'Outputs'), btn('+ Output', 'Add an output', addPort(M().outputs, 'z', { default: '0' }), 'asm-small fsm-add-out')), ports(M().outputs, 'out')),
      h('div', { class: 'asm-grid2' }, field('Clock', clk), field('Reset signal', rst)),
      h('div', { class: 'asm-grid2' }, field('Reset level', act), h('label', { class: 'asm-check', style: { marginTop: '18px' } }, sync, 'Synchronous reset')),
      field('Description', desc));
  }

  return { renderSide };
}
