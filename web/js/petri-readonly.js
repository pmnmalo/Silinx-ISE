// The Petri net editor's read-only mode (#3181: a shared project followed, as the FSM's and the ASM chart's, #2696):
// the net moved about, zoomed, its places, transitions and arcs selected and their properties shown, its token game
// played and analysed; nothing changed: the drawing tools, Delete and Import PNML hidden, the side panel's fields
// disabled, no node moved, no key that edits; a change that still comes is undone at once (petri-editor.js `commit`).
// Its notice, `banner`, at the right end of the toolbar (docs/UI-GUIDELINES.md).

/** The editor's chrome made read only, once. */
export function petriReadOnlyChrome({ root, toolbar, banner }) {
  root.classList.add('asm-readonly');
  const groups = [...toolbar.children].filter((g) => g.querySelector('.pn-tool, .asm-danger'));
  for (const g of [...groups, ...groups.map((g) => g.nextElementSibling)]) g.hidden = true;
  for (const b of toolbar.querySelectorAll('.pn-pnml-in')) b.hidden = true;
  if (banner) toolbar.append(banner);
}

/** The side panel, as each rendering makes it, locked: its fields and buttons disabled (its folds apart). */
export function lockPetriSide(readOnly, side) {
  if (readOnly) for (const x of side.querySelectorAll('input, textarea, select, button:not(.asm-fold)')) x.disabled = true;
}
