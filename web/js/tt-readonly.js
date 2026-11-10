// The truth table editor's read-only mode (#3181: a shared project followed, as the FSM's and the ASM chart's, #2696):
// its outputs selected, the Karnaugh map and the results read (the notation, the groups, the 3D view), nothing
// changed: the names, the notes and the expression read only; Fill Table, the ⋮ menu (Algebra from Module, Handwritten
// Algebra), the cells' hint, the tick boxes, the solutions' arrows and the map's order not offered; a change that
// still comes (a key, the Development menu's drawing) is undone at once (truthtable.js `changed`). Its notice,
// `banner`, at the right end of the toolbar (docs/UI-GUIDELINES.md).

/** The editor's chrome made read only, once: `fields` read only, `hide` hidden, the notice at the toolbar's end. */
export function ttReadOnlyChrome({ root, toolbar, fields, hide, banner }) {
  root.classList.add('tt-readonly');
  for (const x of fields) x.readOnly = true;
  for (const x of hide) x.hidden = true;
  if (banner) toolbar.append(banner);
}

/** What each rendering makes again, locked: the tick boxes and the map's order disabled, the solutions' arrows hidden. */
export function lockTt(readOnly, root) {
  if (!readOnly) return;
  for (const x of root.querySelectorAll('.tt-hdl, .tt-kmap-order')) x.disabled = true;
  for (const x of root.querySelectorAll('.tt-sol-btn')) x.hidden = true;
}
