// The Properties panel of the ASM, FSM and Petri net editors folded, as the schematic editor's (#2505, sch-panels.js):
// a thin strip with its name down the side, by a button in its title, expanded again by a click on the strip.
// Remembered per viewer and per editor (`key`). Under 1024 px the panel goes over the canvas instead (narrow.js): no
// folding. The look: asm-editor.css (.props-folded).
import { h } from './dom.js';
import { prefKey } from './prefs.js';
import { foldChevron } from './sch-panels.js';

/** The side panel `side` of the editor `root` foldable, its title (.asm-cap) first; `key`: its preference. */
export function mountSideFold({ root, side, key }) {
  const cap = side.querySelector('.asm-cap');
  const b = h('button', { type: 'button', class: 'asm-fold', 'data-fold': 'props' });
  cap.append(h('span', { class: 'sp' }), b);
  function setFolded(folded, remember = true) {
    root.classList.toggle('props-folded', folded);
    const title = folded ? 'Expand the Properties panel' : 'Collapse the Properties panel';
    b.title = title; b.setAttribute('aria-label', title); b.setAttribute('aria-expanded', String(!folded));
    b.innerHTML = foldChevron(folded ? 'left' : 'right');
    if (remember) try { localStorage.setItem(prefKey(key), folded ? '1' : '0'); } catch { /* storage unavailable */ }
    dispatchEvent(new Event('resize'));
  }
  // folded: a click anywhere on the strip expands it
  side.addEventListener('click', (e) => {
    if (e.target.closest('.asm-fold')) setFolded(!root.classList.contains('props-folded'));
    else if (root.classList.contains('props-folded')) setFolded(false);
  });
  let folded = false;
  try { folded = localStorage.getItem(prefKey(key)) === '1'; } catch { /* default */ }
  setFolded(folded, false);
  return { setFolded };
}
