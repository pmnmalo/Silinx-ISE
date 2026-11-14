// The FSM state diagram editor's side panel (#405: out of mountFsmEditor): the selection's properties (a state: its
// name, Moore outputs, encoding and transitions; a transition: its condition, Mealy outputs, priority) and the
// machine's (its name, clock and reset, inputs and outputs, encoding). mountSide(ctx) is called by mountFsmEditor
// where this code was. A state's or a transition's outputs: a table of the machine's outputs, its value editable
// (core/fsm-outputs.js, #3814; a value refused: the console, flash(text)). No Delete button: a state or a transition is
// deleted as any selection is, by the Delete key or the toolbar's (#3882). Its look last: web/js/fsm-look.js (#3883).
import { h } from './ui.js';
import { lookFields } from './fsm-look.js';
import { outputLines } from '/core/fsm.js';
import { dropOutputValues, outputRows, outputsWhere, renameOutputValues, setOutputValue } from '/core/fsm-outputs.js';

/** { renderSide } of an FSM editor (M(), sel(): its current model and selection; setSel(s) selects). */
export function mountSide(ctx) {
  const { M, sel, setSel, selSection, machineBody, machineSection = machineBody, btn, stateById, transById, encOf, commit,
    readOnly = false, locked = () => readOnly, render, updateToolbar, flash = () => {} } = ctx;

  const field = (label, input, hintText) => h('label', { class: 'asm-field' }, h('span', { class: 'asm-label' }, label), input, hintText ? h('span', { class: 'asm-fhint' }, hintText) : null);
  const input = (value, onchange, { cls = '', ph = '', key = null, title = null } = {}) => {
    const el = h('input', { type: 'text', class: `asm-input ${cls}`, value: value ?? '', placeholder: ph || null, title, spellcheck: 'false' });
    el.addEventListener('input', () => onchange(el.value, false));
    el.addEventListener('change', () => onchange(el.value, true));
    if (key) el.dataset.key = key;
    return el;
  };
  // (a state's or a transition's outputs, #3814: one row per output of the machine, its name and width as declared,
  // its value typed: checked as it is typed (a value refused marked, and when it is left, said in the console and
  // the value in force shown again); empty: not set; `base`: what an empty value stands for, a transition's state's)
  const outputsTable = (key, obj, where, base = null) => {
    const rows = outputRows(M(), obj().outputs, base);
    if (!rows.length) return h('p', { class: 'asm-muted fsm-noouts' }, 'The machine has no outputs');
    const tbl = h('table', { class: `asm-table fsm-outvals ${key}` }, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Width'), h('th', {}, 'Value')));
    for (const r of rows) {
      const el = input(r.value, (v, done) => {
        const o = obj();
        if (!o) return;
        const s = setOutputValue(o.outputs, r.name, v, M().outputs);
        el.classList.toggle('bad', !!s.error);
        if (!s.error) { if (JSON.stringify(s.outputs) !== JSON.stringify(o.outputs)) { o.outputs = s.outputs; commit(`${key}:${r.name}`); } return; }
        if (done) { flash(`${where()}: ${s.error}`); el.value = o.outputs[r.name] ?? ''; el.classList.remove('bad'); }
      }, { cls: 'mono v', ph: r.placeholder, key: `${key}:${r.name}` });
      tbl.append(h('tr', {}, h('td', { class: 'mono n' }, r.name), h('td', { class: 'c' }, String(r.width)), h('td', {}, el)));
    }
    return tbl;
  };
  const outputsField = (label, table, hintText) => h('div', { class: 'asm-field' }, h('span', { class: 'asm-label' }, label), table, h('span', { class: 'asm-fhint' }, hintText));

  // (the field being typed in focused again, its caret where it was: a panel drawn anew under it, #3763)
  function renderSide() {
    const a = document.activeElement, key = (selSection.contains(a) || machineBody.contains(a)) ? a.dataset.key : null;
    const caret = key && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
    renderSelection(); renderMachine(); updateToolbar(); lock();
    const b = key ? (selSection.querySelector(`[data-key="${key}"]`) || machineBody.querySelector(`[data-key="${key}"]`)) : null;
    if (b) { b.focus({ preventScroll: true }); if (caret) b.setSelectionRange(...caret); }
  }
  // (read-only, #2696, or in Try it, #3793: its fields shown, disabled; its buttons hidden)
  const lock = () => { if (locked()) for (const x of [...selSection.querySelectorAll('input, select, textarea, button'), ...machineBody.querySelectorAll('input, select, textarea, button')]) if (x.tagName === 'BUTTON') x.hidden = true; else x.disabled = true; };

  function renderSelection() {
    selSection.textContent = '';
    // (nothing selected: no section, #2729; a state or a transition selected: its section alone, not the machine's, #3764)
    selSection.hidden = !sel();
    machineSection.hidden = !!sel();
    if (!sel()) return;
    // (each field writes to the object of the model as it is now: a commit makes the model anew, and an object read
    // when the panel was drawn is no longer in it after the first key, #3763)
    if (sel().type === 'state') {
      const s = stateById(sel().id);
      if (!s) { setSel(null); return renderSelection(); }
      const id = s.id, cur = () => stateById(id);
      const e = encOf().get(s.id);
      const name = input(s.name, (v, done) => { if (!cur()) return; cur().name = v.trim(); commit('sname'); if (done) renderMachine(); }, { cls: 'mono fsm-sname', key: 'sname' });
      const outs = outputsTable('souts', cur, () => outputsWhere(M(), { type: 'state', id }));
      const init = h('input', { type: 'checkbox', class: 'fsm-initial', checked: M().initial === s.id, disabled: M().initial === s.id });
      init.addEventListener('change', () => { if (init.checked) { M().initial = id; commit(); renderSelection(); } });
      const ts = M().transitions.filter((t) => t.from === s.id);
      // (a state with no comment, or no code: nothing there, not the text "null", #2722)
      selSection.append(...[h('h3', {}, 'State'),
        field('Name', name),
        s.comment ? h('p', { class: 'asm-muted fsm-scomment' }, s.comment) : null,
        outputsField('Outputs (Moore)', outs, 'The value of each output while in this state (empty: its default value).'),
        h('label', { class: 'asm-check' }, init, 'Initial (reset) state'),
        e && M().encoding !== 'enum' ? h('p', { class: 'asm-muted' }, `Code: ${e.bits} (${M().encoding})`) : null,
        h('div', { class: 'asm-label' }, `Transitions out of ${s.name} (the first true condition is taken)`),
        // (a transition's outputs one per line under it, #3882)
        h('ol', { class: 'fsm-tlist' }, ...ts.map((t) => h('li', { class: 'link', onclick: () => { setSel({ type: 'trans', id: t.id }); render(); renderSide(); } },
          `${t.cond || '1'} → ${stateById(t.to)?.name ?? '?'}${outputLines(t.outputs).length ? ' /' : ''}`,
          ...outputLines(t.outputs).map((o) => h('div', { class: 'mono fsm-tout' }, o))))),
        ...look('state', cur, id)].filter(Boolean));
      return;
    }
    const t = transById(sel().id);
    if (!t) { setSel(null); return renderSelection(); }
    const id = t.id, cur = () => transById(id);
    const stateOpts = (cur) => M().states.map((s) => h('option', { value: s.id, selected: s.id === cur }, s.name));
    const from = h('select', { class: 'asm-select fsm-from' }, ...stateOpts(t.from));
    const to = h('select', { class: 'asm-select fsm-to' }, ...stateOpts(t.to));
    const reroute = (k, v) => { const c = cur(); if (!c) return; c[k] = v; delete c.bend; delete c.angle; commit(); renderSelection(); };
    from.addEventListener('change', () => reroute('from', from.value));
    to.addEventListener('change', () => reroute('to', to.value));
    const cond = input(t.cond, (v) => { if (!cur()) return; cur().cond = v.trim(); commit('cond'); }, { cls: 'mono fsm-cond', ph: 'e.g. x && !y   (empty = always)', key: 'cond' });
    const outs = outputsTable('touts', cur, () => outputsWhere(M(), { type: 'trans', id }), stateById(t.from)?.outputs);
    const siblings = M().transitions.filter((x) => x.from === t.from);
    const pos = siblings.indexOf(t);
    const move = (dir) => {
      const all = M().transitions, mine = all.filter((x) => x.from === cur()?.from), k = mine.findIndex((x) => x.id === id);
      const other = k < 0 ? null : mine[k + dir];
      if (!other) return;
      const i = all.findIndex((x) => x.id === id), j = all.indexOf(other);
      [all[i], all[j]] = [all[j], all[i]];
      commit(); renderSelection();
    };
    selSection.append(h('h3', {}, 'Transition'),
      h('div', { class: 'asm-grid2' }, field('From', from), field('To', to)),
      field('Condition', cond, 'Boolean expression over the inputs: x, !x, x && y, x || !y, a == 2\'b01, b[0] (also and, or, not, =). Empty: always.'),
      outputsField('Outputs (Mealy)', outs, 'The value of each output while this transition is taken (empty: the state\'s value; a value makes the machine a Mealy machine).'),
      h('div', { class: 'asm-label' }, `Priority ${pos + 1} of ${siblings.length} in ${stateById(t.from)?.name ?? '?'}`),
      h('div', { class: 'asm-row' },
        btn('▲ Earlier', 'Try this condition before the previous one', () => move(-1), 'asm-small'),
        btn('▼ Later', 'Try this condition after the next one', () => move(1), 'asm-small'),
        btn('Straighten', 'Default shape of the arrow', () => { const c = cur(); if (c) { delete c.bend; delete c.angle; commit(); } }, 'asm-small')),
      ...look('trans', cur, id));
  }
  const look = (kind, obj, id) => lookFields({ kind, obj, host: selSection, commit, flash, field, btn, refresh: () => renderSide(),
    where: () => outputsWhere(M(), { type: kind, id }) });

  function renderMachine() {
    machineBody.textContent = '';
    const name = input(M().name, (v) => { M().name = v.trim(); commit('name'); }, { cls: 'mono fsm-mname', key: 'mname' });
    const clk = input(M().clock, (v) => { M().clock = v.trim(); commit('clk'); }, { cls: 'mono', key: 'clk' });
    const rst = input(M().reset.name, (v) => { M().reset.name = v.trim(); commit('rst'); }, { cls: 'mono', key: 'rst' });
    const act = h('select', { class: 'asm-select' }, h('option', { value: 'high', selected: M().reset.active === 'high' }, 'active high'), h('option', { value: 'low', selected: M().reset.active === 'low' }, 'active low'));
    act.addEventListener('change', () => { M().reset.active = act.value; commit(); });
    const sync = h('input', { type: 'checkbox', checked: M().reset.sync });
    sync.addEventListener('change', () => { M().reset.sync = sync.checked; commit(); });
    const ports = (list, kind) => {
      const L = () => (kind === 'out' ? M().outputs : M().inputs);
      const tbl = h('table', { class: 'asm-table' }, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Width'), kind === 'out' ? h('th', {}, 'Default') : null, h('th', {})));
      list.forEach((p, i) => {
        // (an output renamed: its values in the states and transitions given the new name when it is left, #3814)
        let was = p.name;
        const nm = input(p.name, (v, done) => {
          if (!L()[i]) return;
          L()[i].name = v.trim();
          if (done && kind === 'out') { renameOutputValues(M(), was, v.trim()); was = v.trim(); }
          commit(`p${kind}${i}`);
        }, { cls: 'mono', key: `p${kind}${i}` });
        const w = input(String(p.width), (v) => { const n = parseInt(v, 10); if (Number.isFinite(n) && L()[i]) { L()[i].width = n; commit(`w${kind}${i}`); } }, { cls: 'w', key: `w${kind}${i}` });
        const df = kind === 'out' ? input(p.default, (v) => { if (!L()[i]) return; L()[i].default = v.trim() || '0'; commit(`d${i}`); }, { cls: 'mono d', key: `d${i}` }) : null;
        const x = h('button', { type: 'button', class: 'asm-x', title: 'Remove', onclick: () => { const [gone] = L().splice(i, 1); if (kind === 'out' && gone && !L().some((o) => o.name === gone.name)) dropOutputValues(M(), gone.name); commit(); renderMachine(); } }, '✕');
        tbl.append(h('tr', {}, h('td', {}, nm), h('td', { class: 'c' }, w), df ? h('td', {}, df) : null, h('td', { class: 'c' }, x)));
      });
      return tbl;
    };
    const addPort = (kind, base, extra) => () => {
      const list = kind === 'out' ? M().outputs : M().inputs;
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
      h('div', { class: 'asm-ports fsm-inputs' }, h('div', { class: 'asm-ports-head' }, h('span', { class: 'asm-label' }, 'Inputs'), btn('+ Input', 'Add an input', addPort('in', 'x', {}), 'asm-small fsm-add-in')), ports(M().inputs, 'in')),
      h('div', { class: 'asm-ports fsm-outputs' }, h('div', { class: 'asm-ports-head' }, h('span', { class: 'asm-label' }, 'Outputs'), btn('+ Output', 'Add an output', addPort('out', 'z', { default: '0' }), 'asm-small fsm-add-out')), ports(M().outputs, 'out')),
      h('div', { class: 'asm-grid2' }, field('Clock', clk), field('Reset signal', rst)),
      h('div', { class: 'asm-grid2' }, field('Reset level', act), h('label', { class: 'asm-check', style: { marginTop: '18px' } }, sync, 'Synchronous reset')),
      field('Description', desc));
  }

  return { renderSide };
}
