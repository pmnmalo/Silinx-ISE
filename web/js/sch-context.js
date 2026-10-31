// The schematic editor's right-click menu (#1546, #1556) on a symbol, an I/O marker or a net name: Rename… (sch-rename.js)
// of the object clicked; Duplicate, Rotate, Mirror and Delete (sch-select.js, the toolbar's and the keys' commands) of
// the selection when the object is part of it, else of the object alone (then selected).
import { popupMenu } from './ui.js';
import { KEYS } from './sch-editor.js';
import { TITLES } from './sch-rename.js';

/** { contextMenu } of mountSchEditor (doc(), live(), sel(), tool(): its current values). */
export function mountSchContext(ctx) {
  const { readOnly, doc, live, segSel, sel, tool, setSel, render, renderProps, rename, duplicateSel, rotateSel, mirrorSel, deleteSel } = ctx;

  function contextMenu(e, it) {
    if (readOnly || live() || tool() !== 'select' || !it || !TITLES[it.kind] || !doc()[KEYS[it.kind]]?.some(o => o.id === it.id)) return;
    const key = `${it.kind}:${it.id}`;
    if (!sel().has(key)) setSel(it.kind === 'wire' ? segSel.branch(it.id) : new Set([key]));
    render(); renderProps();
    // (what applies to the selection: Duplicate, Rotate and Mirror to its symbols and I/O markers)
    const parts = [...sel()].some(k => k.startsWith('sym:') || k.startsWith('port:'));
    popupMenu([
      { label: 'Rename…', action: () => rename(it) },
      '-',
      parts && { label: 'Duplicate', action: duplicateSel },
      parts && { label: 'Rotate', action: rotateSel, shortcut: 'Ctrl+R' },
      parts && { label: 'Mirror', action: mirrorSel, shortcut: 'Ctrl+M' },
      parts && '-',
      { label: 'Delete', action: deleteSel, shortcut: 'Del' },
    ], e.clientX, e.clientY);
  }

  return { contextMenu };
}
