// The schematic editor's Try it (#405: out of mountSchEditor in sch-editor.js): the drawing's live simulation
// started (web/js/sch-live.js on core/schlive.js) and left, and the problems of a check shown: in the Tasks
// interface's console (a cancelable silinx-diagnostics event, #993) or in the editor's own panel, each one taking the
// view to what it is about.
import { h } from './dom.js';
import { symbolBox } from '/core/schdoc.js';
import { KEYS, clone } from './sch-editor.js';

/** { enterSim, leaveSim, showDiags } of mountSchEditor (destroyed(), doc(), genLang(), lastDiags(), live(), liveStarting(), modules(), nl(), sel(), tool(), view(), wireDraw(): its current values). */
export function mountSchTry(ctx) {
  const {
    container, opts, canSim, canvas, centerOn, contentG, destroyed, diagPanel, doc, finishWire, flash, genLang, hint,
    lastDiags, live, liveStarting, modules, nl, render, renderProps, sel, setTool, simBar, simG, tool, updateStatus,
    view, wireDraw, setLive, setLiveStarting, setLastDiags, setSel
  } = ctx;

  // ---------------- live simulation (Logisim style): web/js/sch-live.js on core/schlive.js
  const toCanvas = pt => ({ x: pt.x * view().s + view().tx, y: pt.y * view().s + view().ty });
  async function enterSim() {
    if (live() || liveStarting() || !canSim || destroyed()) return;
    if (wireDraw()) finishWire();
    if (tool() !== 'select') setTool('select');
    setLiveStarting(true);
    flash('Building the circuit\'s model…');
    try {
      const [{ startLiveSim }, sources] = await Promise.all([import('./sch-live.js'), Promise.resolve(opts.simSources ? opts.simSources() : [])]);
      if (destroyed() || live()) return;
      const res = startLiveSim({
        doc: clone(doc()), modules: modules(), sources: sources || [], lang: opts.simLang || genLang(), generics: opts.simGenerics?.(), h,
        layer: simG, content: contentG, bar: simBar, canvas, toCanvas, onExit: leaveSim,
      });
      if (!res.ok) {
        setLastDiags(res.diagnostics?.length ? res.diagnostics : res.errors.map(message => ({ severity: 'error', message })));
        showDiags('Cannot try it out');
        flash(`Cannot try it out: ${res.errors[0]}`);
        updateStatus();
        return;
      }
      setLive(res.ctl);
      sel().clear();
      diagPanel.hidden = true;
      hint.hidden = true;
      container.classList.add('sim-mode');
      render(); renderProps();
      opts.onSimulate?.(true);
    } catch (err) {
      console.error(err);
      flash(`Cannot try it out: ${err.message}`);
    } finally { setLiveStarting(false); }
  }
  function leaveSim() {
    if (!live()) return;
    live().destroy();
    setLive(null);
    container.classList.remove('sim-mode');
    render(); renderProps();
    opts.onSimulate?.(false);
    container.focus({ preventScroll: true });
  }
  function showDiags(what = 'Check Schematic') {
    if (!container.dispatchEvent(new CustomEvent('silinx-diagnostics', { bubbles: true, cancelable: true, detail: { what, name: doc().name, diags: lastDiags(), focus: focusDiag } }))) { diagPanel.hidden = true; return; }   // (in the console below: the Tasks interface's, web/js/tasks-check.js, #993)
    diagPanel.hidden = false; diagPanel.innerHTML = '';
    const errs = lastDiags().filter(d => d.severity === 'error').length, warns = lastDiags().filter(d => d.severity === 'warning').length;
    const head = h('div', { class: 'se-cap' }, h('span', { text: `${what}: ${errs} error(s), ${warns} warning(s)` }), h('span', { class: 'sp' }), h('button', { type: 'button', class: 'se-x', title: 'Close', text: '×', onclick: () => { diagPanel.hidden = true; } }));
    const list = h('div', { class: 'se-dlist' });
    if (!lastDiags().length) list.append(h('div', { class: 'se-drow ok', text: 'No errors or warnings found.' }));
    for (const d of lastDiags()) {
      const row = h('div', { class: `se-drow ${d.severity}` }, h('span', { class: 'sev', text: d.severity === 'error' ? 'ERROR' : d.severity === 'warning' ? 'WARNING' : 'INFO' }), h('span', { text: d.message }));
      row.addEventListener('click', () => focusDiag(d));
      list.append(row);
    }
    diagPanel.append(head, list);
  }
  function focusDiag(d) {
    const r = d.ref || {};
    const k = r.kind === 'symbol' ? 'sym' : r.kind;
    if (k && KEYS[k] && r.id && doc()[KEYS[k]].some(o => o.id === r.id)) setSel(new Set([`${k}:${r.id}`]));
    let x = d.x, y = d.y;
    if (x == null && r.kind === 'symbol') { const s = doc().symbols.find(o => o.id === r.id); if (s) { const b = symbolBox(s, modules()); x = b.x + b.w / 2; y = b.y + b.h / 2; } }
    if (x == null && r.kind === 'port') { const p = doc().ports.find(o => o.id === r.id); if (p) { x = p.x; y = p.y; } }
    if (x == null && d.net && nl()) { const n = nl().nets.find(q => q.name === d.net); const w = n && doc().wires.find(q => q.id === n.wires[0]); if (w) { x = w.points[0].x; y = w.points[0].y; } }
    if (x != null) centerOn(x, y);
    render(); renderProps();
  }

  return { enterSim, leaveSim, showDiags };
}
