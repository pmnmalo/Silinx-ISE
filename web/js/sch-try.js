// The schematic editor's Try it (#405: out of mountSchEditor in sch-editor.js): the drawing's live simulation
// started (web/js/sch-live.js on core/schlive.js) and left, and the problems of a check or of a refused Try it shown in
// the console, in every interface (a silinx-diagnostics event: web/js/tasks-check.js, #993, #2805), each one taking the
// view to what it is about.
import { h } from './dom.js';
import { symbolBox } from '/core/schdoc.js';
import { KEYS, clone } from './sch-editor.js';

/** { enterSim, leaveSim, showDiags } of mountSchEditor (destroyed(), doc(), genLang(), lastDiags(), live(), liveStarting(), modules(), nl(), sel(), tool(), view(), wireDraw(): its current values). */
export function mountSchTry(ctx) {
  const {
    container, opts, canSim, canvas, centerOn, contentG, destroyed, doc, finishWire, flash, genLang, hint,
    lastDiags, live, liveStarting, modules, nl, render, renderProps, sel, setTool, simBar, simG, tool, updateStatus,
    view, wireDraw, setLive, setLiveStarting, setLastDiags, setSel
  } = ctx;

  // ---------------- live simulation (Logisim style): web/js/sch-live.js on core/schlive.js
  // the inputs' values of the last Try it of this schematic, for the next one (#2106): in memory, while it is open
  let lastInputs = null;
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
        layer: simG, content: contentG, bar: simBar, canvas, toCanvas, onExit: leaveSim, inputs: lastInputs,
      });
      if (!res.ok) {
        setLastDiags(res.diagnostics?.length ? res.diagnostics : res.errors.map(message => ({ severity: 'error', message })));
        hint.hidden = true;
        showDiags('Try it');
        updateStatus();
        return;
      }
      setLive(res.ctl);
      sel().clear();
      hint.hidden = true;
      container.classList.add('sim-mode');
      render(); renderProps();
      opts.onSimulate?.(true);
    } catch (err) {
      console.error(err);
      setLastDiags([{ severity: 'error', message: err.message }]);
      showDiags('Try it');
    } finally { setLiveStarting(false); }
  }
  function leaveSim() {
    if (!live()) return;
    lastInputs = live().inputValues();
    live().destroy();
    setLive(null);
    container.classList.remove('sim-mode');
    render(); renderProps();
    opts.onSimulate?.(false);
    container.focus({ preventScroll: true });
  }
  function showDiags(what = 'Check Schematic') {
    container.dispatchEvent(new CustomEvent('silinx-diagnostics', { bubbles: true, detail: { what, name: doc().name, diags: lastDiags(), focus: focusDiag } }));
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
