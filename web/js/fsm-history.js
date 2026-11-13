// The state diagram editor's history (#405: out of mountFsmEditor in fsm-editor.js): a change committed (the diagram
// normalized, an undo step, a quick run of the same edit merged into one, onChange told a moment later), undo and
// redo, and the toolbar's state. A diagram edited live (#3183, shared(): web/js/collab-drawing.js) has the shared
// history instead: each change pushed to it at once, Undo and Redo this participant's own changes.
import { normalizeFsm } from '/core/fsm.js';
import { clone, FSM_ENCODING_NAMES } from './fsm-editor.js';

/** { applyModel, commit, redo, setShared, undo, updateToolbar } of mountFsmEditor (M(), destroyed(), hi(), hist(), lastKey(), lastT(), panel(), sel(): its current values). */
export function mountFsmHistory(ctx) {
  const {
    opts, M, delBtn, destroyed, encSel, hi, hist, lastKey, lastT, panel, render, renderPanel,
    renderSide, sel, stateById, status, styleSel, tabBtns, timers, transById, validateSoon, setM,
    setHist, setHi, setLastKey, setLastT, setSel, shared = () => null, setSharedRef = () => {}, simGone = () => {},
    locked = () => false, lockable = () => []
  } = ctx;
  const changed = () => { clearTimeout(timers.change); timers.change = setTimeout(() => { if (!destroyed()) opts.onChange?.(clone(M())); }, 250); };

  // ---------------------------------------------------------------------------- history
  function commit(key) {
    setM(normalizeFsm(M()));
    const snap = JSON.stringify(M());
    if (snap !== hist()[hi()]) {
      const now = Date.now();
      if (shared()) { setHist([snap]); setHi(0); shared().push(clone(M()), key); }   // (its merge may change M)
      else if (key && key === lastKey() && now - lastT() < 1500 && hi() > 0) hist()[hi()] = snap;
      else { setHist(hist().slice(0, hi() + 1)); hist().push(snap); setHi(hi() + 1); if (hist().length > 300) { hist().shift(); setHi(hi() - 1); } }
      setLastKey(key); setLastT(now);
      changed();
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
    changed();
  }
  const undo = () => { if (locked()) return; if (shared()) shared().undo(); else if (hi() > 0) restore(hi() - 1); };
  const redo = () => { if (locked()) return; if (shared()) shared().redo(); else if (hi() < hist().length - 1) restore(hi() + 1); };
  function updateToolbar() {
    // (the tools that change the diagram disabled while it is locked: in Try it, #3793)
    delBtn.disabled = !sel() || locked();
    for (const b of lockable()) b.disabled = locked();
    encSel.value = M().encoding; styleSel.value = M().style;
    for (const [k, b] of Object.entries(tabBtns)) b.classList.toggle('on', panel() === k);
    status.set([{ text: `${M().states.length} state(s), ${M().transitions.length} transition(s)`, cls: 'fsm-info' },
      M().type === 'mealy' ? 'Mealy' : 'Moore', `Encoding: ${FSM_ENCODING_NAMES[M().encoding] || M().encoding}`]);
  }

  // edited live (#3183, web/js/collab-drawing.js): each change pushed to the shared history, Undo / Redo its; null: the
  // editor's own history again, from the diagram as it is
  function setShared(s) { setSharedRef(s); setHist([JSON.stringify(M())]); setHi(0); setLastKey(null); updateToolbar(); }
  // the merged diagram, applied in place: the view, the selection (its object's id renamed by the merge, `renamed`) and a
  // text being typed in place kept; mine: this participant's own change (an undo), onChange told
  function applyModel(m, { renamed = null, mine = false } = {}) {
    setM(normalizeFsm(m));
    setHist([JSON.stringify(M())]); setHi(0);
    if (sel() && renamed?.has(sel().id)) setSel({ ...sel(), id: renamed.get(sel().id) });
    if (sel() && !(sel().type === 'state' ? stateById(sel().id) : transById(sel().id))) setSel(null);
    simGone();
    render(); renderSide(); validateSoon(); updateToolbar(); if (panel()) renderPanel();
    if (mine) changed();
  }

  return { applyModel, commit, redo, setShared, undo, updateToolbar };
}
