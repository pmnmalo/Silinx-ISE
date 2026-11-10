// A shared project's text files edited live (#3182, phase 2): an open text editor bound to its file's Y.Text in the
// project's document (core/collab-doc.js), on the owner's page and on an editor's (y-codemirror.next's ySync: what
// one types reaches the others as they type it, theirs reaches this editor). What it adds to the binding:
// - each participant's own undo: the others' changes are kept out of the editor's history (CodeMirror's, mapped through
//   them), so Undo / Redo (the main toolbar's, the keys) undo this participant's changes only;
// - a large change (a paste) made in pieces of PIECE characters, each a transaction and so an update of its own: every
//   frame within a follower's maximum (core/collab-room.js), as core/collab-doc.js editFile does;
// - the participants' carets stay those of editor-peers.js (from their view in the awareness, in the page's own
//   colours, their names as text): y-codemirror.next's remote selections are not used, since they put a participant's
//   colour, as it says it, into a style attribute.
//   bindEditor(editor, ytext) -> unbind()      keepBound(bound, docs, files, editable)      unbindAll(bound)
import { Compartment, EditorState, StateEffect, Transaction, Annotation } from '@codemirror/state';
import { ViewPlugin } from '@codemirror/view';
import * as Y from 'yjs';
import { setText } from '/core/collab-doc.js';
import { yCollab, ySyncAnnotation } from 'y-codemirror.next';

export const PIECE = 8192;
const piece = Annotation.define();   // (a piece of a large change: never split again)

// the others' changes out of this editor's history
const ownHistory = EditorState.transactionExtender.of(tr => (tr.annotation(ySyncAnnotation) ? { annotations: Transaction.addToHistory.of(false) } : null));

// a change that inserts more than PIECE characters: made again as pieces (the deletions first, then each insert in
// order of its place from the end, in PIECE-character pieces, no pair of surrogates split)
function largeChanges() {
  let view = null;
  const plugin = ViewPlugin.define(v => { view = v; return { destroy() { view = null; } }; });
  const filter = EditorState.transactionFilter.of(tr => {
    if (!tr.docChanged || tr.annotation(ySyncAnnotation) || tr.annotation(piece)) return tr;
    let n = 0;
    const ranges = [];
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, text) => { n += text.length; ranges.push({ from: fromA, to: toA, text: text.toString() }); });
    if (n <= PIECE || !view) return tr;
    const v = view, userEvent = tr.annotation(Transaction.userEvent) || 'input';
    queueMicrotask(() => {
      if (!v.dom.isConnected) return;
      for (const r of ranges.sort((a, b) => b.from - a.from)) {
        if (r.to > r.from) v.dispatch({ changes: { from: r.from, to: r.to }, annotations: [piece.of(true), Transaction.userEvent.of(userEvent)] });
        for (let i = 0; i < r.text.length;) {
          let j = Math.min(r.text.length, i + PIECE);
          if (j < r.text.length && /[\uD800-\uDBFF]/.test(r.text[j - 1])) j--;
          const at = r.from + i;
          v.dispatch({ changes: { from: at, insert: r.text.slice(i, j) }, selection: { anchor: at + j - i }, annotations: [piece.of(true), Transaction.userEvent.of(userEvent)] });
          i = j;
        }
      }
    });
    return [];
  });
  return [plugin, filter];
}

/** An editor (web/js/editor.js) bound to a Y.Text: their texts first made the same, the editor's into the Y.Text (the
 *  owner's: their unsaved changes kept, `mine`) or the Y.Text's into the editor (an editor's page); unbind() ends it. */
export function bindEditor(editor, ytext, { mine = false } = {}) {
  const view = editor.view;
  if (!view) return () => {};
  const slot = new Compartment();
  const text = ytext.toString(), here = view.state.doc.toString();
  if (here !== text && mine) setText(ytext, here);
  else if (here !== text) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, annotations: Transaction.addToHistory.of(false) });
  view.dispatch({ effects: StateEffect.appendConfig.of(slot.of([yCollab(ytext, null, { undoManager: false }), ownHistory, largeChanges()])) });
  return () => { if (view.dom.isConnected) view.dispatch({ effects: slot.reconfigure([]) }); };
}

/** The open text editors kept bound, those `editable(path)` says, each to its file's Y.Text (`bound`: d -> { yt,
 *  unbind }); one whose document closed, whose file's Y.Text changed (a rename, the project published again) or that
 *  may no longer be edited, unbound. */
export function keepBound(bound, docs, files, editable, { mine = false } = {}) {
  for (const [d, b] of bound) if (!docs.includes(d) || files.get(d.path) !== b.yt || !editable(d.path)) { b.unbind(); bound.delete(d); }
  for (const d of docs) {
    if (bound.has(d) || !d.editor?.view || !d.path || !editable(d.path)) continue;
    const yt = files.get(d.path);
    if (yt instanceof Y.Text) bound.set(d, { yt, unbind: bindEditor(d.editor, yt, { mine }) });
  }
}
/** Every editor unbound. */
export function unbindAll(bound) { for (const b of bound.values()) b.unbind(); bound.clear(); }
