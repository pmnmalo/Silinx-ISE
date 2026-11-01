// The state diagram editor's history (#405: out of mountFsmEditor in fsm-editor.js): a change committed (the diagram
// normalized, an undo step, a quick run of the same edit merged into one, onChange told a moment later), undo and
// redo, and the toolbar's state.
import { normalizeFsm } from '/core/fsm.js';
import { clone } from './fsm-editor.js';

/** { commit, redo, undo, updateToolbar } of mountFsmEditor (M(), destroyed(), hi(), hist(), lastKey(), lastT(), panel(), sel(): its current values). */
export function mountFsmHistory(ctx) {
  const {
    opts, M, delBtn, destroyed, encSel, hi, hist, lastKey, lastT, panel, render, renderPanel,
    renderSide, sel, stateById, statusInfo, styleSel, tabBtns, timers, transById, typeSel, validateSoon, setM,
    setHist, setHi, setLastKey, setLastT, setSel
  } = ctx;

  // ---------------------------------------------------------------------------- history
  function commit(key) {
    setM(normalizeFsm(M()));
    const snap = JSON.stringify(M());
    if (snap !== hist()[hi()]) {
      const now = Date.now();
      if (key && key === lastKey() && now - lastT() < 1500 && hi() > 0) hist()[hi()] = snap;
      else { setHist(hist().slice(0, hi() + 1)); hist().push(snap); setHi(hi() + 1); if (hist().length > 300) { hist().shift(); setHi(hi() - 1); } }
      setLastKey(key); setLastT(now);
      clearTimeout(timers.change);
      timers.change = setTimeout(() => { if (!destroyed()) opts.onChange?.(clone(M())); }, 250);
    }
    render();
    validateSoon();
    updateToolbar();
    if (panel()) renderPanel();
  }
  function restore(i) {
    setHi(i);
    setM(JSON.parse(hist()[hi()]));
    setLastKey(null);
    if (sel() && !(sel().type === 'state' ? stateById(sel().id) : transById(sel().id))) setSel(null);
    render(); renderSide(); validateSoon(); updateToolbar(); if (panel()) renderPanel();
    clearTimeout(timers.change);
    timers.change = setTimeout(() => { if (!destroyed()) opts.onChange?.(clone(M())); }, 250);
  }
  const undo = () => { if (hi() > 0) restore(hi() - 1); };
  const redo = () => { if (hi() < hist().length - 1) restore(hi() + 1); };
  function updateToolbar() {
    delBtn.disabled = !sel();
    typeSel.value = M().type; encSel.value = M().encoding; styleSel.value = M().style;
    for (const [k, b] of Object.entries(tabBtns)) b.classList.toggle('on', panel() === k);
    statusInfo.textContent = `${M().states.length} state(s), ${M().transitions.length} transition(s) · ${M().type === 'mealy' ? 'Mealy' : 'Moore'}`;
  }

  return { commit, redo, undo, updateToolbar };
}
