// The Petri net editor's bottom panel (#405: out of mountPetriEditor in petri-editor.js): the simulation (the token
// game, clock steps, run, the inputs, the outputs and the marking, the log) and the
// analysis (#188: boundedness, deadlocks, liveness, reversibility, the invariants, the reachability graph).
import { analyzePetri } from '/core/petri-analysis.js';
import { clockStep, enabledTransitions, fire, initialMarking, isDeadlock, outputsOf } from '/core/petri.js';
import { h } from './ui.js';

/** { analysis, envOf, fireOne, renderPanel, resetSim, togglePanel } of mountPetriEditor (M(), destroyed(), panel(), sim(): its current values). */
export function mountPetriSim(ctx) {
  const {
    M, bottom, btn, destroyed, panel, panelBody, panelTitle, panelTools, render, sim, status, tabBtns, transOf, setSim,
    setPanel
  } = ctx;

  // ---------------------------------------------------------------- simulation panel
  const envOf = () => Object.fromEntries(M().inputs.map(i => [i.name, BigInt(sim()?.inputs[i.name] ?? 0)]));
  function resetSim(rerender = true) {
    if (sim()?.timer) clearInterval(sim().timer);
    setSim({ marking: initialMarking(M()), fired: [], inputs: sim()?.inputs || {}, log: [], timer: null });
    if (rerender) render();
  }
  function togglePanel(which) {
    setPanel(panel() === which ? null : which);
    bottom.hidden = !panel();
    for (const [k, b] of Object.entries(tabBtns)) b.classList.toggle('active', k === panel());
    if (panel() === 'sim' && !sim()) resetSim(false);
    if (panel() !== 'sim' && sim()) { if (sim().timer) clearInterval(sim().timer); setSim(null); }
    render();
  }
  const say = (msg) => { sim().log.unshift(msg); sim().log.length = Math.min(sim().log.length, 50); };
  function fireOne(tid) {
    const ok = enabledTransitions(M(), sim().marking, envOf()).includes(tid);
    if (!ok) { status(`${transOf(tid)?.name}: not enabled${enabledTransitions(M(), sim().marking, null).includes(tid) ? ' (its guard is false)' : ''}`, true); return; }
    sim().marking = fire(M(), sim().marking, tid); sim().fired = [tid];
    say(`fire ${transOf(tid).name}`);
    status('');
    render();
  }
  function step() {
    const r = clockStep(M(), sim().marking, envOf());
    sim().marking = r.marking; sim().fired = r.fired;
    say(r.fired.length ? `clock: ${r.fired.map(id => transOf(id).name).join(', ')}` : 'clock: nothing fires');
    render();
  }
  function randomFire() {
    const en = enabledTransitions(M(), sim().marking, envOf());
    if (!en.length) { status(isDeadlock(M(), sim().marking) ? 'Deadlock: no transition can fire' : 'No transition is enabled with these inputs', true); return; }
    fireOne(en[Math.floor(Math.random() * en.length)]);
  }
  // the simulation's controls (its buttons, the inputs) are made once and kept: drawn again at every
  // clock step of Run, a click on ■ Stop or on an input whose press and release fell on each side of
  // a step went to an element no longer there, and was lost
  const runBtn = btn('▶▶ Run', 'Clock steps every half second', () => {
    if (sim().timer) { clearInterval(sim().timer); sim().timer = null; } else sim().timer = setInterval(() => { if (!destroyed() && sim()) step(); }, 500);
    render();
  });
  const simTools = [btn('⏭ Clock step', 'A clock edge: every enabled transition whose guard is true fires (priority order), as the hardware does', () => step()),
    btn('🎲 Random', 'Fire one enabled transition at random (the token game)', () => randomFire()), runBtn,
    btn('⟲ Reset', 'Back to the initial marking', () => { sim().inputs = sim().inputs || {}; resetSim(); })];
  const simLive = h('div', { class: 'pn-sim-live' });
  let simIns = null;   // { key: the inputs (names, widths), row, set(): the controls show sim.inputs }
  function simInputs() {
    const key = JSON.stringify(M().inputs.map(i => [i.name, i.width]));
    if (simIns?.key !== key) {
      const sets = [];
      const ins = h('div', { class: 'pn-sim-ins' }, ...M().inputs.map(i => {
        if (i.width === 1) {
          const c = h('input', { type: 'checkbox' });
          c.addEventListener('change', () => { sim().inputs[i.name] = c.checked ? 1 : 0; render(); });
          sets.push(() => { c.checked = !!sim().inputs[i.name]; });
          return h('label', { class: 'asm-check' }, c, ` ${i.name}`);
        }
        const n = h('input', { type: 'number', class: 'asm-input pn-num', min: '0', max: String((1 << i.width) - 1) });
        n.addEventListener('change', () => { sim().inputs[i.name] = Math.max(0, Math.min((1 << i.width) - 1, +n.value || 0)); render(); });
        sets.push(() => { if (document.activeElement !== n) n.value = String(sim().inputs[i.name] ?? 0); });
        return h('label', { class: 'asm-field pn-inline' }, h('span', { class: 'asm-label' }, i.name), n);
      }));
      simIns = { key, row: h('div', { class: 'pn-sim-row' }, h('b', {}, 'Inputs: '), M().inputs.length ? ins : h('span', {}, 'none')), set: () => sets.forEach(f => f()) };
    }
    simIns.set();
    return simIns.row;
  }
  function renderPanel() {
    if (!panel()) return;
    if (panel() !== 'sim') { panelTools.replaceChildren(); panelBody.replaceChildren(); }
    if (panel() === 'analysis') { renderAnalysis(); return; }
    panelTitle.textContent = 'Simulation';
    const runLabel = sim().timer ? '■ Stop' : '▶▶ Run';
    if (runBtn.dataset.label !== runLabel) { runBtn.dataset.label = runLabel; runBtn.textContent = runLabel; }
    if (panelTools.firstChild !== simTools[0]) panelTools.replaceChildren(...simTools);
    const insRow = simInputs();
    if (panelBody.firstChild !== insRow || panelBody.lastChild !== simLive) panelBody.replaceChildren(insRow, simLive);
    const outs = outputsOf(M(), sim().marking, sim().fired);
    const dead = isDeadlock(M(), sim().marking);
    simLive.replaceChildren(...[
      h('div', { class: 'pn-sim-row' }, h('b', {}, 'Outputs: '), h('span', { class: 'mono pn-outs-now' }, Object.entries(outs).map(([k, v]) => `${k}=${v.toString(2)}`).join('  ') || 'none')),
      h('div', { class: 'pn-sim-row' }, h('b', {}, 'Marking: '), h('span', { class: 'mono pn-marking' }, M().places.map(p => `${p.name}=${sim().marking[p.id] || 0}`).join('  '))),
      dead ? h('div', { class: 'pn-sim-row pn-dead' }, 'Deadlock: no transition can fire, whatever the inputs') : null,
      h('div', { class: 'asm-label' }, 'Click an enabled transition (green: its guard is true) to fire it.'),
      h('ol', { class: 'pn-log' }, ...sim().log.map(l => h('li', {}, l)))].filter(Boolean));
  }

  // ---------------------------------------------------------------- analysis (#188)
  let anCache = null;
  function analysis() {
    const key = JSON.stringify([M().places, M().transitions, M().arcs]);
    if (anCache?.key !== key) anCache = { key, res: analyzePetri(M()) };
    return anCache.res;
  }
  const mark = mk => M().places.map(p => `${p.name}=${mk[p.id] || 0}`).join('  ');
  const sum = (w, list) => Object.entries(w).map(([id, k]) => `${k > 1 ? `${k}·` : ''}${list.find(x => x.id === id)?.name ?? id}`).join(' + ');
  function renderAnalysis() {
    panelTitle.textContent = 'Analysis';
    const a = analysis();
    const yes = (ok, txt) => h('span', { class: ok ? 'pn-ok' : 'pn-bad' }, txt);
    const maxB = Math.max(0, ...Object.values(a.bounds));
    const row = (k, v) => h('tr', {}, h('th', {}, k), h('td', {}, v));
    const showAt = mk => { if (panel() !== 'sim') togglePanel('sim'); sim().marking = { ...mk }; sim().fired = []; sim().log = []; say('analysis: a deadlock'); render(); };
    const states = a.states.length;
    panelBody.append(
      h('div', { class: 'asm-label' }, `The token game, whatever the inputs (the guards are not taken into account): ${states}${a.truncated ? '+' : ''} reachable marking${states === 1 ? '' : 's'}${a.truncated ? ` (stopped at ${a.maxStates}: the results are partial)` : ''}.`),
      h('table', { class: 'pn-an-props' },
        row('Bounded', a.safe ? yes(true, 'safe (at most 1 token in each place)') : yes(true, `${maxB}-bounded`)),
        row('Deadlocks', a.deadlockCount ? yes(false, `${a.deadlockCount} reachable marking${a.deadlockCount === 1 ? '' : 's'} where no transition can fire`) : yes(true, 'none')),
        row('Live', a.truncated ? 'unknown (partial graph)' : a.live ? yes(true, 'yes: every transition can always fire again') : yes(false, 'no')),
        row('Reversible', a.reversible == null ? 'unknown (partial graph)' : a.reversible ? yes(true, 'yes: the initial marking can always be reached again') : yes(false, 'no')),
        row('Conservative', a.conservative ? yes(true, 'yes: every place is in a P-invariant') : 'no')),
      h('div', { class: 'pn-an-title' }, 'Places'),
      h('table', { class: 'pn-an-table pn-an-places' }, h('tr', {}, h('th', {}, 'Place'), h('th', {}, 'Most tokens'), h('th', {}, 'Capacity'), h('th', {}, 'Bits needed')),
        ...M().places.map(p => { const b = a.bounds[p.id]; return h('tr', {}, h('td', {}, p.name), h('td', {}, String(b)), h('td', {}, String(p.capacity) + (b >= p.capacity && p.capacity > 0 ? ' (reached)' : '')), h('td', {}, b > 1 ? `${Math.ceil(Math.log2(b + 1))} bits` : '1 flip-flop')); })),
      h('div', { class: 'pn-an-title' }, 'Transitions'),
      h('table', { class: 'pn-an-table pn-an-trans' }, h('tr', {}, h('th', {}, 'Transition'), h('th', {}, '')),
        ...M().transitions.map(t => { const l = a.liveness[t.id]; return h('tr', {}, h('td', {}, t.name), h('td', {}, l === 'dead' ? yes(false, 'never fires') : l === 'live' ? yes(true, 'live') : 'can fire, but not always again')); })),
      ...(a.deadlocks.length ? [h('div', { class: 'pn-an-title' }, 'Deadlocks'),
        h('ul', { class: 'pn-an-dead' }, ...a.deadlocks.map(d => h('li', {}, h('span', { class: 'mono' }, mark(d.marking)), ` after ${d.path.length ? d.path.map(id => transOf(id)?.name).join(', ') : 'nothing (the initial marking)'} `,
          btn('Show', 'Simulate from this marking', () => showAt(d.marking), 'asm-small'))))] : []),
      h('div', { class: 'pn-an-title' }, 'P-invariants (weighted token sums that never change)'),
      h('ul', { class: 'pn-an-pinv mono' }, ...(a.pInvariants == null ? [h('li', {}, 'too many to compute')] : a.pInvariants.length ? a.pInvariants.map(v => h('li', {}, `${sum(v.weights, M().places)} = ${v.tokens}`)) : [h('li', {}, 'none')])),
      h('div', { class: 'pn-an-title' }, 'T-invariants (firing counts that bring a marking back)'),
      h('ul', { class: 'pn-an-tinv mono' }, ...(a.tInvariants == null ? [h('li', {}, 'too many to compute')] : a.tInvariants.length ? a.tInvariants.map(v => h('li', {}, sum(v, M().transitions))) : [h('li', {}, 'none')])),
      h('details', { class: 'pn-an-graph' }, h('summary', {}, `Reachability graph${states > 200 ? ' (the first 200 markings)' : ''}`),
        h('ol', { start: '0', class: 'mono' }, ...a.states.slice(0, 200).map(st => h('li', {}, mark(st.marking), st.succ.length ? `  →  ${st.succ.map(e => `${transOf(e.transition)?.name}: M${e.to}`).join(', ')}` : '  (deadlock)')))));
  }

  return { analysis, envOf, fireOne, renderPanel, resetSim, togglePanel };
}
