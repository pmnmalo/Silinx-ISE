// The state diagram editor's bottom panel (#405: out of mountFsmEditor in fsm-editor.js): the tables (the state and
// output tables, the encodings), the HDL generated from the diagram, and the simulation (the inputs, a clock step,
// run, reset, the state and outputs, the trace).
import { downloadText, h } from './ui.js';
import { encodedTable, generateFsm, stateTable, stepFsm, toCsv, transitionTable } from '/core/fsm.js';
import { highlightHdl } from './highlight.js';
import { clamp } from './fsm-editor.js';

/** { renderPanel, resetSim, stopRun, togglePanel } of mountFsmEditor (M(), destroyed(), diags(), panel(), sim(): its current values). */
export function mountFsmBottom(ctx) {
  const {
    opts, M, bottom, btn, destroyed, diags, fit, flash, hint, panel, panelBody, panelTitle, panelTools, render, sim,
    stateById, updateToolbar, setPanel, setSim
  } = ctx;

  // ---------------------------------------------------------------------------- bottom panel
  function togglePanel(which) {
    setPanel(panel() === which ? null : which);
    if (panel() !== 'sim' && sim()) stopRun();
    if (panel() === 'sim' && !sim()) resetSim();
    if (panel() !== 'sim') { setSim(null); }
    bottom.hidden = !panel();
    hint.hidden = !!panel();
    requestAnimationFrame(() => { if (!destroyed()) fit(); });   // the drawing area changed size
    renderPanel();
    render();
    updateToolbar();
  }
  function renderPanel() {
    if (panel() !== 'sim') { panelBody.textContent = ''; panelTools.textContent = ''; }
    if (!panel()) return;
    if (panel() === 'code') return renderCode();
    if (panel() === 'tables') return renderTables();
    return renderSim();
  }
  function renderCode() {
    panelTitle.textContent = `${M().name}.${M().lang === 'verilog' ? 'v' : 'vhd'}`;
    const pre = h('pre', { class: 'asm-code fsm-code' });
    try {
      const g = generateFsm(M(), M().lang);
      pre.innerHTML = highlightHdl(g.code, M().lang);
      panelTools.append(btn('Copy', 'Copy the code to the clipboard', () => navigator.clipboard?.writeText(g.code).then(() => flash('Code copied to the clipboard'), () => {}), 'asm-small'));
    } catch (e) {
      pre.classList.add('has-err');
      pre.textContent = `${e.message}`;
    }
    panelBody.append(pre);
  }
  function csvButton(name, rows) {
    return btn('Export CSV', 'Download this table as a CSV file (opens in a spreadsheet)', () => downloadText(name, toCsv(rows), 'text/csv'), 'asm-small');
  }
  function renderTables() {
    panelTitle.textContent = 'Tables';
    const wrap = h('div', { class: 'fsm-tables' });
    // transition table
    const tt = transitionTable(M());
    const showCode = M().encoding !== 'enum';
    const t1 = h('table', { class: 'fsm-table fsm-ttable' },
      h('tr', {}, h('th', {}, 'Present state'), showCode ? h('th', {}, 'Code') : null, h('th', {}, 'Input condition'), h('th', {}, 'Next state'), showCode ? h('th', {}, 'Next code') : null, h('th', {}, 'Outputs')),
      ...tt.rows.map((r) => h('tr', { class: r.stays ? 'stays' : '' }, h('td', {}, r.state), showCode ? h('td', { class: 'mono' }, r.code) : null,
        h('td', { class: 'mono' }, r.cond === 'otherwise' ? h('i', {}, 'otherwise (stays)') : r.cond), h('td', {}, r.next), showCode ? h('td', { class: 'mono' }, r.nextCode) : null, h('td', { class: 'mono' }, r.outputs))));
    wrap.append(h('div', { class: 'fsm-tcap' }, h('b', {}, 'Transition table'), csvButton(`${M().name}_transitions.csv`, [tt.columns, ...tt.rows.map((r) => [r.state, r.code, r.cond, r.next, r.nextCode, r.outputs])])), t1);
    // state table (classic form)
    const st = stateTable(M());
    if (st) {
      const head = h('tr', {}, h('th', { rowspan: 2 }, 'Present state'), showCode ? h('th', { rowspan: 2 }, 'Code') : null,
        h('th', { colspan: st.combos.length }, `Next state, for the inputs ${st.inputs || '—'}`),
        M().type === 'mealy' ? h('th', { colspan: st.combos.length }, `Outputs ${st.outputs}`) : h('th', { rowspan: 2 }, `Outputs ${st.outputs}`));
      const head2 = h('tr', {}, ...st.combos.map((c) => h('th', { class: 'mono' }, c)), ...(M().type === 'mealy' ? st.combos.map((c) => h('th', { class: 'mono' }, c)) : []));
      const t2 = h('table', { class: 'fsm-table fsm-stable' }, head, head2,
        ...st.rows.map((r) => h('tr', {}, h('td', {}, r.state), showCode ? h('td', { class: 'mono' }, r.code) : null, ...r.next.map((n) => h('td', {}, n)),
          ...(M().type === 'mealy' ? r.outputs.map((o) => h('td', { class: 'mono' }, o)) : [h('td', { class: 'mono' }, r.moore)]))));
      const csv = [['Present state', 'Code', ...st.combos.map((c) => `next (${st.inputs}=${c})`), ...(M().type === 'mealy' ? st.combos.map((c) => `outputs (${st.inputs}=${c})`) : ['outputs'])],
        ...st.rows.map((r) => [r.state, r.code, ...r.next, ...(M().type === 'mealy' ? r.outputs : [r.moore])])];
      wrap.append(h('div', { class: 'fsm-tcap' }, h('b', {}, 'State table'), csvButton(`${M().name}_states.csv`, csv)), t2);
    }
    // encoded table
    const et = encodedTable(M());
    if (et.error) wrap.append(h('div', { class: 'fsm-tcap' }, h('b', {}, 'Encoded transition table')), h('p', { class: 'asm-muted' }, et.error));
    else {
      const cols = [...et.stateBits, ...et.inputBits, ...et.nextBits, ...et.outputBits];
      const t3 = h('table', { class: 'fsm-table fsm-etable' },
        h('tr', {}, h('th', { colspan: et.stateBits.length }, 'Present state'), et.inputBits.length ? h('th', { colspan: et.inputBits.length }, 'Inputs') : null,
          h('th', { colspan: et.nextBits.length }, 'Next state'), et.outputBits.length ? h('th', { colspan: et.outputBits.length }, 'Outputs') : null, h('th', { rowspan: 2 }, '')),
        h('tr', {}, ...cols.map((c) => h('th', { class: 'mono' }, c))),
        ...et.rows.map((r) => h('tr', { class: r.unused ? 'unused' : '' }, ...[...r.q, ...r.in, ...r.d, ...r.out].map((b, i) => h('td', { class: `mono${i === et.stateBits.length + et.inputBits.length ? ' sepl' : ''}` }, b)),
          h('td', { class: 'fsm-note' }, r.unused ? 'unused code' : `${r.state} → ${r.next}`))));
      const csv = [cols, ...et.rows.map((r) => [...r.q, ...r.in, ...r.d, ...r.out])];
      wrap.append(h('div', { class: 'fsm-tcap' }, h('b', {}, 'Encoded transition table'), csvButton(`${M().name}_encoded.csv`, csv),
        btn('Create Boolean Algebra', 'Create Boolean Algebra sources (.tt.json) of the next-state bits and of the outputs, to simplify them with Karnaugh maps', () => opts.onTruthTables?.(), 'asm-small fsm-mktt')),
      h('p', { class: 'asm-muted' }, `${et.stateBits.join(' ')}: present state (flip-flop outputs), ${et.nextBits.join(' ')}: next state (D flip-flop inputs). Unused codes: X (don't care).`), t3);
    }
    panelBody.append(wrap);
  }

  // ---------------------------------------------------------------------------- simulation
  function resetSim() {
    stopRun();
    const inputs = Object.fromEntries(M().inputs.map((i) => [i.name, sim()?.inputs?.[i.name] ?? 0]));
    setSim({ state: M().initial, inputs, trace: [], cycle: 0, timer: null });
  }
  function stopRun() { if (sim()?.timer) { clearInterval(sim().timer); sim().timer = null; } }
  function clockStep() {
    if (!sim() || !stateById(sim().state)) resetSim();
    const r = stepFsm(M(), sim().state, sim().inputs);
    sim().trace.push({ cycle: sim().cycle, state: stateById(sim().state)?.name, inputs: { ...sim().inputs }, outputs: r.outputs, next: stateById(r.next)?.name });
    if (sim().trace.length > 200) sim().trace.shift();
    sim().state = r.next; sim().cycle++;
    render(); renderPanel();
  }
  // the simulation's controls (⟲ Reset, Clock ↑, Run / Stop, the inputs) are made once and kept: drawn
  // again at every clock edge of Run, a click on ■ Stop or on an input whose press and release fell on
  // each side of an edge went to an element no longer there, and was lost (#240)
  const runBtn = btn('▶ Run', 'Apply a clock edge every second', () => {
    if (sim().timer) stopRun(); else sim().timer = setInterval(() => { if (destroyed() || panel() !== 'sim') return stopRun(); clockStep(); }, 1000);
    renderPanel();
  }, 'asm-small');
  const simTools = [btn('⟲ Reset', 'Back to the initial state', () => { resetSim(); render(); renderPanel(); }, 'asm-small fsm-sim-reset'),
    btn('Clock ↑', 'Apply one rising clock edge: the machine takes the transition shown in color', () => clockStep(), 'asm-small asm-primary fsm-sim-step'), runBtn];
  const simState = h('b', { class: 'fsm-sim-state' });
  const simNext = h('span', { class: 'asm-muted' });
  const simOuts = h('div', { class: 'fsm-sim-outputs' });
  const simTrace = h('div', { class: 'fsm-sim-trace' });
  let simIns = null;   // { key: the inputs (names, widths), el: their controls, set(): the controls show sim.inputs }
  function simInputs() {
    const key = JSON.stringify(M().inputs.map((i) => [i.name, i.width]));
    if (simIns?.key !== key) {
      const sets = [];
      const el = h('div', { class: 'fsm-sim-inputs' }, ...M().inputs.map((i) => {
        if (i.width === 1) {
          const b = h('button', { type: 'button', class: 'asm-btn fsm-bit', 'data-input': i.name, title: 'Click to toggle the input' });
          b.addEventListener('click', () => { sim().inputs[i.name] = sim().inputs[i.name] ? 0 : 1; render(); renderPanel(); });
          sets.push(() => {
            const t = `${i.name} = ${sim().inputs[i.name]}`;
            if (b.textContent !== t) b.textContent = t;
            b.classList.toggle('on', !!sim().inputs[i.name]);
          });
          return b;
        }
        const e = h('input', { type: 'number', class: 'asm-input fsm-bus', min: 0, max: 2 ** i.width - 1, 'data-input': i.name });
        e.addEventListener('change', () => { sim().inputs[i.name] = clamp(parseInt(e.value, 10) || 0, 0, 2 ** i.width - 1); render(); renderPanel(); });
        sets.push(() => { if (document.activeElement !== e) e.value = String(sim().inputs[i.name]); });
        return h('label', { class: 'fsm-busl' }, `${i.name} = `, e);
      }));
      simIns = { key, el, set: () => sets.forEach((f) => f()) };
    }
    simIns.set();
    return simIns.el;
  }
  let simView = null;   // the panel's body while simulating: its rows, kept
  function renderSim() {
    panelTitle.textContent = 'Simulation';
    if (!sim()) resetSim();
    for (const i of M().inputs) if (!(i.name in sim().inputs)) sim().inputs[i.name] = 0;
    const errs = diags().filter((d) => d.severity === 'error');
    if (errs.length) {
      panelTools.textContent = '';
      panelBody.replaceChildren(h('p', { class: 'asm-muted c-err' }, 'Correct the errors of the diagram to simulate it.'));
      return;
    }
    const r = stepFsm(M(), sim().state, sim().inputs);
    const runLabel = sim().timer ? '■ Stop' : '▶ Run';
    if (runBtn.dataset.label !== runLabel) { runBtn.dataset.label = runLabel; runBtn.textContent = runLabel; }
    if (panelTools.firstChild !== simTools[0] || panelTools.childNodes.length !== simTools.length) panelTools.replaceChildren(...simTools);
    const ins = simInputs();
    const insRow = ins.parentNode?.classList.contains('fsm-sim-row') ? ins.parentNode : null;
    if (!simView || !insRow || insRow.parentNode !== simView) {
      simView = h('div', { class: 'fsm-sim' },
        h('div', { class: 'fsm-sim-row' }, h('span', { class: 'asm-label' }, 'State'), simState, simNext),
        h('div', { class: 'fsm-sim-row' }, h('span', { class: 'asm-label' }, 'Inputs'), ins),
        h('div', { class: 'fsm-sim-row' }, h('span', { class: 'asm-label' }, 'Outputs'), simOuts),
        simTrace);
    }
    if (panelBody.firstChild !== simView || panelBody.childNodes.length !== 1) panelBody.replaceChildren(simView);
    const cur = stateById(sim().state);
    simState.textContent = cur?.name ?? '?';
    simNext.textContent = r.transition ? `next clock edge → ${stateById(r.next)?.name}` : `no transition is true: stays in ${cur?.name ?? '?'}`;
    simOuts.replaceChildren(...M().outputs.map((o) => h('span', { class: `fsm-led${r.outputs[o.name] ? ' on' : ''}`, 'data-output': o.name },
      `${o.name} = ${o.width === 1 ? r.outputs[o.name] : r.outputs[o.name].toString(2).padStart(o.width, '0')}`)));
    simTrace.replaceChildren(...(sim().trace.length ? [h('table', { class: 'fsm-table fsm-trace' },
      h('tr', {}, h('th', {}, 'Cycle'), h('th', {}, 'State'), h('th', {}, 'Inputs'), h('th', {}, 'Outputs'), h('th', {}, 'Next state')),
      ...sim().trace.slice(-12).reverse().map((x) => h('tr', {}, h('td', {}, String(x.cycle)), h('td', {}, x.state), h('td', { class: 'mono' }, Object.entries(x.inputs).map(([k, v]) => `${k}=${v}`).join(' ')),
        h('td', { class: 'mono' }, Object.entries(x.outputs).map(([k, v]) => `${k}=${v}`).join(' ')), h('td', {}, x.next))))] : []));
  }

  return { renderPanel, resetSim, stopRun, togglePanel };
}
