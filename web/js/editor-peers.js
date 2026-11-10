// The other participants' cursors in a text editor (#3181): a shared project's owner and followers (core/collab-
// client.js), each a caret in their colour with their name above it. Positions are 0-based { line, ch }, given as
// offsets by the editor (setPeers of web/js/editor.js); a change of the text moves them with it until they come again.
import { StateEffect, StateField } from '@codemirror/state';
import { EditorView, Decoration, WidgetType } from '@codemirror/view';

/** The participants' carets: [{ name, color, pos (an offset) }]. */
export const setPeersEffect = StateEffect.define();

class Caret extends WidgetType {
  constructor(name, color) { super(); this.name = name; this.color = color; }
  eq(o) { return o.name === this.name && o.color === this.color; }
  toDOM() {
    const caret = document.createElement('span');
    caret.className = 'cm-peer-caret';
    caret.style.borderLeftColor = this.color;
    const tag = document.createElement('span');
    tag.className = 'cm-peer-name';
    tag.dataset.noI18n = '';   // (a name: never translated)
    tag.style.background = this.color;
    tag.textContent = this.name;
    caret.append(tag);
    return caret;
  }
  ignoreEvent() { return true; }
}

export const peersField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    let d = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setPeersEffect)) d = Decoration.set(e.value.map(p => Decoration.widget({ widget: new Caret(p.name, p.color), side: 1 }).range(p.pos)), true);
    }
    return d;
  },
  provide: f => EditorView.decorations.from(f),
});

/** An editor's setPeers([{ name, color, line, ch }]) (0-based positions; offsetOf the editor's): the carets shown, drawn
 *  again only when they change. */
export function peerSetter(view, offsetOf) {
  let shown = '[]';
  return list => {
    const k = JSON.stringify(list);
    if (k === shown) return;
    shown = k;
    view().dispatch({ effects: setPeersEffect.of(list.map(p => ({ name: p.name, color: p.color, pos: offsetOf(p) }))) });
  };
}
