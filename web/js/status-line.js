// A document's status line (#2763, docs/UI-GUIDELINES.md): the one line at the bottom of every editor and viewer, as
// the Schematic editor's, saying what the document is now (its counts, its encoding, the cursor's line and column,
// what is under the mouse); its toolbar keeps its tools. Messages (errors, warnings, information) are the console's.
import { h } from './dom.js';

/** A field of the line: a text, or { text, cls, title }; empty ones are left out. */
const field = (f) => (typeof f === 'string' || typeof f === 'number' ? { text: String(f) } : f);

/** { el, set(fields, hint) } of a new status line: `fields` at its right, in order; `hint` (the schematic's tool's
 * tip) at its left, ellipsized when the line is narrow. `cls`: an editor's own class beside `doc-status`. */
export function statusLine(cls = '') {
  const el = h('div', { class: `doc-status${cls ? ` ${cls}` : ''}` });
  let last = null;
  function set(fields = [], hint = '') {
    const fs = fields.map(field).filter((f) => f && f.text);
    const key = JSON.stringify([hint, fs]);
    if (key === last) return;   // (redrawn on every mouse move: a text node kept keeps its translation)
    last = key;
    el.replaceChildren(h('span', { class: 'hint', text: hint }), h('span', { class: 'sp' }),
      ...fs.map((f) => h('span', { class: `ds-f${f.cls ? ` ${f.cls}` : ''}`, title: f.title, text: f.text })));
  }
  set();
  return { el, set };
}
