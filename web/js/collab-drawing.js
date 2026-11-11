// A shared project's drawings edited live (#3183, phase 3): an open drawing's editor bound to its structure in the
// project's document (core/collab-model.js), on the owner's page and on an editor's, as collab-bind.js binds a text
// editor to its Y.Text. The editor keeps its "model in, model out" interface:
// - each change it commits is pushed at once (putDrawing: what it changed since the model it last had, so that what the
//   others changed meanwhile is kept; its new objects' ids made its own);
// - the others' changes are applied in place (applyModel: its view, selection and tool kept), once a change under way
//   is done (a drag, a field being typed: busy());
// - each participant's own undo: a Y.UndoManager on the drawing's structure that tracks this binding's changes only, so
//   that Undo / Redo (the main toolbar's, the keys) undo this participant's changes, never the others';
// - a connection whose end another participant deleted (a transition to a state deleted at once) goes with it: taken
//   out of the structure and said in the console (nothing is changed silently); the editor's check runs on the merge.
//   bindDrawing(d, doc, path, { mine, say }) -> unbind()      keepDrawingsBound(bound, docs, doc, editable, opts)
import * as Y from 'yjs';
import { putDrawing, drawingModel, drawingMap, pruneDrawing, sameModel } from '/core/collab-model.js';

const RETRY_MS = 120, MERGE_MS = 1500;
/** The editor of a drawing edited live (#3183: a state diagram's, a truth table's, an ASM chart's, a Petri net's, a
 *  schematic's), null: none; modelOf(editor): its model (a schematic's, its document). */
export const editorOf = d => d?.fsmEditor || d?.ttEditor || d?.asmEditor || d?.petriEditor || d?.schEditor || null;
export const modelOf = ed => (ed.getModel ? ed.getModel() : ed.getDoc());
const same = sameModel;

/** A drawing's editor (d: its document, its editor editorOf(d)) bound to its structure; first made the same, the
 *  editor's into the structure (mine: the owner's, its unsaved changes kept) or the structure's into the editor. say(text):
 *  a line of the console (a connection removed with what it connected); accept(model): whether a merged model is shown
 *  (an editor's page: through the import gate). Returns unbind() (null: nothing to bind, no structure yet). */
export function bindDrawing(d, doc, path, { mine = false, say = () => {}, accept = () => true } = {}) {
  const ed = editorOf(d);
  if (!ed) return null;
  if (mine && (d.dirty || !drawingMap(doc, path))) putDrawing(doc, path, modelOf(ed));   // (the disk's is the structure's)
  const ymap = drawingMap(doc, path);
  if (!ymap) return null;
  const origin = { path }, prune = { prune: path };
  const um = new Y.UndoManager(ymap, { trackedOrigins: new Set([origin]), captureTimeout: MERGE_MS });
  let last = null, lastKey = null, timer = null, closed = false;
  const told = new Set();
  // the structure's model into the editor (a connection left out pruned and said)
  const apply = ({ renamed = null, own = false } = {}) => {
    clearTimeout(timer);
    if (closed) return;
    if (ed.busy?.()) { timer = setTimeout(() => apply({ renamed, own }), RETRY_MS); return; }
    const r = drawingModel(doc, path);
    if (!r) return;
    for (const x of r.dropped) {
      if (told.has(x.id)) continue;
      told.add(x.id);
      say(`WARNING: ${path}: a ${x.coll === 'transitions' ? 'transition' : 'connection'} (${x.id}) removed with what it connected, deleted by another participant.`);
    }
    if (r.dropped.length) pruneDrawing(doc, path, prune);
    if (!accept(r.model, path)) return;
    last = r.model;
    if (!same(r.model, modelOf(ed))) ed.applyModel(r.model, { renamed, mine: own });
  };
  const observer = (_events, tr) => { if (tr.origin !== origin && tr.origin !== prune) apply({ own: tr.origin === um }); };
  ymap.observeDeep(observer);
  ed.setShared({
    push(model, key) {
      if (closed) return;
      if (key === undefined || key !== lastKey) um.stopCapturing();
      lastKey = key ?? null;
      const { renamed } = putDrawing(doc, path, model, { base: last, client: doc.clientID, origin });
      last = drawingModel(doc, path)?.model ?? last;
      if (renamed.size || !same(last, modelOf(ed))) apply({ renamed });
    },
    undo: () => { um.undo(); },
    redo: () => { um.redo(); },
    canUndo: () => um.canUndo(),
    canRedo: () => um.canRedo(),
  });
  apply();
  return () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    ymap.unobserveDeep(observer);
    um.destroy();
    ed.setShared(null);
  };
}

/** The open drawings kept bound, those `editable(path)` says, each to its structure (`bound`: d -> { ymap, unbind });
 *  one whose document closed, whose structure changed (the drawing put again) or that may no longer be edited,
 *  unbound. */
export function keepDrawingsBound(bound, docs, doc, editable, opts = {}) {
  for (const [d, b] of bound) if (!docs.includes(d) || drawingMap(doc, d.path) !== b.ymap || !editable(d.path) || !editorOf(d)) { b.unbind(); bound.delete(d); }
  for (const d of docs) {
    if (bound.has(d) || !d.path || !editorOf(d) || !editable(d.path)) continue;
    const unbind = bindDrawing(d, doc, d.path, opts);
    if (unbind) bound.set(d, { ymap: drawingMap(doc, d.path), unbind });
  }
}
/** Every drawing unbound. */
export function unbindDrawings(bound) { for (const b of bound.values()) b.unbind(); bound.clear(); }
