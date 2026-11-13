// The ASM chart editor's Try it panel (#2880, named as the schematic's, #3295), built as the state diagram's (fsm-bottom.js; its inputs' controls and
// its trace sim-panel.js's): the inputs and the reset, a clock edge (Clock ↑), Run and Stop at a chosen rate, a step
// back, Reset; on the chart the present state, the decisions tested and the exits followed this cycle, the conditional
// outputs reached and the next state (asm-render.js draws them from view()); the Moore and Mealy outputs, the registers
// and their next values, the last cycles. The semantics are core/asm-sim.js's, the generated HDL's. A chart that cannot
// be simulated is not: its errors go to the console (onErrors), the panel stays closed.
import { h } from './dom.js';
import { asmResetActive, asmSimEval, asmSimReset, asmSimStep, prepareAsmSim } from '/core/asm-sim.js';
import { simInputControls, simTraceTable } from './sim-panel.js';

const FOLD_KEY = 'silinx.asm.sim.folded';
const RATES = [1, 2, 5, 10];   // clock edges per second of Run
const readFold = () => { try { return localStorage.getItem(FOLD_KEY) === '1'; } catch { return false; } };
const writeFold = (v) => { try { localStorage.setItem(FOLD_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ } };

/** A value as the panel shows it: a bit 0 / 1, a vector in binary. */
const text = (v, w) => (w === 1 ? String(v) : v.toString(2).padStart(w, '0'));

/**
 * { panel (its element), isOpen(), toggle(), show(open), refresh(), view(), stop() } of an ASM chart editor:
 * M() its chart, btn its buttons' maker, render() draws the chart again, layout() after the panel changed the canvas's
 * size, onErrors(diags) the errors of a chart that cannot be simulated, simBtn the toolbar's Simulate button.
 */
export function mountAsmSim({ M, btn, render, layout, destroyed, onErrors, simBtn }) {
  let open = false;
  let prep = null;         // core/asm-sim.js prepareAsmSim's sim of the chart
  let sim = null;          // { st, inputs: {}, trace: [], past: [], cycle, timer, rate }
  let cur = null;          // asmSimEval of the present cycle
  let folded = readFold();

  // ------------------------------------------------------------------------ the panel
  const title = h('span', { class: 'asm-code-title' }, 'Try it');
  const runBtn = btn('▶ Run', 'Apply clock edges at the chosen rate', () => { if (sim.timer) stop(); else run(); update(); }, 'asm-small asm-sim-run');
  const rateSel = h('select', { class: 'asm-select asm-sim-rate', title: 'Clock edges per second of Run',
    onchange: () => { sim.rate = Number(rateSel.value); if (sim.timer) { stop(); run(); } } },
  ...RATES.map((r) => h('option', { value: String(r) }, `${r} Hz`)));
  const backBtn = btn('↶ Back', 'Undo the last clock edge', () => back(), 'asm-small asm-sim-back');
  const tools = h('span', { class: 'fsm-panel-tools' },
    btn('⟲ Reset', 'Back to the initial state', () => { reset(); update(); }, 'asm-small asm-sim-reset'),
    btn('Clock ↑', 'Apply one rising clock edge: the machine follows the path shown in color', () => step(), 'asm-small asm-primary asm-sim-step'),
    runBtn, rateSel, backBtn);
  const foldBtn = btn('▾', 'Fold / unfold the panel', () => { folded = !folded; writeFold(folded); fold(); }, 'asm-sim-fold');
  const state = h('b', { class: 'fsm-sim-state' });
  const next = h('span', { class: 'asm-muted asm-sim-next' });
  const outs = h('div', { class: 'fsm-sim-outputs' });
  const regs = h('div', { class: 'fsm-sim-outputs asm-sim-regs' });
  const regsRow = h('div', { class: 'fsm-sim-row' }, h('span', { class: 'asm-label' }, 'Registers'), regs);
  const trace = h('div', { class: 'fsm-sim-trace' });
  const inputs = simInputControls({
    inputs: () => [...M().inputs, { name: M().reset.name, width: 1, title: `The reset (active-${M().reset.active}, ${M().reset.sync ? 'synchronous' : 'asynchronous'}): click to toggle it` }],
    values: () => sim.inputs, changed: () => update(),
  });
  const insRow = h('div', { class: 'fsm-sim-row' }, h('span', { class: 'asm-label' }, 'Inputs'));
  const body = h('div', { class: 'fsm-panel-body' }, h('div', { class: 'fsm-sim' },
    h('div', { class: 'fsm-sim-row' }, h('span', { class: 'asm-label' }, 'State'), state, next),
    insRow,
    h('div', { class: 'fsm-sim-row' }, h('span', { class: 'asm-label' }, 'Outputs'), outs),
    regsRow, trace));
  const panel = h('div', { class: 'asm-codepanel fsm-panel asm-simpanel try-it', hidden: true },   // (green, as the schematic's Try it, #3798)
    h('div', { class: 'asm-codebar' }, title, tools, h('div', { class: 'asm-spacer' }), foldBtn, btn('✕', 'Close the panel', () => show(false))),
    body);
  function fold() {
    panel.classList.toggle('folded', folded);
    foldBtn.textContent = folded ? '▴' : '▾';
    requestAnimationFrame(() => { if (!destroyed()) layout(); });
  }
  fold();

  // ------------------------------------------------------------------------ the simulation
  const off = () => (M().reset.active === 'high' ? 0 : 1);
  function reset() {
    stop();
    const ins = Object.fromEntries(M().inputs.map((i) => [i.name, sim?.inputs?.[i.name] ?? 0]));
    sim = { st: asmSimReset(prep), inputs: { ...ins, [M().reset.name]: off() }, trace: [], past: [], cycle: 0, timer: null, rate: sim?.rate ?? 1 };
  }
  function step() {
    if (!sim) return;
    const r = asmSimStep(prep, sim.st, sim.inputs);
    const name = (id) => M().nodes.find((n) => n.id === id)?.name ?? '?';
    sim.past.push({ st: sim.st, traceLength: sim.trace.length, cycle: sim.cycle });
    if (sim.past.length > 200) sim.past.shift();
    sim.trace.push({ cycle: sim.cycle, state: name(r.cycle.state), next: name(r.st.state),
      inputs: Object.fromEntries(M().inputs.map((i) => [i.name, sim.inputs[i.name]])),
      outputs: Object.fromEntries(M().outputs.map((o) => [o.name, text(r.cycle.outputs[o.name], o.width)])) });
    if (sim.trace.length > 200) sim.trace.shift();
    sim.st = r.st; sim.cycle++;
    update();
  }
  function back() {
    const p = sim?.past.pop();
    if (!p) return;
    stop();
    sim.st = p.st; sim.cycle = p.cycle; sim.trace.length = Math.min(sim.trace.length, p.traceLength);
    update();
  }
  function run() { sim.timer = setInterval(() => { if (destroyed() || !open) return stop(); step(); }, 1000 / (sim.rate || 1)); }
  function stop() { if (sim?.timer) { clearInterval(sim.timer); sim.timer = null; } }

  /** Prepares the chart; false (its errors reported, the panel closed) when it cannot be simulated. */
  function prepare() {
    const r = prepareAsmSim(M());
    if (r.errors) { prep = null; onErrors(r.errors); return false; }
    prep = r.sim;
    return true;
  }
  function show(v) {
    if (v && !open) {
      if (!prepare()) return;
      open = true;
      reset();
    } else if (!v && open) {
      stop();
      open = false; sim = null; cur = null; prep = null;
    }
    panel.hidden = !open;
    simBtn.classList.toggle('active', open);
    requestAnimationFrame(() => { if (!destroyed()) layout(); });
    update();
  }
  /** The chart changed: simulated again (its present state kept while it is there), or closed if it has errors. */
  function refresh() {
    if (!open) return;
    if (!prepare()) { show(false); return; }
    if (!M().nodes.some((n) => n.id === sim.st.state && n.type === 'state')) reset();
    for (const i of M().inputs) if (!(i.name in sim.inputs)) sim.inputs[i.name] = 0;
    // (a register added or renamed: its reset value)
    const r0 = asmSimReset(prep);
    sim.st = { ...sim.st, regs: { ...r0.regs, ...Object.fromEntries(Object.entries(sim.st.regs).filter(([k]) => k in r0.regs)) },
      meta: { ...r0.meta, ...sim.st.meta }, sync: { ...r0.sync, ...sim.st.sync } };
    update();
  }

  // ------------------------------------------------------------------------ drawing
  function update() {
    cur = open && prep ? asmSimEval(prep, sim.st, sim.inputs) : null;
    render();
    if (!cur) return;
    const m = M();
    const name = (id) => m.nodes.find((n) => n.id === id)?.name ?? '?';
    const runLabel = sim.timer ? '■ Stop' : '▶ Run';
    if (runBtn.textContent !== runLabel) runBtn.textContent = runLabel;
    rateSel.value = String(sim.rate);
    backBtn.disabled = !sim.past.length;
    const ins = inputs();
    if (ins.parentNode !== insRow) insRow.append(ins);
    state.textContent = name(cur.state);
    const resetOn = asmResetActive(prep, sim.inputs);
    next.textContent = cur.reset ? `held in the reset state by ${m.reset.name}`
      : resetOn ? `next clock edge → ${name(prep.initial)} (reset by ${m.reset.name})`
        : `next clock edge → ${name(cur.next)}`;
    // the outputs, each with what drives it this cycle (its tip)
    const by = cur.by;
    const why = (o) => {
      if (o.registered) return 'Registered output: its present value';
      const n = m.nodes.find((x) => x.id === by[o.name]);
      if (!n) return 'Its default value';
      return n.type === 'state' ? `Moore output (state ${n.name})` : n.type === 'always' || cur.blocks.some((b) => b.outputs.includes(n.id)) ? 'Assigned by an every-cycle block' : 'Mealy output (a conditional output box)';
    };
    outs.replaceChildren(...m.outputs.map((o) => h('span', { class: `fsm-led${cur.outputs[o.name] ? ' on' : ''}`, 'data-output': o.name, title: why(o) },
      `${o.name} = ${text(cur.outputs[o.name], o.width)}`)));
    const rs = prep.regs;
    regsRow.hidden = !rs.length;
    regs.replaceChildren(...rs.map((r) => {
      const now = sim.st.regs[r.name], then = resetOn ? asmSimReset(prep).regs[r.name] : cur.assigned[r.name];
      return h('span', { class: `fsm-led asm-sim-reg${now !== then ? ' changes' : ''}`, 'data-register': r.name, title: 'Its value now → its value after the next clock edge' },
        `${r.name} = ${text(now, r.width)}${now !== then ? ` → ${text(then, r.width)}` : ''}`);
    }));
    trace.replaceChildren(...simTraceTable(sim.trace));
  }

  /** What the chart shows of the simulation (asm-render.js): the present state, the path, the outputs lit, the next state; null when closed. */
  function view() {
    if (!cur) return null;
    const blocks = cur.blocks;
    return {
      state: cur.state, next: asmResetActive(prep, sim.inputs) ? prep.initial : cur.next,
      nodes: new Set([...cur.path.nodes, ...blocks.flatMap((b) => [b.id, ...b.nodes])]),
      edges: new Set([...cur.path.edges, ...blocks.flatMap((b) => b.edges)]),
      lit: new Set([...cur.path.outputs, ...blocks.flatMap((b) => b.outputs)]),
    };
  }

  return { panel, isOpen: () => open, toggle: () => show(!open), show, refresh, view, stop, step };
}
