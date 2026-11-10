// The schematic editor's edits (#405: out of mountSchEditor in sch-editor.js): an edit made (the drawing normalized,
// an undo step when it changed, onChange told a moment later), Undo and Redo, the selection pruned after them, and new
// ids and instance names.
import { normalizeDoc, netlist } from '/core/schdoc.js';
import { markerDirections } from '/core/schdoc-markers.js';
import { autoInstName } from '/core/schname.js';
import { KEYS, clone } from './sch-editor.js';

/** { changed, edit, nextId, nextInstName, pruneSel, pushUndo, redo, snapshot, undo } of mountSchEditor (changeTimer(), destroyed(), doc(), lastDiags(), live(), sel(): its current values). */
export function mountSchEdits(ctx) {
  const {
    opts, changeTimer, destroyed, doc, lastDiags, live, modules, readOnly, redoStack, render, renderProps, sel, undoStack,
    setDoc, setLastDiags, setChangeTimer
  } = ctx;
  // the netlist of a drawing, null when it cannot be made (the markers' directions then left as they are)
  const nlOf = d => { try { return netlist(d, { modules: modules() }); } catch { return null; } };

  // ---------------- edits, undo, change notification
  const snapshot = () => JSON.stringify(doc());
  function edit(fn, { keepProps = false } = {}) {
    if (readOnly || live()) return;
    const before = snapshot();
    const nlBefore = nlOf(doc());
    fn();
    setDoc(normalizeDoc(doc()));
    // an I/O marker the edit connected to symbols' pins takes their direction (#1109), in the same undo step
    const dirs = nlBefore ? markerDirections(doc(), nlBefore, nlOf(doc())) : [];
    for (const { port, dir } of dirs) doc().ports.find(p => p.id === port).dir = dir;
    if (dirs.length) setDoc(normalizeDoc(doc()));
    if (snapshot() !== before) { pushUndo(before); changed(); }
    render();
    if (!keepProps) renderProps();
  }
  function pushUndo(before) { undoStack.push(before); if (undoStack.length > 300) undoStack.shift(); redoStack.length = 0; }
  function changed() {
    setLastDiags(null);
    clearTimeout(changeTimer());
    setChangeTimer(setTimeout(() => { if (!destroyed()) opts.onChange?.(clone(doc())); }, 300));
  }
  function undo() {
    if (!undoStack.length || live()) return;
    redoStack.push(snapshot());
    setDoc(normalizeDoc(JSON.parse(undoStack.pop())));
    pruneSel(); changed(); render(); renderProps();
  }
  function redo() {
    if (!redoStack.length || live()) return;
    undoStack.push(snapshot());
    setDoc(normalizeDoc(JSON.parse(redoStack.pop())));
    pruneSel(); changed(); render(); renderProps();
  }
  function pruneSel() { for (const k of [...sel()]) { const [kind, id] = k.split(/:(.*)/s); if (!doc()[KEYS[kind]]?.some(o => o.id === id)) sel().delete(k); } }
  function nextId(prefix, arr) { let n = 0; for (const o of arr) { const m = new RegExp(`^${prefix}(\\d+)$`).exec(o.id); if (m) n = Math.max(n, +m[1]); } return `${prefix}${n + 1}`; }
  const nextInstName = () => autoInstName(doc());   // (inst_n, #311)

  return { changed, edit, nextId, nextInstName, pruneSel, pushUndo, redo, snapshot, undo };
}
