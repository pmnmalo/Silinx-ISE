// The ASM chart editor's inspector (#405: out of mountAsmEditor): the selection's properties (a connection, a state, an
// every-cycle block, a decision, a case and its exits, a conditional output, several boxes) and the machine's (its
// name, clock and reset, the initial state, the inputs, outputs, registers and generics). mountInspector(ctx) is
// called by mountAsmEditor where this code was.
import { h } from './dom.js';

/** { renderInspector, renderMachine } of an ASM chart editor (M(), sel(): its current model and selection). */
export function mountInspector(ctx) {
  const { M, sel, selSection, machineBody, btn, nodeById, caseExits, caseWidth, commit, deleteSelection } = ctx;

  function field(label, input, hintText) {
    return h('label', { class: 'asm-field' }, h('span', { class: 'asm-label' }, label), input, hintText ? h('small', { class: 'asm-fhint' }, hintText) : null);
  }
  const put = (...kids) => selSection.append(...kids.filter((k) => k != null));
  function renderInspector() {
    selSection.innerHTML = '';
    selSection.hidden = false;
    if (sel().edge) {
      const e = M().edges.find((x) => x.id === sel().edge);
      if (!e) return;
      const a = nodeById(e.from), b = nodeById(e.to);
      const nm = (n) => (n.type === 'state' ? `state ${n.name}` : n.type === 'always' ? `every-cycle block ${n.name}`
        : n.type === 'decision' ? `decision "${n.cond}"` : n.type === 'case' ? `case "${n.expr}"` : 'conditional output');
      put(h('h3', {}, 'Connection'),
        h('p', { class: 'asm-muted' }, `From ${nm(a)}${a.type === 'decision' ? ` (${e.port === 'true' ? '1' : '0'} branch)` : ''} to ${nm(b)}.`),
        a.type === 'case' ? field('Value(s) of this exit', h('input', { class: 'asm-input mono', value: e.port, spellcheck: 'false', 'data-focus': '1',
          oninput: (ev) => { e.port = ev.target.value.trim() || 'others'; commit(`lbl:${e.id}`); } }),
        `e.g. ${'0'.repeat(Math.max(0, caseWidth(a) - 1))}1, 4, 0|1 (several values) or others`) : null,
        e.points ? btn('Reset route', 'Use automatic routing', () => { delete e.points; commit('route'); renderInspector(); }) : null,
        btn('Delete connection', 'Delete (Del)', () => deleteSelection(), 'asm-danger'));
      return;
    }
    if (sel().nodes.size > 1) {
      put(h('h3', {}, `${sel().nodes.size} boxes selected`),
        h('p', { class: 'asm-muted' }, 'Drag to move them together, or delete them.'),
        btn('Delete selection', 'Delete (Del)', () => deleteSelection(), 'asm-danger'));
      return;
    }
    if (sel().nodes.size === 0) { selSection.hidden = true; return; }   // (nothing selected: the machine's settings only, #2739)
    const n = nodeById([...sel().nodes][0]);
    if (!n) return;
    const syntax = 'Syntax: out = 1, out = 4\'b1010, cnt = cnt + 1 (registered), or just "out" for out = 1';
    if (n.type === 'state') {
      put(h('h3', {}, 'State'));
      put(field('Name', h('input', { class: 'asm-input', value: n.name, spellcheck: 'false', 'data-focus': '1',
        oninput: (ev) => { n.name = ev.target.value.trim(); commit(`name:${n.id}`); }, onchange: () => renderMachine() })));
      const isInit = n.id === M().initial;
      put(h('label', { class: 'asm-check' },
        h('input', { type: 'checkbox', checked: isInit, disabled: isInit, onchange: () => { M().initial = n.id; commit('initial'); renderInspector(); renderMachine(); } }),
        isInit ? ' Initial (reset) state' : ' Make this the initial (reset) state'));
      put(field('Moore outputs (one per line)', actionsArea(n), syntax));
    } else if (n.type === 'always') {
      put(h('h3', {}, 'Every-cycle block'));
      put(field('Name', h('input', { class: 'asm-input', value: n.name, spellcheck: 'false', 'data-focus': '1',
        oninput: (ev) => { n.name = ev.target.value.trim(); commit(`name:${n.id}`); } }), 'Used in the generated code comments.'));
      put(field('Actions on every cycle (one per line)', actionsArea(n),
        'e.g. tc = 0, cnt = cnt + 1. Assign registers, registered outputs (next value) or combinational outputs.'));
      put(h('p', { class: 'asm-muted' }, 'Connect the exit to decision and conditional output boxes: they are evaluated on every clock cycle, ' +
        'in parallel with the states. Leave the last exits unconnected (end of the block); paths may join again but must not loop or reach a state. ' +
        'An assignment of the current state to the same target takes priority.'));
    } else if (n.type === 'decision') {
      put(h('h3', {}, 'Decision'));
      put(field('Condition', h('input', { class: 'asm-input mono', value: n.cond, spellcheck: 'false', 'data-focus': '1',
        oninput: (ev) => { n.cond = ev.target.value; commit(`cond:${n.id}`); } }),
      'e.g. go, !done, cnt == 9, x && (mode == 2\'b01), (1 << n) > cnt. Exit 1 = true, 0 = false.'));
      put(h('label', { class: 'asm-check' },
        h('input', { type: 'checkbox', checked: !!n.flip, onchange: (ev) => { if (ev.target.checked) n.flip = true; else delete n.flip; commit('flip'); } }),
        ' 0-exit on the left side'));
      put(btn('Swap 1 / 0 exits', 'Exchange the true and false branches', () => {
        for (const e of M().edges) if (e.from === n.id) e.port = e.port === 'true' ? 'false' : 'true';
        commit('swap');
      }));
    } else if (n.type === 'case') {
      put(h('h3', {}, 'Case'));
      put(field('Value tested', h('input', { class: 'asm-input mono', value: n.expr, spellcheck: 'false', 'data-focus': '1',
        oninput: (ev) => { n.expr = ev.target.value; commit(`expr:${n.id}`); } }),
      'An input, register or registered output, or a bit slice (e.g. opcode, opcode[4:3]). Generated as a case statement.'));
      const list = h('div', { class: 'asm-case-list' });
      for (const e of caseExits(n.id)) {
        const t = nodeById(e.to);
        list.append(h('div', { class: 'asm-row' },
          h('input', { class: 'asm-input mono', value: e.port, spellcheck: 'false', title: 'Value(s) of this exit: binary digits, a literal, a|b, or others',
            oninput: (ev) => { e.port = ev.target.value.trim() || 'others'; commit(`lbl:${e.id}`); } }),
          h('span', { class: 'asm-muted' }, `→ ${t ? (t.type === 'state' ? t.name : t.type === 'decision' ? t.cond : t.type === 'case' ? t.expr : 'output') : '?'}`),
          btn('✕', 'Delete this exit', () => { M().edges = M().edges.filter((x) => x.id !== e.id); commit('del-exit'); renderInspector(); }, 'asm-small asm-danger')));
      }
      put(field('Exits (value → box)', list, 'Drag from the ○ port on the right of the box to a box to add an exit (it gets the next free value). ' +
        "Without an 'others' exit the values must cover every case."));
    } else {
      put(h('h3', {}, 'Conditional output'));
      put(field('Mealy outputs (one per line)', actionsArea(n), syntax));
    }
    put(h('div', { class: 'asm-row' }, btn('Delete box', 'Delete (Del)', () => deleteSelection(), 'asm-danger')));
  }
  function actionsArea(n) {
    const ta = h('textarea', { class: 'asm-input mono', rows: String(Math.max(3, n.actions.length + 1)), spellcheck: 'false', 'data-focus': '1',
      oninput: () => { n.actions = ta.value.split('\n').map((s) => s.trim()).filter(Boolean); commit(`act:${n.id}`); } });
    ta.value = n.actions.join('\n');
    return ta;
  }

  function renderMachine() {
    machineBody.innerHTML = '';
    const txt = (label, get, set, key, hintText) => field(label, h('input', { class: 'asm-input', value: get(), spellcheck: 'false',
      oninput: (ev) => { set(ev.target.value.trim()); commit(key); } }), hintText);
    machineBody.append(txt('Module / entity name', () => M().name, (v) => { M().name = v; }, 'm-name'));
    const row = h('div', { class: 'asm-grid2' },
      txt('Clock', () => M().clock, (v) => { M().clock = v; }, 'm-clk'),
      txt('Reset', () => M().reset.name, (v) => { M().reset.name = v; }, 'm-rst'));
    machineBody.append(row);
    machineBody.append(h('div', { class: 'asm-grid2' },
      field('Reset level', h('select', { class: 'asm-input', onchange: (ev) => { M().reset.active = ev.target.value; commit('m-act'); } },
        h('option', { value: 'high', selected: M().reset.active === 'high' }, 'active high'),
        h('option', { value: 'low', selected: M().reset.active === 'low' }, 'active low'))),
      field('Reset type', h('select', { class: 'asm-input', onchange: (ev) => { M().reset.sync = ev.target.value === 'sync'; commit('m-sync'); } },
        h('option', { value: 'async', selected: !M().reset.sync }, 'asynchronous'),
        h('option', { value: 'sync', selected: M().reset.sync }, 'synchronous')))));
    const states = M().nodes.filter((n) => n.type === 'state');
    machineBody.append(field('Initial state', h('select', { class: 'asm-input', onchange: (ev) => { M().initial = ev.target.value; commit('m-init'); renderInspector(); } },
      !states.some((s) => s.id === M().initial) ? h('option', { value: '', selected: true }, '(none)') : null,
      ...states.map((s) => h('option', { value: s.id, selected: s.id === M().initial }, s.name || s.id)))));

    // ports, generics and registers tables
    const usedNames = () => new Set([...M().inputs, ...M().outputs, ...(M().generics || []), ...(M().registers || [])].map((x) => x.name));
    const freshName = (base, start) => { let k = start; const used = usedNames(); while (used.has(`${base}${k}`)) k++; return `${base}${k}`; };
    const nameCell = (p, key) => h('td', {}, h('input', { class: 'asm-input mono', value: p.name, spellcheck: 'false', placeholder: 'name',
      oninput: (ev) => { p.name = ev.target.value.trim(); commit(key); } }));
    const widthCell = (p, key) => h('td', {}, h('input', { class: 'asm-input mono w', type: 'number', min: '1', max: '256', value: String(p.width),
      oninput: (ev) => { p.width = parseInt(ev.target.value, 10) || 0; commit(key); } }));
    const removeCell = (list, i, key) => h('td', { class: 'c' }, h('button', { type: 'button', class: 'asm-x', title: 'Remove',
      onclick: () => {
        list.splice(i, 1);
        // optional lists disappear when empty (old charts stay unchanged)
        for (const k of ['registers', 'generics']) if (M()[k] && !M()[k].length) delete M()[k];
        commit(key); renderMachine();
      } }, '✕'));
    const table = (title, cls, heads, list, row, addLabel, addTitle, make, attach = () => {}) => {
      const tb = h('tbody');
      list.forEach((p, i) => tb.append(h('tr', {}, ...row(p, i))));
      const add = btn(addLabel, addTitle, () => {
        attach(list);
        list.push(make(list));
        commit(`${cls}-add`); renderMachine();
        const inputs = machineBody.querySelectorAll(`table.${cls} tbody tr:last-child input`);
        inputs[0]?.focus(); inputs[0]?.select();
      }, 'asm-small');
      return h('div', { class: 'asm-ports' },
        h('div', { class: 'asm-ports-head' }, h('span', { class: 'asm-label' }, title), add),
        h('table', { class: `asm-table ${cls}` }, h('thead', {}, h('tr', {}, ...heads.map(([t, tt]) => h('th', tt ? { title: tt } : {}, t)), h('th', {}))), tb));
    };
    machineBody.append(table('Inputs', 'ins', [['Name'], ['Width'], ['Sync', 'Synchronise with 2 flip-flops (conditions see the synchronised value)']], M().inputs,
      (p, i) => [nameCell(p, `p-n:in:${i}`), widthCell(p, `p-w:in:${i}`),
        h('td', { class: 'c' }, h('input', { type: 'checkbox', checked: !!p.sync, title: 'Synchronise with 2 flip-flops (asynchronous input, e.g. a button)',
          onchange: (ev) => { if (ev.target.checked) p.sync = true; else delete p.sync; commit('p-s'); } })),
        removeCell(M().inputs, i, 'p-del')],
      '+ input', 'Add an input port', () => ({ name: freshName('in', M().inputs.length), width: 1 })));
    machineBody.append(table('Outputs', 'outs', [['Name'], ['Width'], ['Default'], ['Reg', 'Registered']], M().outputs,
      (p, i) => [nameCell(p, `p-n:out:${i}`), widthCell(p, `p-w:out:${i}`),
        h('td', {}, h('input', { class: 'asm-input mono d', value: p.default, spellcheck: 'false', title: 'Default (combinational) or reset value (registered)',
          oninput: (ev) => { p.default = ev.target.value.trim() || '0'; commit(`p-d:${i}`); } })),
        h('td', { class: 'c' }, h('input', { type: 'checkbox', checked: p.registered, title: 'Registered output (holds its value, readable in conditions)',
          onchange: (ev) => { p.registered = ev.target.checked; commit('p-r'); } })),
        removeCell(M().outputs, i, 'p-del')],
      '+ output', 'Add an output port', () => ({ name: freshName('out', M().outputs.length), width: 1, default: '0', registered: false })));
    machineBody.append(h('small', { class: 'asm-fhint' }, 'Combinational outputs take their default unless assigned. Registered outputs (Reg) hold their value, reset to the default and can be read in conditions, e.g. cnt = cnt + 1.'));
    const regs = M().registers || [];
    machineBody.append(table('Registers', 'regs', [['Name'], ['Width'], ['Reset', 'Reset (initial) value']], regs,
      (r, i) => [nameCell(r, `r-n:${i}`), widthCell(r, `r-w:${i}`),
        h('td', {}, h('input', { class: 'asm-input mono d', value: r.init, spellcheck: 'false', title: 'Reset value',
          oninput: (ev) => { r.init = ev.target.value.trim() || '0'; commit(`r-i:${i}`); } })),
        removeCell(regs, i, 'r-del')],
      '+ register', 'Add an internal register (data path)', () => ({ name: freshName('r', regs.length), width: 8, init: '0' }),
      (l) => { M().registers = l; }));
    const gens = M().generics || [];
    machineBody.append(table('Generics', 'gens', [['Name'], ['Default', 'Default value (integer)']], gens,
      (g, i) => [nameCell(g, `g-n:${i}`),
        h('td', {}, h('input', { class: 'asm-input mono d', value: String(g.default), spellcheck: 'false', title: 'Default value (non-negative integer)',
          oninput: (ev) => { const t = ev.target.value.trim().replace(/_/g, ''); g.default = /^\d+$/.test(t) ? Number(t) : ev.target.value.trim(); commit(`g-d:${i}`); } })),
        removeCell(gens, i, 'g-del')],
      '+ generic', 'Add an integer generic / parameter', () => ({ name: freshName('N', gens.length + 1), default: 1 }),
      (l) => { M().generics = l; }));
    machineBody.append(h('small', { class: 'asm-fhint' }, 'Registers are internal: assign them like registered outputs (next value at the clock edge, they hold otherwise) ' +
      'and read them anywhere. Generics are integer VHDL generics / Verilog parameters, usable in expressions (e.g. cnt == N - 1).'));
  }

  return { renderInspector, renderMachine };
}
