// The schematic editor's side panels folded (#1713): the Symbols panel (left) and the Properties panel (right) collapse
// into a thin strip with their name down the side, by a button in their title, and expand again by a click on the
// strip; for a small window or a document in the split view, where the canvas is left a narrow strip. Remembered per
// viewer. Under 1024 px (#266, narrow.js) the panels go over the canvas instead, by the toolbar's buttons: no folding.
// The look: sch-editor.css (.sym-folded, .props-folded). mountSchPanels(ctx) is called by mountSchEditor.
import { h } from './dom.js';
import { prefKey } from './prefs.js';

const CHEVRON = { left: '<path d="M10 3.5L5.5 8l4.5 4.5"/>', right: '<path d="M6 3.5L10.5 8 6 12.5"/>' };
const svg = (dir) => `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${dir === 'left' ? CHEVRON.left : CHEVRON.right}</svg>`;
const PANELS = {
  // (the side the panel folds towards: its chevron when open; the other way when folded)
  symbols: { cls: 'sym-folded', key: 'silinx.sch.symbols.folded', toward: 'left', open: 'Collapse the Symbols panel', folded: 'Expand the Symbols panel' },
  props: { cls: 'props-folded', key: 'silinx.sch.props.folded', toward: 'right', open: 'Collapse the Properties panel', folded: 'Expand the Properties panel' },
};
const away = (d) => (d === 'left' ? 'right' : 'left');

/** { setFolded(panel, folded) } of mountSchEditor: `left` and `right` the panels, their title (.se-cap) first. */
export function mountSchPanels({ container, left, right }) {
  const buttons = {};
  function setFolded(panel, folded, remember = true) {
    const p = PANELS[panel], b = buttons[panel];
    container.classList.toggle(p.cls, folded);
    const title = folded ? p.folded : p.open;
    b.title = title; b.setAttribute('aria-label', title); b.setAttribute('aria-expanded', String(!folded));
    b.innerHTML = svg(folded ? away(p.toward) : p.toward);
    if (remember) try { localStorage.setItem(prefKey(p.key), folded ? '1' : '0'); } catch { /* storage unavailable */ }
    dispatchEvent(new Event('resize'));
  }
  for (const [panel, el] of [['symbols', left], ['props', right]]) {
    const cap = el.querySelector('.se-cap');
    const b = h('button', { type: 'button', class: 'se-fold', 'data-fold': panel });
    buttons[panel] = b;
    cap.append(h('span', { class: 'sp' }), b);
    // folded: a click anywhere on the strip expands it
    el.addEventListener('click', (e) => {
      if (e.target.closest('.se-fold')) setFolded(panel, !container.classList.contains(PANELS[panel].cls));
      else if (container.classList.contains(PANELS[panel].cls)) setFolded(panel, false);
    });
    let folded = false;
    try { folded = localStorage.getItem(prefKey(PANELS[panel].key)) === '1'; } catch { /* default */ }
    setFolded(panel, folded, false);
  }
  return { setFolded };
}
